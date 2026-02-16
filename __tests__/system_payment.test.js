const request = require('supertest');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { generalLimiter } = require('../middlewares/rateLimiter');
const systemRouter = require('../routes/system');
const paymentRouter = require('../routes/payment');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: 'http://localhost:8082', credentials: true }));
  app.use(generalLimiter);
  
  // Mock authentication for testing protected routes
  app.use((req, res, next) => {
    req.user = { id: 'u123', email: 'test@example.com', role: 'customer' };
    next();
  });

  app.use('/api', systemRouter);
  app.use('/api/payment', paymentRouter);
  return app;
}

describe('System and Payment APIs', () => {
  const app = createTestApp();

  describe('System API', () => {
    it('GET /api/settings should return system settings', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tax_rate');
      expect(res.body).toHaveProperty('commission_rate');
    });
  });

  describe('Payment API', () => {
    // Note: This test might fail if Paystack API is not reachable or keys are missing
    // In a real environment, we would use nock or similar to mock external calls.
    it('POST /api/payment/initialize should fail with invalid orderId', async () => {
      const res = await request(app)
        .post('/api/payment/initialize')
        .send({ orderId: 'invalid-id', amount: 1000 });
      
      // Should be 400 or 404 depending on implementation
      expect(res.status).not.toBe(200);
    });
  });
});
