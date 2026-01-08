const request = require('supertest');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRouter = require('../routes/auth');
const menuRouter = require('../routes/menu');
const groupRouter = require('../routes/group');

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
  app.use('/api', groupRouter);
  return app;
}

describe('Group ordering flow', () => {
  const app = createTestApp();
  let cust1Token; let cust1Id;
  let cust2Token; let cust2Id;
  let groupId; let inviteCode;

  it('signs up two customers and logs in', async () => {
    const password = 'StrongP@ss1!';
    const c1Email = `c1_${Date.now()}@foodie.com`;
    const c2Email = `c2_${Date.now()}@foodie.com`;

    const s1 = await request(app).post('/api/auth/signup').send({ email: c1Email, password, name: 'C1', role: 'customer' });
    const s2 = await request(app).post('/api/auth/signup').send({ email: c2Email, password, name: 'C2', role: 'customer' });
    expect(s1.status).toBe(201); expect(s2.status).toBe(201);
    cust1Id = s1.body.user.id; cust2Id = s2.body.user.id;

    const l1 = await request(app).post('/api/auth/login').send({ email: c1Email, password });
    const l2 = await request(app).post('/api/auth/login').send({ email: c2Email, password });
    expect(l1.status).toBe(200); expect(l2.status).toBe(200);
    cust1Token = l1.body.accessToken; cust2Token = l2.body.accessToken;
  });

  it('creates a group for delivery', async () => {
    const res = await request(app)
      .post('/api/group/create')
      .set('Authorization', `Bearer ${cust1Token}`)
      .send({ userId: cust1Id, restaurantId: 'r_1', type: 'delivery' });
    expect(res.status).toBe(201);
    groupId = res.body.id; inviteCode = res.body.inviteCode;
  });

  it('joins second customer via invite code', async () => {
    const res = await request(app)
      .post('/api/group/join')
      .set('Authorization', `Bearer ${cust2Token}`)
      .send({ userId: cust2Id, inviteCode });
    expect(res.status).toBe(200);
    expect(res.body.members.includes(cust2Id)).toBe(true);
  });

  it('adds items from both customers', async () => {
    const add1 = await request(app)
      .post('/api/group/add-item')
      .set('Authorization', `Bearer ${cust1Token}`)
      .send({ groupId, userId: cust1Id, itemId: 'i_1', quantity: 1, choice: { sizeId: 'size_regular' } });
    expect(add1.status).toBe(201);
    const add2 = await request(app)
      .post('/api/group/add-item')
      .set('Authorization', `Bearer ${cust2Token}`)
      .send({ groupId, userId: cust2Id, itemId: 'i_2', quantity: 2, choice: { sizeId: 'size_small' } });
    expect(add2.status).toBe(201);
  });

  it('finalizes group and returns an order', async () => {
    const res = await request(app)
      .post('/api/group/finalize')
      .set('Authorization', `Bearer ${cust1Token}`)
      .send({ groupId, pickupAddress: { address: '123 Olive St, Foodietown' }, deliveryAddress: { address: '456 Group St, Foodietown' } });
    expect(res.status).toBe(201);
    expect(res.body.order.groupId).toBe(groupId);
    expect(res.body.group.status).toBe('finalized');
  });
});