const axios = require('axios');
const jwt = require('jsonwebtoken');
const supabase = require('./utils/supabase');
require('dotenv').config();

const ACCESS_EXPIRES_IN = '15m';

function signAccessToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role, restaurant_id: user.restaurant_id };
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign(payload, secret, { expiresIn: ACCESS_EXPIRES_IN });
}

async function run() {
  try {
    // 1. Fetch some orders from DB
    const { data: orders, error } = await supabase.from('orders').select('*').limit(10);
    if (error) {
      console.error('Failed to fetch orders:', error);
      return;
    }

    if (!orders || orders.length === 0) {
      console.log('No orders in database!');
      return;
    }

    console.log('Found orders in DB:', orders.map(o => ({ id: o.id, status: o.status, user_id: o.user_id })));

    // Pick a pending/active order or just the first one
    const order = orders.find(o => ['pending', 'accepted', 'preparing'].includes(o.status)) || orders[0];
    console.log('Using order ID:', order.id, 'with status:', order.status, 'user_id:', order.user_id);

    // Get user details for this user_id or just mock the customer role
    const token = signAccessToken({ id: order.user_id, email: 'customer@foodie.com', role: 'customer' });

    console.log('Sending cancel request...');
    const res = await axios.patch(`http://localhost:4004/api/orders/${order.id}/status`, {
      status: 'cancelled'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('SUCCESS API RESPONSE:', res.data);
  } catch (err) {
    console.log('ERROR STATUS:', err.response?.status);
    console.log('ERROR DATA:', JSON.stringify(err.response?.data, null, 2));
  }
}

run();
