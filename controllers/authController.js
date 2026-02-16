const supabase = require('../utils/supabase');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/auth');
const { hashPassword, comparePassword } = require('../utils/password');
const { sendOtpEmail } = require('../utils/email');

// Helper to generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const login = async (req, res) => {
  const { email, password, role } = req.validated.body;
  console.log('POST /auth/login', { email });

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) return res.status(401).json({ message: 'User not found. Please check your email.' });

    const match = await comparePassword(password, user.password);
    if (!match) return res.status(401).json({ message: 'Incorrect password. Please try again.' });

    if (role && user.role !== role) {
        // Allow super_admin to login as admin
        if (role === 'admin' && user.role === 'super_admin') {
            // allowed
        } else {
            return res.status(403).json({ message: `Access denied. Account is not authorized for ${role} role.` });
        }
    }

    // Check verification status (skip for admins/super_admins usually, but enforcing for all now)
    if (!user.is_verified && user.role !== 'admin' && user.role !== 'super_admin') {
      // Generate new OTP
      const otp = generateOtp();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      await supabase.from('users').update({ otp_code: otp, otp_expires: expires }).eq('id', user.id);
      await sendOtpEmail(user.email, otp);

      return res.status(403).json({ 
        message: 'Account not verified. OTP sent to email.', 
        code: 'UNVERIFIED',
        email: user.email 
      });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const dummyRes = {
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlJlZnJlc2ggVG9rZW4iLCJpYXQiOjE1MTYyMzkwMjJ9.8XxK4wRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw6d",
  "user": {
    "id": 12345,
    "name": "John Doe",
    "role": "admin",
    "email": "john.doe@example.com",
    "restaurant_id": 42
  }
}
    res.json({ accessToken, refreshToken, user: { id: user.id, name: user.name, role: user.role, email: user.email, restaurant_id: user.restaurant_id } });
    // res.json({ accessToken, refreshToken, user: { id: user.id, name: user.name, role: user.role, email: user.email, restaurant_id: user.restaurant_id } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const signup = async (req, res) => {
  const { email, password, name, role } = req.validated.body;
  console.log('POST /auth/signup', { email, role });

  try {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const hashed = await hashPassword(password);
    const otp = generateOtp();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    const newUser = {
      email,
      password: hashed,
      name,
      role,
      push_token: req.body.pushToken || null,
      is_verified: false,
      otp_code: otp,
      otp_expires: expires
    };

    const { data, error } = await supabase.from('users').insert(newUser).select().single();

    if (error) {
      console.error('Signup error:', error);
      return res.status(500).json({ message: 'Failed to create user' });
    }

    // Send OTP
    await sendOtpEmail(email, otp);

    res.status(201).json({ 
      message: 'Account created. Please verify OTP.',
      email: email,
      requiresVerification: true 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  
  try {
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.otp_code !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date(user.otp_expires) < new Date()) return res.status(400).json({ message: 'OTP expired' });

    await supabase.from('users').update({ is_verified: true, otp_code: null, otp_expires: null }).eq('id', user.id);

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({ message: 'Verified successfully', accessToken, refreshToken, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token required' });

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const { data: user, error } = await supabase.from('users').select('*').eq('id', decoded.id).single();

    if (error || !user) return res.status(401).json({ message: 'Invalid refresh token' });

    const newAccessToken = signAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

module.exports = {
  login,
  signup,
  verifyOtp,
  refreshToken
};
