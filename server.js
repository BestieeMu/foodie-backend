require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');

// Routers
const authRouter = require('./routes/auth');
const menuRouter = require('./routes/menu');
const ordersRouter = require('./routes/orders');
const deliveryRouter = require('./routes/delivery');
const profileRouter = require('./routes/profile');
const addressesRouter = require('./routes/addresses');
const groupRouter = require('./routes/group');
const adminRouter = require('./routes/admin');
const financeRouter = require('./routes/finance');
const uploadRouter = require('./routes/upload');
const systemRouter = require('./routes/system');
const paymentRouter = require('./routes/payment');

const { generalLimiter, authLimiter, uploadLimiter } = require('./middlewares/rateLimiter');

const app = express();

// Webhooks
const walletController = require('./controllers/walletController');
app.post('/api/wallet/webhook', express.raw({ type: 'application/json' }), walletController.paystackWebhook);

// Middlewares
app.use(express.json());
app.use(helmet());
app.use(hpp());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.CORS_ORIGIN || 'http://10.0.2.2:4003';
    if (!origin) return callback(null, true);
    if (origin.startsWith('http://localhost')) return callback(null, true);
    if (origin === allowed) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));

app.use(generalLimiter);

const { verifyAccessToken } = require('./utils/auth');

// Socket.IO setup
const http = require('http');
const httpServer = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:8081',
    methods: ['GET', 'POST', 'PATCH'],
    credentials: true,
  }
});
app.locals.io = io;

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  try {
    const decoded = verifyAccessToken(token);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
});

io.on('connection', (socket) => {
  const id = socket.id;
  const userId = socket.user.id;
  console.log(`Socket connected: ${id} (User: ${userId})`);

  // Join user-specific room for personal notifications
  socket.join(`user_${userId}`);

  // If user is restaurant staff/admin, join restaurant room
  if (socket.user.restaurant_id) {
    socket.join(`restaurant_${socket.user.restaurant_id}`);
    console.log(`User ${userId} joined restaurant_${socket.user.restaurant_id}`);
  }

  // Event to join order tracking room
  socket.on('join_order', (orderId) => {
    // Ideally check if user is allowed to view this order
    socket.join(`order_${orderId}`);
    console.log(`User ${userId} joined order_${orderId}`);
  });

  socket.on('leave_order', (orderId) => {
    socket.leave(`order_${orderId}`);
  });

  // Event to join group order room
  socket.on('join_group', (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`User ${userId} joined group_${groupId}`);
  });

  socket.on('leave_group', (groupId) => {
    socket.leave(`group_${groupId}`);
  });

  socket.on('disconnect', () => console.log(`Socket disconnected: ${id}`));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
});

// Grouped routers under /api
app.use('/api/auth', authLimiter, authRouter);
app.use('/api', menuRouter);
app.use('/api', ordersRouter);
app.use('/api', deliveryRouter);
app.use('/api', profileRouter);
app.use('/api', addressesRouter);
app.use('/api', groupRouter);
app.use('/api', adminRouter);
app.use('/api', financeRouter);
app.use('/api', uploadRouter);
app.use('/api', systemRouter);
const walletRouter = require('./routes/wallet');
app.use('/api', paymentRouter);
app.use('/api', walletRouter);

// 404 handler
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ message: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 4003;
httpServer.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
