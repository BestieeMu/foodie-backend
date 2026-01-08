const express = require('express');
const supabase = require('../utils/supabase');
const { authMiddleware, requireRole } = require('../utils/auth');

const router = express.Router();

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

// Wallet & Finance Routes

// Get Earnings (Restaurant Admin)
router.get('/admin/finance/wallet', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });

    // Calculate earnings from orders
    const { data: restOrders, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', rest.id)
      .eq('status', 'delivered');

    if (orderError) throw orderError;

    const totalRevenue = restOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const commissionRate = 0.1; // 10% platform fee
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
      currency: 'USD',
      transactions: restOrders.map(o => ({
        id: `txn_${o.id}`,
        orderId: o.id,
        amount: o.total,
        fee: o.total * commissionRate,
        net: o.total * (1 - commissionRate),
        date: o.created_at,
        status: 'completed'
      })).sort((a, b) => new Date(b.date) - new Date(a.date))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Request Payout (Restaurant Admin)
router.post('/admin/finance/payout', authMiddleware, requireRole('admin'), async (req, res) => {
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
});

// Get Platform Earnings (Super Admin)
router.get('/admin/finance/platform', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { data: allDelivered, error: orderError } = await supabase
      .from('orders')
      .select('total')
      .eq('status', 'delivered');

    if (orderError) throw orderError;

    const totalGMV = allDelivered.reduce((sum, o) => sum + (o.total || 0), 0);
    const commissionRate = 0.1;
    const totalRevenue = totalGMV * commissionRate;

    const { count: activeRestaurants } = await supabase
      .from('restaurants')
      .select('*', { count: 'exact', head: true });

    const { data: recentPayouts } = await supabase
      .from('payouts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      totalGMV, // Gross Merchandise Value
      totalRevenue,
      activeRestaurants: activeRestaurants || 0,
      recentPayouts: recentPayouts || []
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
