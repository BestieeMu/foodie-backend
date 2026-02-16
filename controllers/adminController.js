const supabase = require('../utils/supabase');
const { hashPassword } = require('../utils/password');

// Helper to get admin's restaurant
const getAdminRestaurant = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('restaurant_id')
    .eq('id', userId)
    .single();
  
  if (error || !user || !user.restaurant_id) return null;
  
  const { data: restaurant, error: restError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', user.restaurant_id)
    .single();

  if (restError) return null;
  return restaurant;
};

// --- Restaurant Admin Controllers ---

const getRestaurantStats = async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found for this admin' });

    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // Fetch orders for the last 7 days only for efficiency
    // For total revenue, we might need a separate query or a summary table in a real large-scale app
    // Here we'll fetch all for simplicity but in a real "top-notch" app we'd use aggregate functions (sum) via RPC or separate queries
    
    // 1. Get Today's Revenue & Count
    const { data: todayOrders, error: todayError } = await supabase
        .from('orders')
        .select('total, status')
        .eq('restaurant_id', rest.id)
        .gte('created_at', today + 'T00:00:00');
    
    if (todayError) throw todayError;

    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const activeOrders = todayOrders.filter(o => ['pending', 'preparing', 'ready_for_pickup', 'on_the_way'].includes(o.status)).length;

    // 2. Get Last 7 Days for Graph
    const { data: weekOrders, error: weekError } = await supabase
        .from('orders')
        .select('total, created_at, items')
        .eq('restaurant_id', rest.id)
        .gte('created_at', sevenDaysAgoStr + 'T00:00:00');

    if (weekError) throw weekError;

    const salesHistory = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayOrders = weekOrders.filter(o => o.created_at && o.created_at.startsWith(dateStr));
        const revenue = dayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        salesHistory.push({ date: dateStr, revenue });
    }

    // 3. Get Popular Items (from week orders to be faster, or all time if needed)
    const itemCounts = {};
    weekOrders.forEach(o => {
      let items = o.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) {}
      }
      
      if (Array.isArray(items)) {
        items.forEach(item => {
          const name = item.name || 'Unknown';
          itemCounts[name] = (itemCounts[name] || 0) + (item.quantity || 1);
        });
      }
    });
    
    const popularItems = Object.entries(itemCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // 4. Total Revenue (This might be heavy, consider caching or dedicated table)
    // For now, let's just use what we have or do a separate count query
    // Optimizing: Only fetch sum
    // Supabase JS doesn't support aggregate .sum() directly without RPC usually, but we can select only 'total'
    const { data: allOrders, error: allError } = await supabase
        .from('orders')
        .select('total')
        .eq('restaurant_id', rest.id);
        
    const totalRevenue = allOrders ? allOrders.reduce((sum, o) => sum + (o.total || 0), 0) : 0;
    const totalOrders = allOrders ? allOrders.length : 0;

    const stats = {
      totalRevenue,
      todayRevenue,
      totalOrders,
      activeOrders,
      popularItems,
      salesHistory
    };

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getRestaurantOrders = async (req, res) => {
    try {
        const rest = await getAdminRestaurant(req.user.id);
        if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
        
        const { data: orders, error } = await supabase
          .from('orders')
          .select('*, driver:driver_id(name, phone), user:user_id(name, phone)')
          .eq('restaurant_id', rest.id)
          .order('created_at', { ascending: false });
    
        if (error) throw error;
        res.json(orders);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
};

// --- Super Admin Controllers ---

const getAllRestaurants = async (req, res) => {
    try {
        const { data: restaurants, error } = await supabase
            .from('restaurants')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(restaurants);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createRestaurant = async (req, res) => {
    try {
        const { name, address, categories, image_url, email, password, adminName } = req.body;
        
        // 1. Create Restaurant
        const { data: rest, error: restError } = await supabase
            .from('restaurants')
            .insert({
                id: `r_${Date.now()}`, // Or use UUID
                name,
                address,
                categories,
                image_url,
                rating: 5.0
            })
            .select()
            .single();

        if (restError) throw restError;

        // 2. Create Admin User for this Restaurant
        const hashed = await hashPassword(password);
        const { error: userError } = await supabase
            .from('users')
            .insert({
                id: `u_${Date.now()}`,
                email,
                password: hashed,
                name: adminName,
                role: 'admin',
                restaurant_id: rest.id,
                is_verified: true
            });

        if (userError) {
            // Rollback restaurant creation (Manually delete)
            await supabase.from('restaurants').delete().eq('id', rest.id);
            throw userError;
        }

        res.status(201).json({ message: 'Restaurant and Admin created', restaurant: rest });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllUsers = async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, email, role, created_at, is_verified, restaurant_id')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSystemStats = async (req, res) => {
    try {
        // Super admin dashboard stats
        const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const { count: restCount } = await supabase.from('restaurants').select('*', { count: 'exact', head: true });
        const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
        
        // Total platform revenue (if using commission model)
        // This is simplified.
        const { data: settings } = await supabase.from('system_settings').select('*').single();

        res.json({
            users: userCount,
            restaurants: restCount,
            orders: orderCount,
            settings
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getRestaurantStats,
    getRestaurantOrders,
    getAllRestaurants,
    createRestaurant,
    getAllUsers,
    getSystemStats
};
