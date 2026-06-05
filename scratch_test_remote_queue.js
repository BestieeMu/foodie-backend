const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
require('dotenv').config();

async function test() {
  const secret = process.env.JWT_SECRET;
  
  // Create token for Driver
  const token = jwt.sign(
    {
      id: 'driver_test_id_123',
      role: 'driver',
    },
    secret,
    { expiresIn: '1h' }
  );

  const url = 'https://foodie-backend.pxxl.click/api/delivery/queue';
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('GET Status Code:', res.status);
    const json = await res.json();
    console.log('GET Response:', json);
  } catch (err) {
    console.error('GET failed:', err);
  }
}

test();
