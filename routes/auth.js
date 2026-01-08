const express = require('express');
const supabase = require('../utils/supabase');
const { signAccessToken, signRefreshToken } = require('../utils/auth');
const { hashPassword, comparePassword } = require('../utils/password');
const { validate } = require('../middlewares/validate');
const { loginSchema, signupSchema, refreshSchema } = require('../schemas/auth');

const router = express.Router();

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password, role } = req.validated.body;
  console.log('POST /auth/login', { email });

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) return res.status(401).json({ message: 'User not found. Please check your email.' });

  const match = await comparePassword(password, user.password);
  if (!match) return res.status(401).json({ message: 'Incorrect password. Please try again.' });

  if (role && user.role !== role) return res.status(403).json({ message: `Access denied. Account is not authorized for ${role} role.` });

  // Update push token if provided in request (optional enhancement)
  // if (req.body.pushToken) { await supabase.from('users').update({ push_token: req.body.pushToken }).eq('id', user.id); }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.json({ accessToken, refreshToken, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
});

router.post('/signup', validate(signupSchema), async (req, res) => {
  const { email, password, name, role } = req.validated.body;
  console.log('POST /auth/signup', { email, role });

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) return res.status(409).json({ message: 'Email already registered' });

  const hashed = await hashPassword(password);
  const newUser = {
    // id: `u_${Date.now()}`, // Let Supabase generate UUID
    email,
    password: hashed,
    name,
    role,
    push_token: req.body.pushToken || null
  };

  const { error } = await supabase.from('users').insert(newUser);

  if (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ message: 'Failed to create user' });
  }

  const accessToken = signAccessToken(newUser);
  const refreshToken = signRefreshToken(newUser);
  res.status(201).json({ accessToken, refreshToken, user: { id: newUser.id, name: newUser.name, role: newUser.role, email: newUser.email } });
});

router.post('/refresh', validate(refreshSchema), async (req, res) => {
  const { refreshToken } = req.validated.body;
  try {
    const { id } = require('../utils/auth').verifyRefreshToken(refreshToken);
    const { data: user } = await supabase.from('users').select('*').eq('id', id).single();
    
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });
    
    const accessToken = signAccessToken(user);
    return res.json({ accessToken });
  } catch (e) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

module.exports = router;
