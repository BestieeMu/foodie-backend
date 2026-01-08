const express = require('express');
const supabase = require('../utils/supabase');
const { calcItemPrice, calcOrderTotal } = require('../utils/calculations');
const { authMiddleware, requireRole } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { createOrderSchema, updateOrderStatusSchema } = require('../schemas/orders');
const { sendPushNotifications } = require('../utils/notifications');

const router = express.Router();

router.post('/orders', authMiddleware, requireRole('customer'), validate(createOrderSchema), async (req, res) => {
  const { userId, restaurantId, items, type = 'delivery', schedule, pickupAddress, deliveryAddress, gift = false, giftMessage, recipientName } = req.validated.body;
  
  // Validate restaurant
  const { data: rest } = await supabase.from('restaurants').select('*').eq('id', restaurantId).single();
  if (!rest) return res.status(400).json({ message: 'Invalid restaurant' });
  
  // Validate menu items
  const { data: menuItems } = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId);
  
  if (type === 'delivery' && (!pickupAddress || !deliveryAddress)) return res.status(400).json({ message: 'Addresses required for delivery' });

  const orderItems = (items || []).map(it => {
    const menuItem = menuItems.find(mi => mi.id === it.itemId);
    if (!menuItem) return null;
    const quantity = it.quantity || 1;
    const choice = it.choice || {};
    const price = calcItemPrice(menuItem, choice);
    return { itemId: menuItem.id, name: menuItem.name, quantity, price, choice };
  }).filter(Boolean);

  if (!orderItems.length) return res.status(400).json({ message: 'No valid items' });

  const total = calcOrderTotal(orderItems);
  const order = {
    id: `o_${Date.now()}`,
    user_id: userId,
    restaurant_id: restaurantId,
    type, // Ensure DB has this column or ignore if schema mismatch
    status: 'pending',
    items: orderItems,
    total,
    delivery_address: type === 'delivery' ? deliveryAddress : undefined,
    payment_status: 'pending',
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('orders').insert(order);
  
  if (error) {
    console.error('Order create error:', error);
    return res.status(500).json({ message: 'Failed to create order' });
  }

  const io = req.app.locals.io;
  if (io) io.emit('orders:update', { type: 'created', order });
  
  // Notify Admins of that restaurant? (Requires finding admin users)
  
  res.status(201).json(order);
});

router.get('/orders/:orderId', authMiddleware, async (req, res) => {
  const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.orderId).single();
  if (!order) return res.status(404).json({ message: 'Order not found' });
  
  // Security check
  const user = req.user;
  if (order.user_id !== user.id && order.driver_id !== user.id && user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  
  res.json(order);
});

router.get('/orders/user/:userId', authMiddleware, async (req, res) => {
  if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { data: userOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  res.json(userOrders || []);
});

router.patch('/orders/:orderId/status', authMiddleware, validate(updateOrderStatusSchema), async (req, res) => {
  const { status } = req.validated.body;
  const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.orderId).single();
  
  if (!order) return res.status(404).json({ message: 'Order not found' });
  
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.orderId);

  if (error) return res.status(500).json({ message: 'Update failed' });

  const io = req.app.locals.io;
  if (io) io.emit('orders:update', { type: 'status', orderId: order.id, status });

  // SEND PUSH NOTIFICATION
  if (order.user_id) {
    sendPushNotifications(
      [order.user_id],
      `Order ${status.replace('_', ' ')}`,
      `Your order #${order.id} is now ${status.replace('_', ' ')}`
    );
  }

  res.json({ ...order, status });
});

module.exports = router;
