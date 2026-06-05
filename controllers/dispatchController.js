const supabase = require('../utils/supabase');

/**
 * Haversine distance between two lat/lng points in kilometers
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// In-memory dispatch state for active dispatch processes
const activeDispatches = new Map(); // orderId -> { timer, attemptIndex, drivers }

/**
 * Find nearby idle drivers sorted by distance
 */
async function findNearbyDrivers(lat, lng, radiusKm = 5, excludeDriverIds = []) {
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min

  const { data: locations, error } = await supabase
    .from('driver_locations')
    .select('driver_id, lat, lng, is_busy, last_heartbeat')
    .eq('is_busy', false)
    .gte('last_heartbeat', staleThreshold);

  if (error || !locations) return [];

  // Filter by radius and exclude already-attempted drivers
  const nearby = locations
    .filter(loc => !excludeDriverIds.includes(loc.driver_id))
    .map(loc => ({
      driverId: loc.driver_id,
      lat: loc.lat,
      lng: loc.lng,
      distance: haversineKm(lat, lng, loc.lat, loc.lng),
    }))
    .filter(d => d.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);

  return nearby;
}

/**
 * Dispatch order to nearest available driver
 * Push model: system pings drivers one-by-one, nearest first
 */
const dispatchOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    // Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, restaurant:restaurant_id(name, address, latitude, longitude)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.driver_id) {
      return res.status(400).json({ message: 'Order already has a driver assigned' });
    }

    // Determine pickup location
    const pickupLat = order.restaurant?.latitude || order.pickup_address?.latitude;
    const pickupLng = order.restaurant?.longitude || order.pickup_address?.longitude;

    if (!pickupLat || !pickupLng) {
      return res.status(400).json({ message: 'Order has no pickup coordinates for dispatch' });
    }

    // Cancel any existing dispatch for this order
    if (activeDispatches.has(orderId)) {
      clearTimeout(activeDispatches.get(orderId).timer);
      activeDispatches.delete(orderId);
    }

    // Find nearby drivers
    const nearbyDrivers = await findNearbyDrivers(pickupLat, pickupLng, 10);

    if (nearbyDrivers.length === 0) {
      return res.status(200).json({ 
        message: 'No available drivers nearby. Order added to queue.',
        driversFound: 0,
      });
    }

    // Start dispatch process - ping first driver
    const io = req.app.locals.io;
    const dispatchState = {
      orderId,
      order,
      drivers: nearbyDrivers,
      attemptIndex: 0,
      attemptedDriverIds: [],
      timer: null,
      io,
    };

    activeDispatches.set(orderId, dispatchState);

    // Ping the first driver
    await pingNextDriver(dispatchState);

    // Record routing history
    const routingHistory = order.routing_history || [];
    routingHistory.push({
      event: 'dispatch_started',
      timestamp: new Date().toISOString(),
      driversFound: nearbyDrivers.length,
    });

    await supabase
      .from('orders')
      .update({ routing_history: routingHistory })
      .eq('id', orderId);

    res.json({
      message: 'Dispatch initiated',
      driversFound: nearbyDrivers.length,
      firstDriver: {
        distance: nearbyDrivers[0].distance.toFixed(2) + ' km',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Ping the next driver in the dispatch queue
 */
async function pingNextDriver(dispatchState) {
  const { orderId, order, drivers, attemptIndex, io } = dispatchState;

  if (attemptIndex >= drivers.length) {
    // All drivers exhausted
    activeDispatches.delete(orderId);
    console.log(`Dispatch exhausted for order ${orderId}: no driver accepted`);

    if (io) {
      io.to(`restaurant_${order.restaurant_id}`).emit('dispatch:exhausted', {
        orderId,
        message: 'No nearby drivers available. Order remains in queue.',
      });
    }
    return;
  }

  const driver = drivers[attemptIndex];
  dispatchState.attemptedDriverIds.push(driver.driverId);

  // Log dispatch attempt
  await supabase.from('dispatch_attempts').insert({
    order_id: orderId,
    driver_id: driver.driverId,
    status: 'pending',
    distance_km: driver.distance.toFixed(2),
  });

  // Compute order preview for driver
  const deliveryLat = order.delivery_address?.latitude;
  const deliveryLng = order.delivery_address?.longitude;
  let dropOffDistance = null;
  if (deliveryLat && deliveryLng) {
    dropOffDistance = haversineKm(driver.lat, driver.lng, deliveryLat, deliveryLng);
  }

  const orderPreview = {
    orderId,
    restaurantName: order.restaurant?.name || 'Restaurant',
    pickupAddress: order.pickup_address?.address || order.restaurant?.address || '',
    dropOffAddress: order.delivery_address?.address || '',
    pickupDistance: driver.distance.toFixed(1),
    dropOffDistance: dropOffDistance ? dropOffDistance.toFixed(1) : null,
    earnings: Number(order.delivery_fee || 0),
    itemCount: Array.isArray(order.items) ? order.items.length : 0,
    total: order.total,
  };

  // Emit dispatch request to specific driver
  if (io) {
    io.to(`user_${driver.driverId}`).emit('dispatch:request', orderPreview);
  }

  // Set timeout (30 seconds) - if no response, move to next driver
  dispatchState.timer = setTimeout(async () => {
    // Mark attempt as timed out
    await supabase
      .from('dispatch_attempts')
      .update({ status: 'timeout', responded_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('driver_id', driver.driverId)
      .eq('status', 'pending');

    // Move to next driver
    dispatchState.attemptIndex++;
    await pingNextDriver(dispatchState);
  }, 30000);
}

/**
 * Driver responds to a dispatch request (accept/decline)
 */
const respondToDispatch = async (req, res, next) => {
  try {
    const { driverId, orderId, accepted } = req.validated.body;

    if (req.user.id !== driverId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const dispatchState = activeDispatches.get(orderId);

    // Update dispatch attempt record
    await supabase
      .from('dispatch_attempts')
      .update({
        status: accepted ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('driver_id', driverId)
      .eq('status', 'pending');

    if (accepted) {
      // Cancel the timeout
      if (dispatchState) {
        clearTimeout(dispatchState.timer);
        activeDispatches.delete(orderId);
      }

      // Assign driver to order (atomic, ensure no one else took it)
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          driver_id: driverId,
          status: 'accepted',
          driver_accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .is('driver_id', null)
        .select()
        .single();

      if (updateError || !updatedOrder) {
        return res.status(409).json({ message: 'Order already accepted by another driver' });
      }

      // Mark driver as busy
      await supabase
        .from('driver_locations')
        .update({
          is_busy: true,
          current_order_id: orderId,
          last_heartbeat: new Date().toISOString(),
        })
        .eq('driver_id', driverId);

      // Record in routing history
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

      // Notify via Socket.IO
      const io = req.app.locals.io;
      if (io) {
        io.to(`restaurant_${updatedOrder.restaurant_id}`).emit('delivery:update', {
          type: 'accepted', orderId, driverId,
        });
        io.to(`user_${updatedOrder.user_id}`).emit('delivery:update', {
          type: 'accepted', orderId, driverId,
        });
        io.to(`order_${orderId}`).emit('delivery:update', {
          type: 'accepted', orderId, driverId,
        });
      }

      return res.json({ message: 'Dispatch accepted', order: updatedOrder });
    } else {
      // Driver declined — move to next
      if (dispatchState) {
        clearTimeout(dispatchState.timer);
        dispatchState.attemptIndex++;
        await pingNextDriver(dispatchState);
      }

      return res.json({ message: 'Dispatch declined' });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get dispatch status for an order
 */
const getDispatchStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const { data: attempts, error } = await supabase
      .from('dispatch_attempts')
      .select('*, driver:driver_id(name)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const isActive = activeDispatches.has(orderId);

    res.json({
      orderId,
      isDispatching: isActive,
      attempts: attempts || [],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  dispatchOrder,
  respondToDispatch,
  getDispatchStatus,
  findNearbyDrivers,
  haversineKm,
  activeDispatches,
};
