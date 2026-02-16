const supabase = require('../utils/supabase');

const getUserAddresses = async (req, res) => {
  try {
    const { userId } = req.validated.params;
    const requester = req.user;
    if (requester.id !== userId && requester.role !== 'admin' && requester.role !== 'super_admin') {
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
};

const createAddress = async (req, res) => {
  try {
    const { userId, label, street, city, lat, lng } = req.validated.body;
    const requester = req.user;
    if (requester.id !== userId && requester.role !== 'admin' && requester.role !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { data, error } = await supabase
      .from('addresses')
      .insert({
        user_id: userId,
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
};

module.exports = {
    getUserAddresses,
    createAddress
};
