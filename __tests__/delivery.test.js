const request = require('supertest');
const app = require('../server');

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

  it('signs up users and logs in', async () => {
    const driverEmail = `driver_${Date.now()}@foodie.com`;
    const customerEmail = `customer_${Date.now()}@foodie.com`;
    const password = 'StrongP@ss1!';

    const signupDriverRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: driverEmail, password, name: 'Driver Test', role: 'driver' });
    expect(signupDriverRes.status).toBe(201);
    driverId = signupDriverRes.body.user.id;

    const signupCustomerRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: customerEmail, password, name: 'Customer Test', role: 'customer' });
    expect(signupCustomerRes.status).toBe(201);
    customerId = signupCustomerRes.body.user.id;

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
    expect(res.body.driverId).toBe(driverId);
  });
});