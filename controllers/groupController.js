const supabase = require('../utils/supabase');
const { calcItemPrice, calculateOrderCosts } = require('../utils/calculations');
const { v4: uuidv4 } = require('uuid');

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makeDeliveryVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isMissingDeliveryCodeColumnError(error) {
  return error?.code === 'PGRST204' && String(error?.message || '').includes('delivery_verification_code');
}

/**
 * Compute per-person cost breakdown for a group
 */
function computeGroupBreakdown(items, members) {
  const perPerson = {};
  members.forEach(m => { perPerson[m] = { items: [], subtotal: 0 }; });

  (items || []).forEach(item => {
    const userId = item.userId;
    if (!perPerson[userId]) perPerson[userId] = { items: [], subtotal: 0 };
    perPerson[userId].items.push(item);
    perPerson[userId].subtotal += (item.price || 0) * (item.quantity || 1);
  });

  return perPerson;
}

/**
 * Broadcast full group state to all participants
 */
async function broadcastGroupState(io, group) {
  if (!io) return;

  const breakdown = computeGroupBreakdown(group.items, group.members);
  const itemTotal = (group.items || []).reduce(
    (sum, it) => sum + (it.price || 0) * (it.quantity || 1), 0
  );

  io.to(`group_${group.id}`).emit('group:cart_update', {
    groupId: group.id,
    items: group.items || [],
    members: group.members || [],
    breakdown,
    groupTotal: itemTotal,
    status: group.status,
  });
}

const createGroup = async (req, res) => {
  try {
    const { userId, restaurantId, type = 'delivery', schedule, pickupAddress, deliveryAddress } = req.validated.body;
    
    // Validate restaurant
    const { data: rest } = await supabase.from('restaurants').select('address').eq('id', restaurantId).single();
    if (!rest) return res.status(400).json({ message: 'Invalid restaurant' });

    const group = {
      id: uuidv4(),
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

      // Broadcast member joined
      const io = req.app.locals.io;
      if (io) {
        io.to(`group_${group.id}`).emit('group:member_joined', { userId, groupId: group.id });
        await broadcastGroupState(io, updated);
      }

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
    if (group.status !== 'open') return res.status(400).json({ message: 'Group is not open for adding items' });
    
    const members = group.members || [];
    if (!members.includes(userId)) return res.status(403).json({ message: 'Not a group member' });

    const { data: menuItem } = await supabase.from('menu_items').select('*').eq('id', itemId).single();
    if (!menuItem) return res.status(400).json({ message: 'Invalid item' });
    
    // Security/Logic Check: Ensure the item belongs to the restaurant this group is ordering from
    if (menuItem.restaurant_id !== group.restaurant_id) {
        return res.status(400).json({ message: 'Items in a group order must all be from the same restaurant' });
    }

    const price = calcItemPrice(menuItem, choice);
    const entryId = uuidv4();
    const entry = { id: entryId, userId, itemId: menuItem.id, name: menuItem.name, quantity, price, choice };
    
    const items = group.items || [];
    items.push(entry);

    const { data: updated, error: updateError } = await supabase
      .from('group_orders')
      .update({ items })
      .eq('id', groupId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Broadcast full cart state to all group members
    const io = req.app.locals.io;
    await broadcastGroupState(io, updated);

    res.json({ message: 'Item added', entry });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Remove an item from group cart (only the item owner or group creator)
 */
const removeItem = async (req, res) => {
  try {
    const { groupId, userId, itemEntryId } = req.validated.body;

    const { data: group, error } = await supabase.from('group_orders').select('*').eq('id', groupId).single();
    if (error || !group) return res.status(404).json({ message: 'Group not found' });
    if (group.status !== 'open') return res.status(400).json({ message: 'Group is not open for modifications' });

    const items = group.items || [];
    const itemIndex = items.findIndex(it => it.id === itemEntryId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not found in group cart' });

    // Only the item owner or group creator can remove
    const item = items[itemIndex];
    if (item.userId !== userId && group.creator_id !== userId) {
      return res.status(403).json({ message: 'Only item owner or group creator can remove items' });
    }

    items.splice(itemIndex, 1);

    const { data: updated, error: updateError } = await supabase
      .from('group_orders')
      .update({ items })
      .eq('id', groupId)
      .select()
      .single();

    if (updateError) throw updateError;

    const io = req.app.locals.io;
    await broadcastGroupState(io, updated);

    res.json({ message: 'Item removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Update quantity of a group cart item
 */
const updateItemQuantity = async (req, res) => {
  try {
    const { groupId, userId, itemEntryId, quantity } = req.validated.body;

    const { data: group, error } = await supabase.from('group_orders').select('*').eq('id', groupId).single();
    if (error || !group) return res.status(404).json({ message: 'Group not found' });
    if (group.status !== 'open') return res.status(400).json({ message: 'Group is not open for modifications' });

    const items = group.items || [];
    const item = items.find(it => it.id === itemEntryId);
    if (!item) return res.status(404).json({ message: 'Item not found in group cart' });

    if (item.userId !== userId && group.creator_id !== userId) {
      return res.status(403).json({ message: 'Only item owner or group creator can update' });
    }

    if (quantity <= 0) {
      // Remove item if quantity is 0
      const idx = items.indexOf(item);
      items.splice(idx, 1);
    } else {
      item.quantity = quantity;
    }

    const { data: updated, error: updateError } = await supabase
      .from('group_orders')
      .update({ items })
      .eq('id', groupId)
      .select()
      .single();

    if (updateError) throw updateError;

    const io = req.app.locals.io;
    await broadcastGroupState(io, updated);

    res.json({ message: 'Item updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get group details including full cart state and breakdown
 */
const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;

    const { data: group, error } = await supabase
      .from('group_orders')
      .select('*, restaurant:restaurant_id(name, image_url, address)')
      .eq('id', groupId)
      .single();

    if (error || !group) return res.status(404).json({ message: 'Group not found' });

    // Check membership
    const members = group.members || [];
    if (!members.includes(req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Not a group member' });
    }

    const breakdown = computeGroupBreakdown(group.items, members);
    const groupTotal = (group.items || []).reduce(
      (sum, it) => sum + (it.price || 0) * (it.quantity || 1), 0
    );

    res.json({
      ...group,
      breakdown,
      groupTotal,
    });
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
      delivery_verification_code: group.type === 'delivery' ? makeDeliveryVerificationCode() : null,
      payment_status: 'pending',
      created_at: new Date().toISOString(),
      schedule: group.schedule,
      group_id: group.id
    };

    let { error: orderError } = await supabase.from('orders').insert(order);
    if (isMissingDeliveryCodeColumnError(orderError)) {
      delete order.delivery_verification_code;
      ({ error: orderError } = await supabase.from('orders').insert(order));
    }
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
    removeItem,
    updateItemQuantity,
    getGroupDetails,
    finalizeGroupOrder
};