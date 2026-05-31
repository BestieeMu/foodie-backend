const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
require('dotenv').config();

async function test() {
  const secret = process.env.JWT_SECRET;
  
  // Create token for Super Admin (id: 3438c0c0-bd25-433a-ada1-901179191b33)
  const token = jwt.sign(
    {
      id: '3438c0c0-bd25-433a-ada1-901179191b33',
      role: 'super_admin',
    },
    secret,
    { expiresIn: '1h' }
  );

  console.log('Generated token:', token);

  const url = 'https://foodie-backend.pxxl.click/api/orders/b2425d17-c4b9-4a19-93e2-7c28d4ef2b0d/status';
  
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'cancelled' })
    });
    console.log('PATCH Status Code:', res.status);
    const json = await res.json();
    console.log('PATCH Response:', json);
  } catch (err) {
    console.error('PATCH failed:', err);
  }
}

test();
