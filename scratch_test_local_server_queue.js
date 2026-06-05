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

  const url = 'http://localhost:4004/api/delivery/queue';
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('LOCAL SERVER GET Status Code:', res.status);
    const json = await res.json();
    console.log('LOCAL SERVER GET Response:', json);
  } catch (err) {
    console.error('LOCAL SERVER GET failed:', err);
  }
}

test();
