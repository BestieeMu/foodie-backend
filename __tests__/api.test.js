const request = require('supertest');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRouter = require('../routes/auth');
const menuRouter = require('../routes/menu');
const systemRouter = require('../routes/system');
const paymentRouter = require('../routes/payment');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(helmet());
  app.use(compression());
  app.use(morgan('dev'));
  app.use(cors({ origin: 'http://localhost:8082', credentials: true }));
  const { generalLimiter } = require('../middlewares/rateLimiter');
  app.use(generalLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api', menuRouter);
  app.use('/api', systemRouter);
  app.use('/api', paymentRouter);
  return app;
}

describe('Foodie API', () => {
  const app = createTestApp();

  it('login returns token for demo user', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'demo@foodie.com',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('customer');
  });

  it('lists restaurants', async () => {
    const res = await request(app).get('/api/menu/restaurants');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('gets system settings', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.tax_rate).toBeDefined();
    expect(res.body.currency).toBeDefined();
  });
});