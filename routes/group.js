const express = require('express');
const supabase = require('../utils/supabase');
const { calcItemPrice, calcOrderTotal } = require('../utils/calculations');
const { authMiddleware, requireRole } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { groupCreateSchema, groupJoinSchema, groupAddItemSchema, groupFinalizeSchema } = require('../schemas/group');

const router = express.Router();

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

router.post('/group/create', authMiddleware, requireRole('customer'), validate(groupCreateSchema), async (req, res) => {
  try {
    const { userId, restaurantId, type = 'delivery', schedule, pickupAddress, deliveryAddress } = req.validated.body;
    
    // Validate restaurant
    const { data: rest } = await supabase.from('restaurants').select('address').eq('id', restaurantId).single();
    if (!rest) return res.status(400).json({ message: 'Invalid restaurant' });

    const group = {
      restaurant_id: restaurantId,
      creator_id: userId,
      type,
      schedule: schedule || null,
      members: [userId],
      items: [], 
      status: 'open',
      invite_code: makeInviteCode(),
      pickup_address: type === 'delivery' ? (pickupAddress || null) : rest.address,
      delivery_address: type === 'delivery' ? (deliveryAddress || null) : undefined,
    };

    const { data, error } = await supabase.from('group_orders').insert(group).select().single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/group/join', authMiddleware, requireRole('customer'), validate(groupJoinSchema), async (req, res) => {
  try {
    const { userId, groupId, inviteCode } = req.validated.body;
    
    let query = supabase.from('group_orders').select('*');
    if (groupId) query = query.eq('id', groupId);
    else if (inviteCode) query = query.eq('invite_code', inviteCode);
    
    const { data: group, error } = await query.single();
    
    if (error || !group) return res.status(404).json({ message: 'Group not found' });
    if (group.status !== 'open') return res.status(400).json({ message: 'Group is not open' });

    // Add member if not exists
    let members = group.members || [];
    if (!members.includes(userId)) {
      members.push(userId);
      const { data: updated, error: updateError } = await supabase
        .from('group_orders')
        .update({ members })
        .eq('id', group.id)
        .select()
        .single();
      if (updateError) throw updateError;
      return res.json(updated);
    }
    
    res.json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/group/add-item', authMiddleware, requireRole('customer'), validate(groupAddItemSchema), async (req, res) => {
  try {
    const { groupId, userId, itemId, quantity = 1, choice = {} } = req.validated.body;
    
    const { data: group, error } = await supabase.from('group_orders').select('*').eq('id', groupId).single();
    if (error || !group) return res.status(404).json({ message: 'Group not found' });
    
    const members = group.members || [];
    if (!members.includes(userId)) return res.status(403).json({ message: 'Not a group member' });

    const { data: menuItem } = await supabase.from('menu_items').select('*').eq('id', itemId).single();
    if (!menuItem) return res.status(400).json({ message: 'Invalid item' });

    const price = calcItemPrice(menuItem, choice);
    const entry = { userId, name: menuItem.name, quantity, price, choice };
    
    const items = group.items || [];
    items.push(entry);

    const { error: updateError } = await supabase
      .from('group_orders')
      .update({ items })
      .eq('id', groupId);

    if (updateError) throw updateError;
    
    res.status(201).json({ ok: true, item: entry, groupId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/group/finalize', authMiddleware, requireRole('customer'), validate(groupFinalizeSchema), async (req, res) => {
  try {
    const { groupId, pickupAddress, deliveryAddress } = req.validated.body;
    
    const { data: group, error } = await supabase.from('group_orders').select('*').eq('id', groupId).single();
    if (error || !group) return res.status(404).json({ message: 'Group not found' });
    if (group.status !== 'open') return res.status(400).json({ message: 'Group not open for finalization' });

    const updates = {};
    if (group.type === 'delivery') {
      const pick = pickupAddress || group.pickup_address;
      const drop = deliveryAddress || group.delivery_address;
      if (!pick || !drop) return res.status(400).json({ message: 'Addresses required for delivery' });
      updates.pickup_address = pick;
      updates.delivery_address = drop;
    }
    updates.status = 'finalized';

    // Create Order
    const items = (group.items || []).map(i => ({ name: i.name, quantity: i.quantity, price: i.price, choice: i.choice }));
    if (!items.length) return res.status(400).json({ message: 'No items in group' });
    
    const total = calcOrderTotal(items);
    const order = {
      user_id: group.creator_id,
      restaurant_id: group.restaurant_id,
      type: group.type,
      status: 'pending',
      items,
      total,
      delivery_address: updates.delivery_address || group.delivery_address,
      group_id: group.id
    };

    const { data: newOrder, error: orderError } = await supabase.from('orders').insert(order).select().single();
    if (orderError) throw orderError;

    // Update Group
    await supabase.from('group_orders').update(updates).eq('id', groupId);

    const io = req.app.locals.io;
    if (io) io.emit('orders:update', { type: 'group_finalized', order: newOrder, groupId: group.id });
    
    res.status(201).json({ order: newOrder, group: { ...group, ...updates } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
