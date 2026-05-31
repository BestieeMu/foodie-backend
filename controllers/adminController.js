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

    const rangeParam = parseInt(req.query.range) || 7;
    const today = new Date().toISOString().split('T')[0];
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - rangeParam);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    // 1. Get Today's Revenue & Count
    const { data: todayOrders, error: todayError } = await supabase
        .from('orders')
        .select('total, status')
        .eq('restaurant_id', rest.id)
        .gte('created_at', today + 'T00:00:00');
    
    if (todayError) throw todayError;

    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const activeOrders = todayOrders.filter(o => ['pending', 'preparing', 'ready_for_pickup', 'on_the_way'].includes(o.status)).length;

    // 2. Get Range Days for Graph
    const { data: rangeOrders, error: rangeError } = await supabase
        .from('orders')
        .select('total, created_at, items')
        .eq('restaurant_id', rest.id)
        .gte('created_at', pastDateStr + 'T00:00:00');

    if (rangeError) throw rangeError;

    const salesHistory = [];
    for (let i = rangeParam - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayOrders = rangeOrders.filter(o => o.created_at && o.created_at.startsWith(dateStr));
        const revenue = dayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        salesHistory.push({ date: dateStr, revenue });
    }

    // 3. Get Popular Items (from range orders to be faster, or all time if needed)
    const itemCounts = {};
    rangeOrders.forEach(o => {
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

const updateRestaurant = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, categories, image_url, is_verified } = req.body;
        
        const updatePayload = { name, address, categories, image_url };
        if (is_verified !== undefined) {
            updatePayload.is_verified = is_verified;
        }

        const { data: updated, error } = await supabase
            .from('restaurants')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteRestaurant = async (req, res) => {
    try {
        const { id } = req.params;
        // First delete associated users to avoid foreign key constraint errors
        await supabase.from('users').delete().eq('restaurant_id', id);
        
        const { error } = await supabase
            .from('restaurants')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Restaurant deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllOrders = async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*, restaurant:restaurant_id(name), user:user_id(name), driver:driver_id(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyRestaurant = async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('restaurant_id')
            .eq('id', req.user.id)
            .single();

        if (!user || !user.restaurant_id) {
            return res.status(404).json({ message: 'Restaurant not found for this admin' });
        }

        const { data: restaurant, error } = await supabase
            .from('restaurants')
            .select('*')
            .eq('id', user.restaurant_id)
            .single();

        if (error) throw error;
        
        // Return matching format for frontend Settings.tsx
        res.json({
            id: restaurant.id,
            name: restaurant.name,
            address: restaurant.address,
            imageUrl: restaurant.image_url,
            categories: restaurant.categories
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateMyRestaurant = async (req, res) => {
    try {
        const { name, address, categories, imageUrl } = req.body;
        
        const { data: user } = await supabase
            .from('users')
            .select('restaurant_id')
            .eq('id', req.user.id)
            .single();

        if (!user || !user.restaurant_id) {
            return res.status(404).json({ message: 'Restaurant not found for this admin' });
        }

        const { data: updated, error } = await supabase
            .from('restaurants')
            .update({ name, address, categories, image_url: imageUrl })
            .eq('id', user.restaurant_id)
            .select()
            .single();

        if (error) throw error;
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyStaff = async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('restaurant_id')
            .eq('id', req.user.id)
            .single();

        if (!user || !user.restaurant_id) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        const { data: staff, error } = await supabase
            .from('users')
            .select('id, name, email, role, created_at')
            .eq('restaurant_id', user.restaurant_id)
            .in('role', ['admin', 'driver']);

        if (error) throw error;
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createStaff = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        const { data: user } = await supabase
            .from('users')
            .select('restaurant_id')
            .eq('id', req.user.id)
            .single();

        if (!user || !user.restaurant_id) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        // We use auth signup first if needed, or simply insert into users if using custom auth
        // Assuming we insert directly into users table with password hash for our custom auth
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const { v4: uuidv4 } = require('uuid');

        const { data: newStaff, error } = await supabase
            .from('users')
            .insert({
                id: uuidv4(),
                name,
                email,
                password: hashedPassword,
                role,
                restaurant_id: user.restaurant_id,
                is_verified: true
            })
            .select('id, name, email, role')
            .single();

        if (error) throw error;
        res.json(newStaff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, password } = req.body;

        const updateData = { name, email, role };
        
        if (password) {
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const { data: updated, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', id)
            .select('id, name, email, role')
            .single();

        if (error) throw error;
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteStaff = async (req, res) => {
    try {
        const { id } = req.params;
        
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Staff deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyCustomers = async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('restaurant_id')
            .eq('id', req.user.id)
            .single();

        if (!user || !user.restaurant_id) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        const { data: orders, error } = await supabase
            .from('orders')
            .select('user_id, total, created_at, user:user_id(name, email)')
            .eq('restaurant_id', user.restaurant_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Aggregate orders by customer
        const customerMap = {};
        for (const o of orders) {
            if (!o.user) continue;
            if (!customerMap[o.user_id]) {
                customerMap[o.user_id] = {
                    id: o.user_id,
                    name: o.user.name,
                    email: o.user.email,
                    ordersCount: 0,
                    totalSpent: 0,
                    joinedAt: o.created_at, // First order seen (orders are desc, so this starts as newest, but we'll update it)
                    lastOrderDate: o.created_at
                };
            }
            customerMap[o.user_id].ordersCount += 1;
            customerMap[o.user_id].totalSpent += (o.total || 0);
            
            const oDate = new Date(o.created_at);
            if (oDate > new Date(customerMap[o.user_id].lastOrderDate)) {
                customerMap[o.user_id].lastOrderDate = o.created_at;
            }
            if (oDate < new Date(customerMap[o.user_id].joinedAt)) {
                customerMap[o.user_id].joinedAt = o.created_at;
            }
        }

        res.json(Object.values(customerMap));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyReviews = async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('restaurant_id')
            .eq('id', req.user.id)
            .single();

        if (!user || !user.restaurant_id) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('id, rating, comment, created_at, order_id, user:user_id(name)')
            .eq('restaurant_id', user.restaurant_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(reviews.map(r => ({
            id: r.id,
            orderId: r.order_id,
            customerName: r.user?.name || 'Unknown Customer',
            rating: r.rating,
            comment: r.comment,
            createdAt: r.created_at
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getRestaurantStats,
    getRestaurantOrders,
    getAllRestaurants,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
    getAllUsers,
    getSystemStats,
    getAllOrders,
    getMyRestaurant,
    updateMyRestaurant,
    getMyStaff,
    createStaff,
    updateStaff,
    deleteStaff,
    getMyCustomers,
    getMyReviews
};
