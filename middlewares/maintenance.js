const supabase = require('../utils/supabase');

const maintenanceMiddleware = async (req, res, next) => {
  // Allow super admin routes and auth routes to bypass maintenance mode
  if (req.path.startsWith('/api/super') || req.path.startsWith('/api/auth')) {
    return next();
  }

  try {
    const { data: settings, error } = await supabase
      .from('system_settings')
      .select('maintenance_mode')
      .single();

    if (error) {
      console.error('Error fetching maintenance mode:', error);
      // Fail open: let requests through if we can't check
      return next();
    }

    if (settings && settings.maintenance_mode) {
      return res.status(503).json({
        message: 'The platform is currently undergoing maintenance. Please check back later.',
        isMaintenance: true
      });
    }

    next();
  } catch (err) {
    console.error('Maintenance middleware error:', err);
    next();
  }
};

module.exports = maintenanceMiddleware;
