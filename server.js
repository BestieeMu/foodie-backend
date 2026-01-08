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

const app = express();

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

const limiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use(limiter);

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

io.on('connection', (socket) => {
  const id = socket.id;
  console.log('Socket connected:', id);
  socket.on('disconnect', () => console.log('Socket disconnected:', id));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
});

// Grouped routers under /api
app.use('/api/auth', authRouter);
app.use('/api', menuRouter);
app.use('/api', ordersRouter);
app.use('/api', deliveryRouter);
app.use('/api', profileRouter);
app.use('/api', addressesRouter);
app.use('/api', groupRouter);
app.use('/api', adminRouter);
app.use('/api', financeRouter);
app.use('/api', uploadRouter);

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
