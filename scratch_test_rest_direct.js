const fetch = require('node-fetch');
require('dotenv').config();

async function run() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/orders?select=*,restaurant:restaurant_id(name,address)&type=eq.delivery&driver_id=is.null&status=in.(pending,preparing,ready_for_pickup)&limit=50`;
  const key = process.env.SUPABASE_KEY;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('STATUS:', res.status);
    const json = await res.json();
    console.log('RESPONSE:', json);
  } catch (err) {
    console.error('FAILED:', err);
  }
}

run();
