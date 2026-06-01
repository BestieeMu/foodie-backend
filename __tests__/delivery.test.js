const request = require('supertest');
const app = require('../server');
const supabase = require('../utils/supabase');

jest.setTimeout(20000);

// We cannot import app from server since server starts listening immediately.
// Instead, we'll require express and the routers to simulate requests.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRouter = require('../routes/auth');
const menuRouter = require('../routes/menu');
const ordersRouter = require('../routes/orders');
const deliveryRouter = require('../routes/delivery');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(helmet());
  app.use(compression());
  app.use(morgan('dev'));
  app.use(cors({ origin: 'http://localhost:8082', credentials: true }));
  const limiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
  app.use(limiter);
  app.use('/api/auth', authRouter);
  app.use('/api', menuRouter);
  app.use('/api', ordersRouter);
  app.use('/api', deliveryRouter);
  return app;
}

describe('Delivery accept flow', () => {
  const app = createTestApp();
  let driverAccessToken;
  let driverId;
  let customerAccessToken;
  let customerId;

  beforeAll(async () => {
    // Ensure test restaurant and item exist
    await supabase.from('menu_items').delete().eq('restaurant_id', 'r_1');
    await supabase.from('restaurants').delete().eq('id', 'r_1');

    await supabase.from('restaurants').insert({
      id: 'r_1',
      name: 'Test Restaurant 1',
      rating: 4.5,
      categories: ['Burgers', 'Fast Food'],
      address: '123 Main St'
    });

    await supabase.from('menu_items').insert({
      id: 'i_1',
      restaurant_id: 'r_1',
      name: 'Regular Burger',
      price: 9.99,
      is_available: true,
      options: {
        sizes: [
          { id: 'size_regular', name: 'Regular', price: 0 }
        ]
      }
    });
  });

  it('signs up users and logs in', async () => {
    const driverEmail = `driver_${Date.now()}@foodie.com`;
    const customerEmail = `customer_${Date.now()}@foodie.com`;
    const password = 'StrongP@ss1!';

    const signupDriverRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: driverEmail, password, name: 'Driver Test', role: 'driver' });
    expect(signupDriverRes.status).toBe(201);
    
    const { data: driverUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', driverEmail)
      .single();
    expect(driverUser).toBeTruthy();
    driverId = driverUser.id;
    await supabase
      .from('users')
      .update({ is_verified: true, otp_code: null, otp_expires: null })
      .eq('id', driverId);

    const signupCustomerRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: customerEmail, password, name: 'Customer Test', role: 'customer' });
    expect(signupCustomerRes.status).toBe(201);

    const { data: customerUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', customerEmail)
      .single();
    expect(customerUser).toBeTruthy();
    customerId = customerUser.id;
    await supabase
      .from('users')
      .update({ is_verified: true, otp_code: null, otp_expires: null })
      .eq('id', customerId);

    const loginDriverRes = await request(app)
      .post('/api/auth/login')
      .send({ email: driverEmail, password });
    expect(loginDriverRes.status).toBe(200);
    driverAccessToken = loginDriverRes.body.accessToken;
    expect(driverAccessToken).toBeTruthy();

    const loginCustomerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: customerEmail, password });
    expect(loginCustomerRes.status).toBe(200);
    customerAccessToken = loginCustomerRes.body.accessToken;
    expect(customerAccessToken).toBeTruthy();
  });

  it('creates a delivery order', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .send({
        userId: customerId,
        restaurantId: 'r_1',
        items: [ { itemId: 'i_1', quantity: 1, choice: { sizeId: 'size_regular' } } ],
        type: 'delivery',
        pickupAddress: { address: '123 Olive St, Foodietown' },
        deliveryAddress: { address: '789 Test St, Foodietown' },
      });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body;
    expect(order.status).toBe('pending');
    // set on test context
    app.locals.testOrderId = order.id;
  });

  it('driver accepts the order', async () => {
    const res = await request(app)
      .post('/api/delivery/accept')
      .set('Authorization', `Bearer ${driverAccessToken}`)
      .send({ driverId, orderId: app.locals.testOrderId });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
    expect(res.body.driver_id).toBe(driverId);
  });

  afterAll(async () => {
    if (driverId) {
      await supabase.from('users').delete().eq('id', driverId);
    }
    if (customerId) {
      await supabase.from('users').delete().eq('id', customerId);
    }
    if (app.locals.testOrderId) {
      await supabase.from('order_items').delete().eq('order_id', app.locals.testOrderId);
      await supabase.from('orders').delete().eq('id', app.locals.testOrderId);
    }
    await supabase.from('menu_items').delete().eq('restaurant_id', 'r_1');
    await supabase.from('restaurants').delete().eq('id', 'r_1');
  });
});