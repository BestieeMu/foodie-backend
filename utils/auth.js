const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '7d';

function signAccessToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign(payload, secret, { expiresIn: ACCESS_EXPIRES_IN });
}

function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.verify(token, secret);
}

function signRefreshToken(user) {
  const payload = { id: user.id, tokenType: 'refresh' };
  const secret = process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET || 'dev-secret') + '-refresh';
  return jwt.sign(payload, secret, { expiresIn: REFRESH_EXPIRES_IN });
}

function verifyRefreshToken(token) {
  const secret = process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET || 'dev-secret') + '-refresh';
  return jwt.verify(token, secret);
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== role) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

module.exports = { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken, authMiddleware, requireRole };