const supabase = require('../utils/supabase');

const getSettings = async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('system_settings')
      .select('*')
      .single();

    if (error) {
        // If no settings found, return defaults
        return res.json({
            tax_rate: 5,
            commission_rate: 10,
            currency: 'USD',
            delivery_fee: 5 // Default if not in DB, though schema doesn't have it yet, maybe we should add it?
            // Actually schema has tax_rate. Delivery fee might be dynamic or flat.
            // Let's assume flat delivery fee isn't in system_settings yet based on schema.
            // But we need it. I'll stick to what's in schema + a default delivery fee for now.
        });
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSettings
};
