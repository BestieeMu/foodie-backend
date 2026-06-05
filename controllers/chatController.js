const supabase = require('../utils/supabase');
const { v4: uuidv4 } = require('uuid');

const sendMessage = async (req, res) => {
  try {
    const senderId = req.user?.id;
    const senderRole = req.user?.role;
    const { orderId, receiverId, content } = req.validated.body;

    if (!senderId || !senderRole) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate the order exists and is active
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot send messages for completed or cancelled orders' });
    }

    const messageId = uuidv4();
    const message = {
      id: messageId,
      order_id: orderId,
      sender_id: senderId,
      receiver_id: receiverId,
      content,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('messages')
      .insert(message);

    if (insertError) throw insertError;

    // Broadcast the message via Socket.IO to the specific order room
    // Add sender_role in the broadcasted object so frontend can use it if they want
    const broadcastMsg = {
      ...message,
      sender_role: senderRole,
    };

    const io = req.app.locals.io;
    if (io) {
      io.to(`order_${orderId}`).emit('chat:message', broadcastMsg);
    }

    res.status(201).json(broadcastMsg);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
};

const getOrderMessages = async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json(messages || []);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
  }
};

const markMessagesRead = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    // Mark all unread messages sent TO this user for this order as read by setting read_at
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('receiver_id', userId)
      .is('read_at', null);

    if (error) throw error;

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark messages as read', error: error.message });
  }
};

module.exports = {
  sendMessage,
  getOrderMessages,
  markMessagesRead,
};
