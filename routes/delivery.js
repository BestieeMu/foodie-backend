const express = require('express');
const supabase = require('../utils/supabase');
const { authMiddleware, requireRole } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { acceptSchema, driverLocationUpdateSchema } = require('../schemas/delivery');

const router = express.Router();

router.get('/delivery/queue', authMiddleware, requireRole('driver'), async (req, res) => {
  try {
    // return only delivery orders that are not assigned yet and pending/confirmed
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('type', 'delivery')
      .is('driver_id', null)
      .in('status', ['pending', 'confirmed']) // Assuming 'confirmed' is a valid status, typically 'ready_for_pickup'
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/delivery/accept', authMiddleware, requireRole('driver'), validate(acceptSchema), async (req, res) => {
  try {
    const { driverId, orderId } = req.validated.body;
    
    // Security check: ensure the authenticated driver is the one accepting
    if (req.user.id !== driverId) {
      return res.status(403).json({ message: 'Forbidden: Cannot accept for another driver' });
    }

    // Check if order is available
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) return res.status(404).json({ message: 'Order not found' });
    if (order.driver_id) return res.status(400).json({ message: 'Order already accepted' });

    // Assign
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'accepted',
        driver_id: driverId,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) throw updateError;

    const io = req.app.locals.io;
    if (io) io.emit('delivery:update', { type: 'accepted', orderId, driverId });
    
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/delivery/driver/:driverId', authMiddleware, requireRole('driver'), async (req, res) => {
  try {
    const { driverId } = req.params;
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', driverId)
      .neq('status', 'delivered')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/delivery/location/:driverId', authMiddleware, requireRole('driver'), async (req, res) => {
  try {
    const { driverId } = req.params;
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
});

router.post('/delivery/location', authMiddleware, requireRole('driver'), validate(driverLocationUpdateSchema), async (req, res) => {
  try {
    const { driverId, lat, lng } = req.validated.body;
    
    const { data, error } = await supabase
      .from('driver_locations')
      .upsert({ 
        driver_id: driverId,
        lat,
        lng,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    const io = req.app.locals.io;
    if (io) io.emit('driver:location', { driverId, lat, lng });
    
    res.json({ ok: true, location: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
