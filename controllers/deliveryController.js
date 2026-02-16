const supabase = require('../utils/supabase');

const getAvailableOrders = async (req, res) => {
  try {
    // return only delivery orders that are not assigned yet and pending/confirmed
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, restaurant:restaurant_id(name, address, lat, lng)')
      .eq('type', 'delivery')
      .is('driver_id', null)
      .in('status', ['pending', 'preparing', 'ready_for_pickup']) 
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const acceptOrder = async (req, res) => {
  try {
    const { driverId, orderId } = req.validated.body;
    
    // Security check: ensure the authenticated driver is the one accepting
    if (req.user.id !== driverId) {
      return res.status(403).json({ message: 'Forbidden: Cannot accept for another driver' });
    }

    // Atomic update: only update if driver_id is NULL
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'accepted',
        driver_id: driverId,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .is('driver_id', null) // Critical: Ensure no one else took it
      .select()
      .single();

    if (updateError || !updatedOrder) {
        return res.status(409).json({ message: 'Order already accepted or not found' });
    }

    const io = req.app.locals.io;
    if (io) {
        // Notify Restaurant (Room: restaurant_{id})
        io.to(`restaurant_${updatedOrder.restaurant_id}`).emit('delivery:update', { type: 'accepted', orderId, driverId });
        // Notify User (Room: user_{id})
        io.to(`user_${updatedOrder.user_id}`).emit('delivery:update', { type: 'accepted', orderId, driverId });
        // Notify Tracking Room
        io.to(`order_${orderId}`).emit('delivery:update', { type: 'accepted', orderId, driverId });
    }
    
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDriverOrders = async (req, res) => {
  try {
    const { driverId } = req.params;
    if (req.user.id !== driverId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, restaurant:restaurant_id(name, address, lat, lng)')
      .eq('driver_id', driverId)
      .neq('status', 'delivered')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateDriverLocation = async (req, res) => {
    try {
        const { driverId, lat, lng } = req.body;
        
        if (req.user.id !== driverId) return res.status(403).json({ message: 'Forbidden' });

        const { error } = await supabase
            .from('driver_locations')
            .upsert({ driver_id: driverId, lat, lng, updated_at: new Date().toISOString() });

        if (error) throw error;

        // Emit location update via Socket.IO for real-time tracking
        const io = req.app.locals.io;
        if (io) {
            // Find active orders for this driver to notify specific customers
            const { data: activeOrders } = await supabase
                .from('orders')
                .select('id')
                .eq('driver_id', driverId)
                .in('status', ['accepted', 'picked_up', 'preparing', 'ready_for_pickup']);

            if (activeOrders && activeOrders.length > 0) {
                activeOrders.forEach(order => {
                     // Notify the order room (User & Restaurant listening)
                     io.to(`order_${order.id}`).emit('driver:location', { driverId, lat, lng });
                });
            }
        }

        res.json({ message: 'Location updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getDriverLocation = async (req, res) => {
    try {
        const { driverId } = req.params;
        const requester = req.user;

        // Authorization: 
        // - Driver can view own location
        // - Admin/super_admin can view any
        // - Customer can view only if they have an active order with this driver
        if (requester.role === 'driver' && requester.id !== driverId) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        if (requester.role === 'customer') {
          const { data: ordersForCustomer, error: ordErr } = await supabase
            .from('orders')
            .select('id')
            .eq('user_id', requester.id)
            .eq('driver_id', driverId)
            .in('status', ['accepted', 'picked_up', 'on_the_way', 'preparing', 'ready_for_pickup'])
            .limit(1);
          if (ordErr) return res.status(500).json({ message: ordErr.message });
          if (!ordersForCustomer || ordersForCustomer.length === 0) {
            return res.status(403).json({ message: 'Forbidden' });
          }
        }
        const { data: loc, error } = await supabase
          .from('driver_locations')
          .select('*')
          .eq('driver_id', driverId)
          .single();
    
        if (error || !loc) return res.status(404).json({ message: 'Location not found' });
        res.json(loc);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
};

module.exports = {
    getAvailableOrders,
    acceptOrder,
    getDriverOrders,
    updateDriverLocation,
    getDriverLocation
};
