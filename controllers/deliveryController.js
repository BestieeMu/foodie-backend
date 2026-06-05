const supabase = require('../utils/supabase');

function redactDeliveryCode(order) {
  if (!order) return order;
  const { delivery_verification_code, ...safeOrder } = order;
  return safeOrder;
}

const getAvailableOrders = async (req, res, next) => {
  try {
    // return only delivery orders that are not assigned yet and pending/confirmed
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, restaurant:restaurant_id(name, address)')
      .eq('type', 'delivery')
      .is('driver_id', null)
      .in('status', ['pending', 'preparing', 'ready_for_pickup']) 
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw error;
    res.json((orders || []).map(redactDeliveryCode));
  } catch (error) {
    next(error);
  }
};

const acceptOrder = async (req, res, next) => {
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
        driver_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .is('driver_id', null) // Critical: Ensure no one else took it
      .select()
      .single();

    if (updateError || !updatedOrder) {
        return res.status(409).json({ message: 'Order already accepted or not found' });
    }

    // Mark driver as busy
    await supabase
      .from('driver_locations')
      .upsert({
        driver_id: driverId,
        is_busy: true,
        current_order_id: orderId,
        last_heartbeat: new Date().toISOString(),
      });

    // Record routing history
    const routingHistory = updatedOrder.routing_history || [];
    routingHistory.push({
      event: 'driver_accepted',
      driverId,
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from('orders')
      .update({ routing_history: routingHistory })
      .eq('id', orderId);

    const io = req.app.locals.io;
    if (io) {
        // Notify Restaurant (Room: restaurant_{id})
        io.to(`restaurant_${updatedOrder.restaurant_id}`).emit('delivery:update', { type: 'accepted', orderId, driverId });
        // Notify User (Room: user_{id})
        io.to(`user_${updatedOrder.user_id}`).emit('delivery:update', { type: 'accepted', orderId, driverId });
        // Notify Tracking Room
        io.to(`order_${orderId}`).emit('delivery:update', { type: 'accepted', orderId, driverId });
    }
    
    res.json(redactDeliveryCode(updatedOrder));
  } catch (error) {
    next(error);
  }
};

const getDriverOrders = async (req, res, next) => {
  try {
    const { driverId } = req.params;
    if (req.user.id !== driverId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, restaurant:restaurant_id(name, address)')
      .eq('driver_id', driverId)
      .neq('status', 'delivered')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json((orders || []).map(redactDeliveryCode));
  } catch (error) {
    next(error);
  }
};

const updateDriverLocation = async (req, res, next) => {
    try {
        const { driverId, lat, lng } = req.validated.body;
        
        if (req.user.id !== driverId) return res.status(403).json({ message: 'Forbidden' });

        // Check if driver has active orders to auto-set busy flag
        const { data: activeOrders } = await supabase
            .from('orders')
            .select('id')
            .eq('driver_id', driverId)
            .in('status', ['accepted', 'picked_up', 'on_the_way', 'preparing', 'ready_for_pickup'])
            .limit(1);

        const isBusy = activeOrders && activeOrders.length > 0;
        const currentOrderId = isBusy ? activeOrders[0].id : null;

        const { error } = await supabase
            .from('driver_locations')
            .upsert({
              driver_id: driverId,
              lat,
              lng,
              is_busy: isBusy,
              current_order_id: currentOrderId,
              last_heartbeat: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

        if (error) throw error;

        // Emit location update via Socket.IO for real-time tracking
        const io = req.app.locals.io;
        if (io) {
            // Find active orders for this driver to notify specific customers
            const { data: allActiveOrders } = await supabase
                .from('orders')
                .select('id')
                .eq('driver_id', driverId)
                .in('status', ['accepted', 'picked_up', 'preparing', 'ready_for_pickup', 'on_the_way']);

            if (allActiveOrders && allActiveOrders.length > 0) {
                allActiveOrders.forEach(order => {
                     // Notify the order room (User & Restaurant listening)
                     io.to(`order_${order.id}`).emit('driver:location', { driverId, lat, lng });
                });
            }
        }

        res.json({ message: 'Location updated' });
    } catch (error) {
        next(error);
    }
};

const getDriverLocation = async (req, res, next) => {
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
        next(error);
      }
};

/**
 * Driver heartbeat — periodic liveness check with location + busy status
 */
const updateDriverHeartbeat = async (req, res, next) => {
  try {
    const { driverId, lat, lng, isBusy } = req.validated.body;

    if (req.user.id !== driverId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const updateData = {
      driver_id: driverId,
      lat,
      lng,
      last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (typeof isBusy === 'boolean') {
      updateData.is_busy = isBusy;
    }

    const { error } = await supabase
      .from('driver_locations')
      .upsert(updateData);

    if (error) throw error;

    res.json({ message: 'Heartbeat received' });
  } catch (error) {
    next(error);
  }
};

const orderController = require('./orderController');

const pickupOrder = async (req, res, next) => {
  req.validated = {
    body: { status: 'picked_up' },
    params: { orderId: req.params.orderId }
  };
  return orderController.updateOrderStatus(req, res, next);
};

const completeOrder = async (req, res, next) => {
  req.validated = {
    body: { status: 'delivered', deliveryCode: req.body?.deliveryCode },
    params: { orderId: req.params.orderId }
  };
  return orderController.updateOrderStatus(req, res, next);
};

module.exports = {
    getAvailableOrders,
    acceptOrder,
    getDriverOrders,
    updateDriverLocation,
    getDriverLocation,
    updateDriverHeartbeat,
    pickupOrder,
    completeOrder
};

