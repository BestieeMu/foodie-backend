const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const secret = process.env.JWT_SECRET;

async function run() {
  // Create token for Driver
  const token = jwt.sign(
    {
      id: 'driver_test_id_123',
      role: 'driver',
    },
    secret,
    { expiresIn: '1h' }
  );

  // Connect to Supabase using the user JWT
  const userSupabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data, error } = await userSupabase
    .from('orders')
    .select('*, restaurant:restaurant_id(name, address)')
    .eq('type', 'delivery')
    .is('driver_id', null)
    .in('status', ['pending', 'preparing', 'ready_for_pickup']) 
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('ERROR DETECTED WITH USER JWT:', error);
  } else {
    console.log('SUCCESS WITH USER JWT! DATA LENGTH:', data.length);
  }
}

run();
