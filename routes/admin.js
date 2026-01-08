const express = require('express');
const supabase = require('../utils/supabase');
const { authMiddleware, requireRole } = require('../utils/auth');
const { hashPassword } = require('../utils/password');

const router = express.Router();

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

// Dashboard Stats
router.get('/admin/dashboard/stats', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found for this admin' });

    // Fetch all orders for this restaurant
    // In production, you might want to limit this to last 30 days or aggregate in SQL
    const { data: restOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', rest.id);

    if (error) throw error;

    const today = new Date().toISOString().split('T')[0];
    
    const stats = {
      totalRevenue: restOrders.reduce((sum, o) => sum + (o.total || 0), 0),
      todayRevenue: restOrders
        .filter(o => o.created_at && o.created_at.startsWith(today))
        .reduce((sum, o) => sum + (o.total || 0), 0),
      totalOrders: restOrders.length,
      activeOrders: restOrders.filter(o => ['pending', 'preparing', 'ready_for_pickup', 'on_the_way'].includes(o.status)).length,
      popularItems: [],
      salesHistory: []
    };

    // Calculate last 7 days sales
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayOrders = restOrders.filter(o => o.created_at && o.created_at.startsWith(dateStr));
      const revenue = dayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      stats.salesHistory.push({ date: dateStr, revenue });
    }

    // Calculate Top Items
    const itemCounts = {};
    restOrders.forEach(o => {
      // items is stored as JSONB
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
    
    stats.popularItems = Object.entries(itemCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Orders
router.get('/admin/orders/my', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    const { data: myOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', rest.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    res.json(myOrders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Order Status
router.patch('/admin/orders/:orderId/status', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });

    // Verify ownership and update
    const { data: order, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('restaurant_id', rest.id)
      .select()
      .single();

    if (error || !order) return res.status(404).json({ message: 'Order not found or forbidden' });
    
    const io = req.app.locals.io;
    if (io) io.emit('orders:update', { type: 'status', orderId: order.id, status: order.status });
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Menu
router.get('/admin/menu/my', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    const { data: items, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', rest.id);

    if (error) throw error;
    
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add Menu Item
router.post('/admin/menu/item', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    const { name, description, price, category, image, options } = req.body;
    
    const newItem = {
      restaurant_id: rest.id,
      name,
      description,
      price: Number(price),
      category,
      image_url: image || '',
      is_available: true,
      options: options || { sizes: [], addOns: [], extras: [] }
    };
    
    const { data, error } = await supabase
      .from('menu_items')
      .insert(newItem)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Menu Item
router.patch('/admin/menu/item/:itemId', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    // Ensure item belongs to restaurant
    const { data: item, error } = await supabase
      .from('menu_items')
      .update(req.body) // Note: mapping req.body to snake_case cols might be needed if frontend sends camelCase
      .eq('id', req.params.itemId)
      .eq('restaurant_id', rest.id)
      .select()
      .single();
      
    if (error || !item) return res.status(404).json({ message: 'Item not found or forbidden' });
    
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Menu Item
router.delete('/admin/menu/item/:itemId', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', req.params.itemId)
      .eq('restaurant_id', rest.id);
      
    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Restaurant Info
router.patch('/admin/restaurant/my', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    const { name, address, imageUrl, categories } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (address) updates.address = address;
    if (imageUrl) updates.image_url = imageUrl;
    if (categories) updates.categories = categories;
    
    const { data, error } = await supabase
      .from('restaurants')
      .update(updates)
      .eq('id', rest.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// SUPER ADMIN ROUTES

// Get All Restaurants
router.get('/admin/restaurants', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('restaurants').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Platform Settings (Super Admin)
router.get('/admin/settings/platform', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    // In a real app, you might have a 'platform_settings' table
    // For now, we mock it or store in a special row
    res.json({
      platformName: 'Foodie Platform',
      commissionRate: 10,
      maintenanceMode: false,
      supportEmail: 'support@foodie.com'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create Restaurant & Admin (Atomic-ish)
router.post('/admin/restaurants', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { name, address, imageUrl, categories, adminEmail, adminPassword } = req.body;
    
    // Check email
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', adminEmail).single();
    if (existingUser) {
      return res.status(400).json({ message: 'Admin email already exists' });
    }

    // 1. Create Restaurant
    const { data: newRest, error: restError } = await supabase
      .from('restaurants')
      .insert({
        name,
        address,
        image_url: imageUrl,
        categories: categories || [],
        rating: 0
      })
      .select()
      .single();

    if (restError) throw restError;

    // 2. Create Admin User
    // Note: In Supabase Auth, you'd usually use supabase.auth.signUp()
    // But here we are using a custom users table for simplicity as per previous architecture
    const hashed = await hashPassword(adminPassword);
    
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email: adminEmail,
        password: hashed,
        name: `${name} Admin`,
        role: 'admin',
        restaurant_id: newRest.id
      })
      .select()
      .single();

    if (userError) throw userError;

    // Send Welcome Email
    await sendRestaurantWelcomeEmail(emailLower, newUser.name, adminPassword);

    res.status(201).json({ restaurant: newRest, admin: newUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Restaurant (Super Admin)
router.patch('/admin/restaurants/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { name, address, imageUrl, categories } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (address) updates.address = address;
    if (imageUrl) updates.image_url = imageUrl;
    if (categories) updates.categories = categories;

    const { data, error } = await supabase
      .from('restaurants')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(404).json({ message: 'Restaurant not found' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Restaurant
router.delete('/admin/restaurants/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    // With foreign keys and CASCADE DELETE, deleting restaurant should delete menu items and unlink users
    // But we might need to update users to remove restaurant_id
    const { error } = await supabase
      .from('restaurants')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Restaurant deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create Admin User for Restaurant
router.post('/admin/users', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { email, password, name, restaurantId } = req.body;
    
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashed = await hashPassword(password);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password: hashed,
        name,
        role: 'admin',
        restaurant_id: restaurantId
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Restaurant Info
router.get('/admin/restaurant/my', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    res.json(rest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Restaurant Staff (Admins & Drivers)
router.get('/admin/staff/my', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    const { data: staff, error } = await supabase
      .from('users')
      .select('*')
      .eq('restaurant_id', rest.id)
      .in('role', ['admin', 'driver'])
      .neq('id', req.user.id); // Exclude self

    if (error) throw error;
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add Staff Member
router.post('/admin/staff', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    const { email, password, name, role } = req.body;
    
    if (!['admin', 'driver'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashed = await hashPassword(password);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password: hashed,
        name,
        role,
        restaurant_id: rest.id
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Staff Member
router.patch('/admin/staff/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });

    const { email, password, name, role } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (role) updates.role = role;
    
    // Check ownership
    const { data: targetUser } = await supabase.from('users').select('*').eq('id', req.params.id).single();
    if (!targetUser || targetUser.restaurant_id !== rest.id) {
      return res.status(404).json({ message: 'User not found or forbidden' });
    }

    if (email && email !== targetUser.email) {
      const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
      if (existing) return res.status(400).json({ message: 'Email already exists' });
      updates.email = email;
    }

    if (password) {
      updates.password = await hashPassword(password);
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Staff Member
router.delete('/admin/staff/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    // Check ownership
    const { data: targetUser } = await supabase.from('users').select('*').eq('id', req.params.id).single();
    if (!targetUser || targetUser.restaurant_id !== rest.id) {
      return res.status(404).json({ message: 'User not found or forbidden' });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// SUPER ADMIN: Get All Users
router.get('/admin/users', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET REVIEWS (Restaurant Admin)
router.get('/admin/reviews/my', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    const { data: myReviews, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('restaurant_id', rest.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(myReviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET CUSTOMERS (Restaurant Admin)
router.get('/admin/customers/my', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const rest = await getAdminRestaurant(req.user.id);
    if (!rest) return res.status(404).json({ message: 'Restaurant not found' });
    
    // 1. Get all orders for this restaurant to find user IDs
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('user_id')
      .eq('restaurant_id', rest.id);
      
    if (ordersError) throw ordersError;
    
    const userIds = [...new Set(ordersData.map(o => o.user_id))];
    
    if (userIds.length === 0) return res.json([]);

    // 2. Fetch user details
    const { data: customers, error: usersError } = await supabase
      .from('users')
      .select('id, name, email, created_at')
      .in('id', userIds);

    if (usersError) throw usersError;
    
    res.json(customers.map(c => ({
      ...c,
      joinedAt: c.created_at // Map created_at to joinedAt
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
