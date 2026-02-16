const supabase = require('../utils/supabase');
const { calcItemPrice, calculateOrderCosts } = require('../utils/calculations');
const { v4: uuidv4 } = require('uuid');

const createOrder = async (req, res) => {
  try {
    const { userId, restaurantId, items, type = 'delivery', schedule, pickupAddress, deliveryAddress, gift = false, giftMessage, recipientName } = req.validated.body;
    
    // 1. Fetch dependencies in parallel
    const [restResult, menuResult, settingsResult] = await Promise.all([
      supabase.from('restaurants').select('*').eq('id', restaurantId).single(),
      supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId),
      supabase.from('system_settings').select('*').single()
    ]);

    const { data: rest, error: restError } = restResult;
    const { data: menuItems, error: menuError } = menuResult;
    const { data: settings, error: settingsError } = settingsResult;
    
    if (restError || !rest) return res.status(400).json({ message: 'Invalid restaurant' });
    if (menuError) return res.status(500).json({ message: 'Failed to fetch menu' });
    
    if (type === 'delivery' && (!pickupAddress || !deliveryAddress)) return res.status(400).json({ message: 'Addresses required for delivery' });

    const orderItems = [];
    
    for (const it of (items || [])) {
        const menuItem = menuItems.find(mi => mi.id === it.itemId);
        if (!menuItem) {
            return res.status(400).json({ message: `Item ${it.itemId} not found or unavailable` });
        }
        if (!menuItem.is_available) {
             return res.status(400).json({ message: `Item ${menuItem.name} is currently unavailable` });
        }

        const quantity = it.quantity || 1;
        const choice = it.choice || {};
        const price = calcItemPrice(menuItem, choice);
        
        orderItems.push({ 
            itemId: menuItem.id, 
            name: menuItem.name, 
            quantity, 
            price, 
            choice 
        });
    }

    if (!orderItems.length) return res.status(400).json({ message: 'No valid items' });

    const taxRate = settings?.tax_rate || 5; // Default 5%
    const deliveryFee = type === 'delivery' ? (settings?.delivery_fee || 5.00) : 0;

    const costs = calculateOrderCosts(orderItems, taxRate, deliveryFee);
    
    // 3. Create Order Object
    const orderId = uuidv4();
    const order = {
      id: orderId,
      user_id: userId,
      restaurant_id: restaurantId,
      type, 
      status: schedule ? 'scheduled' : 'pending', // If scheduled, status might differ
      items: orderItems,
      total: costs.total,
      subtotal: costs.subtotal,
      tax: costs.tax,
      delivery_fee: costs.deliveryFee,
      delivery_address: type === 'delivery' ? deliveryAddress : undefined,
      pickup_address: pickupAddress, // Might be needed for driver
      payment_status: 'pending',
      created_at: new Date().toISOString(),
      schedule: schedule || null
    };

    // 4. Insert into DB
    const { error } = await supabase.from('orders').insert(order);
    
    if (error) {
      console.error('Order create error:', error);
      throw error;
    }

    // 5. Notify via Socket.IO
    const io = req.app.locals.io;
    if (io) {
        // Notify Restaurant Admin (Room: restaurant_{id})
        io.to(`restaurant_${restaurantId}`).emit('orders:update', { type: 'created', order });
        // Notify User (Room: user_{id})
        io.to(`user_${userId}`).emit('orders:update', { type: 'created', order });
    }
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Create Order Error:', error);
    res.status(500).json({ message: 'Failed to create order', error: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { data: order, error } = await supabase
        .from('orders')
        .select('*, restaurant:restaurant_id(name, image_url, phone), driver:driver_id(name, phone, lat, lng)')
        .eq('id', orderId)
        .single();

    if (error || !order) return res.status(404).json({ message: 'Order not found' });
    
    // Security check
    const user = req.user;
    if (order.user_id !== user.id && order.driver_id !== user.id && user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { data: userOrders, error } = await supabase
      .from('orders')
      .select('*, restaurant:restaurant_id(name, image_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(userOrders || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.validated.body;
    const user = req.user;
    
    const { data: order, error: fetchError } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (fetchError || !order) return res.status(404).json({ message: 'Order not found' });
    
    // Authorization Check
    const isOwner = order.user_id === user.id;
    const isDriver = order.driver_id === user.id;
    const isRestaurantAdmin = user.role === 'admin' && user.restaurant_id === order.restaurant_id;
    const isSuperAdmin = user.role === 'super_admin';

    // Role-based status restrictions
    if (status === 'cancelled') {
        if (!isOwner && !isRestaurantAdmin && !isSuperAdmin) {
            return res.status(403).json({ message: 'Only order owner or admin can cancel' });
        }
        // Cannot cancel if already preparing or beyond
        if (!['pending', 'scheduled', 'accepted'].includes(order.status) && !isSuperAdmin) {
            return res.status(400).json({ message: 'Order cannot be cancelled at this stage' });
        }
    } else if (['accepted', 'preparing', 'ready_for_pickup'].includes(status)) {
        if (!isRestaurantAdmin && !isSuperAdmin) {
            return res.status(403).json({ message: 'Only restaurant staff can update this status' });
        }
    } else if (['picked_up', 'delivered'].includes(status)) {
        if (!isDriver && !isSuperAdmin) {
            return res.status(403).json({ message: 'Only assigned driver can update this status' });
        }
    }

    // Logic to ensure correct transitions
    const validTransitions = {
      'pending': ['accepted', 'rejected', 'cancelled'],
      'scheduled': ['pending', 'cancelled'],
      'accepted': ['preparing', 'ready_for_pickup', 'cancelled'], // 'cancelled' by admin/system
      'preparing': ['ready_for_pickup', 'cancelled'],
      'ready_for_pickup': ['picked_up', 'cancelled'],
      'picked_up': ['delivered'],
      'delivered': [],
      'rejected': [],
      'cancelled': []
    };

    const currentStatus = order.status;
    const allowed = validTransitions[currentStatus];
    
    // Skip check for admin or if explicitly forcing (optional, but good for safety)
    // For now, enforce strict transitions unless it's the same status (idempotency)
    if (status !== currentStatus && (!allowed || !allowed.includes(status))) {
        // Special case: Drivers might skip 'preparing' if restaurant manages that manually
        // But generally, we want a flow. Let's be slightly flexible if needed, or strict.
        // Strict is better for now.
        return res.status(400).json({ 
            message: `Invalid status transition from ${currentStatus} to ${status}` 
        });
    }

    const { data: updated, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    if (status === 'delivered') {
      try {
        const { data: settings } = await supabase.from('system_settings').select('*').single();
        const driverEarning = Number(updated.delivery_fee);
        if (updated.driver_id && driverEarning > 0) {
          const { data: driverWalletSel } = await supabase
            .from('wallet_accounts')
            .select('*')
            .eq('owner_type', 'driver')
            .eq('owner_id', updated.driver_id)
            .single();
          let driverWallet = driverWalletSel;
          if (!driverWallet) {
            const { data: created } = await supabase
              .from('wallet_accounts')
              .insert({ owner_type: 'driver', owner_id: updated.driver_id })
              .select()
              .single();
            driverWallet = created;
          }
          await supabase
            .from('wallet_accounts')
            .update({ balance: Number(driverWallet.balance || 0) + driverEarning, updated_at: new Date().toISOString() })
            .eq('id', driverWallet.id);
          await supabase.from('wallet_transactions').insert({
            wallet_id: driverWallet.id,
            type: 'credit',
            amount: driverEarning,
            reference: `order_${updated.id}_driver`,
            description: 'Delivery earning',
            status: 'success'
          });
          await supabase.from('earnings_ledger').insert({
            order_id: updated.id,
            restaurant_id: updated.restaurant_id,
            driver_id: updated.driver_id,
            subtotal: updated.subtotal,
            tax: updated.tax,
            delivery_fee: updated.delivery_fee,
            platform_commission: 0,
            restaurant_earning: 0,
            driver_earning: driverEarning,
            status: 'paid_out'
          });
        }
      } catch (e) {}
    }

    // Real-time update
    const io = req.app.locals.io;
    if (io) {
        // Notify tracking screen (Room: order_{id})
        io.to(`order_${orderId}`).emit('orders:update', { type: 'status', status, orderId });
        // Notify User (Room: user_{id})
        io.to(`user_${order.user_id}`).emit('orders:update', { type: 'updated', order: updated });
        // Notify Restaurant (Room: restaurant_{id})
        io.to(`restaurant_${order.restaurant_id}`).emit('orders:update', { type: 'updated', order: updated });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
    createOrder,
    getOrderById,
    getUserOrders,
    updateOrderStatus
};
