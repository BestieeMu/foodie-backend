const express = require('express');
const supabase = require('../utils/supabase');
const { authMiddleware } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { updateProfileSchema } = require('../schemas/profile');

const router = express.Router();

router.get('/profile/:userId', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.userId)
      .single();

    if (error || !user) return res.status(404).json({ message: 'User not found' });

    // Only allow current user or admin to view
    const requester = req.user;
    if (requester.id !== user.id && requester.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json({ id: user.id, name: user.name, role: user.role, email: user.email, phone: user.phone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/profile/:userId', authMiddleware, validate(updateProfileSchema), async (req, res) => {
  try {
    const requester = req.user;
    if (requester.id !== req.params.userId && requester.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, phone } = req.validated.body;
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.params.userId)
      .select()
      .single();

    if (error) return res.status(404).json({ message: 'User not found' });

    res.json({ id: user.id, name: user.name, role: user.role, email: user.email, phone: user.phone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
