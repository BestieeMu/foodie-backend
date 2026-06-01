const request = require('supertest');
const supabase = require('../utils/supabase');

jest.setTimeout(20000);
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

  beforeAll(async () => {
    // Ensure test restaurant and items exist
    const delItems = await supabase.from('menu_items').delete().eq('restaurant_id', 'r_1');
    const delRest = await supabase.from('restaurants').delete().eq('id', 'r_1');
    if (delItems.error) console.error('Error deleting items:', delItems.error);
    if (delRest.error) console.error('Error deleting restaurant:', delRest.error);

    const insRest = await supabase.from('restaurants').insert({
      id: 'r_1',
      name: 'Test Restaurant 1',
      rating: 4.5,
      categories: ['Burgers', 'Fast Food'],
      address: '123 Main St'
    });
    if (insRest.error) console.error('Error inserting restaurant:', insRest.error);

    const insItems = await supabase.from('menu_items').insert([
      {
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
      },
      {
        id: 'i_2',
        restaurant_id: 'r_1',
        name: 'Small Burger',
        price: 6.99,
        is_available: true,
        options: {
          sizes: [
            { id: 'size_small', name: 'Small', price: 0 }
          ]
        }
      }
    ]);
    if (insItems.error) console.error('Error inserting items:', insItems.error);
  });

  it('signs up two customers and logs in', async () => {
    const password = 'StrongP@ss1!';
    const c1Email = `c1_${Date.now()}@foodie.com`;
    const c2Email = `c2_${Date.now()}@foodie.com`;

    const s1 = await request(app).post('/api/auth/signup').send({ email: c1Email, password, name: 'C1', role: 'customer' });
    const s2 = await request(app).post('/api/auth/signup').send({ email: c2Email, password, name: 'C2', role: 'customer' });
    expect(s1.status).toBe(201); expect(s2.status).toBe(201);
    
    const { data: user1 } = await supabase.from('users').select('*').eq('email', c1Email).single();
    expect(user1).toBeTruthy();
    cust1Id = user1.id;
    await supabase.from('users').update({ is_verified: true, otp_code: null, otp_expires: null }).eq('id', cust1Id);

    const { data: user2 } = await supabase.from('users').select('*').eq('email', c2Email).single();
    expect(user2).toBeTruthy();
    cust2Id = user2.id;
    await supabase.from('users').update({ is_verified: true, otp_code: null, otp_expires: null }).eq('id', cust2Id);

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
    if (res.status !== 201) {
      console.log('GROUP CREATE ERROR:', res.status, res.body);
    }
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
    app.locals.testOrderId = res.body.order.id;
  });

  afterAll(async () => {
    if (cust1Id) await supabase.from('users').delete().eq('id', cust1Id);
    if (cust2Id) await supabase.from('users').delete().eq('id', cust2Id);
    if (groupId) {
      await supabase.from('group_order_items').delete().eq('group_id', groupId);
      await supabase.from('group_order_members').delete().eq('group_id', groupId);
      await supabase.from('group_orders').delete().eq('id', groupId);
    }
    if (app.locals.testOrderId) {
      await supabase.from('order_items').delete().eq('order_id', app.locals.testOrderId);
      await supabase.from('orders').delete().eq('id', app.locals.testOrderId);
    }
    await supabase.from('menu_items').delete().eq('restaurant_id', 'r_1');
    await supabase.from('restaurants').delete().eq('id', 'r_1');
  });
});