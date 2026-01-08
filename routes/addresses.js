const express = require('express');
const supabase = require('../utils/supabase');
const { authMiddleware } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { createAddressSchema, getUserAddressesSchema } = require('../schemas/addresses');

const router = express.Router();

router.get('/addresses/:userId', authMiddleware, validate(getUserAddressesSchema), async (req, res) => {
  try {
    const { userId } = req.validated.params;
    const requester = req.user;
    if (requester.id !== userId && requester.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { data: addresses, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(addresses || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/addresses', authMiddleware, validate(createAddressSchema), async (req, res) => {
  try {
    const { userId, label, street, city, lat, lng } = req.validated.body;
    const requester = req.user;
    if (requester.id !== userId && requester.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { data, error } = await supabase
      .from('addresses')
      .insert({
        user_id: userId, // Ensure DB column is user_id
        label,
        street,
        city,
        lat,
        lng
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
