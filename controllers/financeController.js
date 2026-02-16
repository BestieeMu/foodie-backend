const supabase = require('../utils/supabase');

// Helper to get admin's restaurant
const getAdminRestaurant = async (userId) => {
  const { data: user } = await supabase
    .from('users')
    .select('restaurant_id')
    .eq('id', userId)
    .single();
  
  if (!user || !user.restaurant_id) return null;
  
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', user.restaurant_id)
    .single();

  return restaurant;
};

const getWallet = async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });

    // Fetch system settings
    const { data: settings } = await supabase.from('system_settings').select('*').single();
    const commissionRate = (settings?.commission_rate || 10) / 100;

    // Calculate earnings from orders
    const { data: restOrders, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', rest.id)
      .eq('status', 'delivered');

    if (orderError) throw orderError;

    // Revenue calculation: Use subtotal if available, else total (legacy/fallback)
    // NOTE: If platform collects tax, restaurant revenue is subtotal. 
    // If restaurant collects tax, revenue is subtotal + tax. 
    // Usually platform charges commission on subtotal.
    const totalRevenue = restOrders.reduce((sum, o) => sum + (o.subtotal || o.total || 0), 0);
    const commission = totalRevenue * commissionRate;
    
    // Calculate total payouts (pending + approved)
    const { data: restPayouts, error: payoutError } = await supabase
      .from('payouts')
      .select('*')
      .eq('restaurant_id', rest.id)
      .neq('status', 'rejected');

    if (payoutError && payoutError.code !== '42P01') throw payoutError; // Ignore if table doesn't exist yet (mock safety)

    const safePayouts = restPayouts || [];
    const totalPaidOut = safePayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const balance = totalRevenue - commission - totalPaidOut;

    res.json({
      totalRevenue,
      commission,
      balance,
      currency: settings?.currency || 'USD',
      transactions: restOrders.map(o => {
        const amount = o.subtotal || o.total || 0;
        const fee = amount * commissionRate;
        return {
            id: `txn_${o.id}`,
            orderId: o.id,
            amount,
            fee,
            net: amount - fee,
            date: o.created_at,
            status: 'completed'
        };
      }).sort((a, b) => new Date(b.date) - new Date(a.date))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const requestPayout = async (req, res) => {
  try {
    const { amount } = req.body;
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });

    const { data, error } = await supabase
      .from('payouts')
      .insert({
        restaurant_id: rest.id,
        amount,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Payout requested successfully', amount, payout: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
    getWallet,
    requestPayout
};
