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

const getPlatformSettings = async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('system_settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.json({
      commissionRate: settings?.commission_rate || 10,
      taxRate: settings?.tax_rate || 5,
      currency: settings?.currency || 'USD',
      supportEmail: settings?.support_email || 'support@foodie.com',
      maintenanceMode: settings?.maintenance_mode || false
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updatePlatformSettings = async (req, res) => {
  try {
    const { commissionRate, taxRate, currency, supportEmail, maintenanceMode } = req.body;

    const { data: currentSettings } = await supabase.from('system_settings').select('id').single();

    let result;
    if (currentSettings) {
      result = await supabase
        .from('system_settings')
        .update({
          commission_rate: commissionRate,
          tax_rate: taxRate,
          currency,
          support_email: supportEmail,
          maintenance_mode: maintenanceMode
        })
        .eq('id', currentSettings.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('system_settings')
        .insert({
          commission_rate: commissionRate,
          tax_rate: taxRate,
          currency,
          support_email: supportEmail,
          maintenance_mode: maintenanceMode
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSettings,
  getPlatformSettings,
  updatePlatformSettings
};
