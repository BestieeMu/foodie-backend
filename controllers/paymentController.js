const { initializePayment, verifyPayment } = require('../utils/paystack');
const supabase = require('../utils/supabase');

const initPayment = async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    const user = req.user;

    const metadata = {
      orderId,
      userId: user.id,
    };

    const data = await initializePayment(user.email, amount, metadata);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const verify = async (req, res) => {
  try {
    const { reference } = req.params;
    const data = await verifyPayment(reference);

    if (data.data.status === 'success') {
      const orderId = data.data.metadata.orderId;
      
      // Update order payment status
      const { data: updated, error } = await supabase
        .from('orders')
        .update({ 
            payment_status: 'paid',
            updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      try {
        const { data: orderRow } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (orderRow) {
          const walletController = require('./walletController');
          await walletController.accrueRestaurantEarning(orderRow);
        }
      } catch (e) {}

      // Notify via Socket.IO
      const io = req.app.locals.io;
      if (io) {
        io.to(`order_${orderId}`).emit('payment:update', { status: 'success', orderId });
        io.to(`restaurant_${updated.restaurant_id}`).emit('orders:update', { type: 'updated', order: updated });
      }

      return res.json({ status: 'success', order: updated });
    }

    res.json({ status: 'failed', message: 'Payment verification failed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  initPayment,
  verify,
};
