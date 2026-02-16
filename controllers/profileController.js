const supabase = require('../utils/supabase');

const getProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) return res.status(404).json({ message: 'User not found' });

    // Only allow current user or admin to view
    const requester = req.user;
    if (requester.id !== user.id && requester.role !== 'admin' && requester.role !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json({ id: user.id, name: user.name, role: user.role, email: user.email, phone: user.phone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const requester = req.user;
    if (requester.id !== userId && requester.role !== 'admin' && requester.role !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, phone } = req.validated.body;
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) return res.status(404).json({ message: 'User not found' });

    res.json({ id: user.id, name: user.name, role: user.role, email: user.email, phone: user.phone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
    getProfile,
    updateProfile
};
