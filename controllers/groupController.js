const supabase = require('../utils/supabase');
const { calcItemPrice, calculateOrderCosts } = require('../utils/calculations');
const { v4: uuidv4 } = require('uuid');

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const createGroup = async (req, res) => {
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
};

const joinGroup = async (req, res) => {
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
};

const addItem = async (req, res) => {
  try {
    const { groupId, userId, itemId, quantity = 1, choice = {} } = req.validated.body;
    
    const { data: group, error } = await supabase.from('group_orders').select('*').eq('id', groupId).single();
    if (error || !group) return res.status(404).json({ message: 'Group not found' });
    
    const members = group.members || [];
    if (!members.includes(userId)) return res.status(403).json({ message: 'Not a group member' });

    const { data: menuItem } = await supabase.from('menu_items').select('*').eq('id', itemId).single();
    if (!menuItem) return res.status(400).json({ message: 'Invalid item' });

    const price = calcItemPrice(menuItem, choice);
    const entry = { userId, itemId: menuItem.id, name: menuItem.name, quantity, price, choice };
    
    const items = group.items || [];
    items.push(entry);

    const { error: updateError } = await supabase
      .from('group_orders')
      .update({ items })
      .eq('id', groupId);

    if (updateError) throw updateError;

    // Notify group
    const io = req.app.locals.io;
    if (io) io.to(`group_${groupId}`).emit('group:update', { type: 'item_added', entry });

    res.json({ message: 'Item added', entry });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const finalizeGroupOrder = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;

    const { data: group, error } = await supabase.from('group_orders').select('*').eq('id', groupId).single();
    if (error || !group) return res.status(404).json({ message: 'Group not found' });
    
    if (group.creator_id !== userId) return res.status(403).json({ message: 'Only creator can finalize' });
    if (group.status !== 'open') return res.status(400).json({ message: 'Group already finalized' });

    const items = group.items || [];
    if (!items.length) return res.status(400).json({ message: 'No items in group order' });

    const { data: settings } = await supabase.from('system_settings').select('*').single();
    const taxRate = settings?.tax_rate || 5;
    const deliveryFee = group.type === 'delivery' ? (settings?.delivery_fee || 5.00) : 0;

    const costs = calculateOrderCosts(items, taxRate, deliveryFee);

    const orderId = uuidv4();
    const order = {
      id: orderId,
      user_id: group.creator_id,
      restaurant_id: group.restaurant_id,
      type: group.type,
      status: group.schedule ? 'scheduled' : 'pending',
      items: items,
      total: costs.total,
      subtotal: costs.subtotal,
      tax: costs.tax,
      delivery_fee: costs.deliveryFee,
      delivery_address: group.delivery_address,
      pickup_address: group.pickup_address,
      payment_status: 'pending',
      created_at: new Date().toISOString(),
      schedule: group.schedule,
      group_id: group.id
    };

    const { error: orderError } = await supabase.from('orders').insert(order);
    if (orderError) throw orderError;

    const { error: groupError } = await supabase
        .from('group_orders')
        .update({ status: 'finalized', updated_at: new Date().toISOString() })
        .eq('id', groupId);

    if (groupError) {
        console.error('Failed to update group status', groupError);
    }

    const io = req.app.locals.io;
    if (io) {
        io.to(`group_${groupId}`).emit('group:update', { type: 'finalized', orderId });
        // Notify Restaurant (Room: restaurant_{id})
        io.to(`restaurant_${group.restaurant_id}`).emit('orders:update', { type: 'created', order });
    }

    res.json({ message: 'Group order finalized', orderId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
    createGroup,
    joinGroup,
    addItem,
    finalizeGroupOrder
};
