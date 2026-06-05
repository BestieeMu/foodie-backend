const supabase = require('../utils/supabase');

const getHomeData = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : req.query.userId;

    // 1. Fetch Promotions/Banners
    const { data: banners, error: bannersErr } = await supabase
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    // 2. Fetch Popular Restaurants
    const { data: popularRestaurants, error: popErr } = await supabase
      .from('restaurants')
      .select('*')
      .order('rating', { ascending: false })
      .order('review_count', { ascending: false })
      .limit(10);

    // 3. Fetch New Restaurants
    const { data: newRestaurants, error: newErr } = await supabase
      .from('restaurants')
      .select('*')
      .eq('is_new', true)
      .limit(10);

    // 4. Fetch Trending Items
    const { data: trendingItems, error: trendErr } = await supabase
      .from('menu_items')
      .select('*, restaurants(name)')
      .eq('is_available', true)
      .eq('is_trending', true)
      .limit(10);

    // 5. Dietary/Lifestyle sections
    // Simple approach: get items with 'Vegan' or 'Halal' in their dietary_labels array
    const { data: dietaryItems } = await supabase
      .from('menu_items')
      .select('*, restaurants(name)')
      .eq('is_available', true)
      .neq('dietary_labels', '{}')
      .limit(15);

    // 6. Quick Reorder (Recent user orders)
    let quickReorder = [];
    if (userId) {
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('*, restaurants(name, image_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      quickReorder = recentOrders || [];
    }

    // 7. Offers/Coupons
    const { data: offers, error: offersErr } = await supabase
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .limit(5);

    // Helper to map restaurant snake_case to camelCase
    const mapRestaurant = (r) => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      categories: r.categories,
      imageUrl: r.image_url,
      address: r.address,
      deliveryFee: r.delivery_fee,
      minOrder: r.min_order,
      estimatedDeliveryTime: r.estimated_delivery_time,
      reviewCount: r.review_count,
      isNew: r.is_new,
      promotionalBadges: r.promotional_badges
    });

    // Helper to map menu item snake_case to camelCase
    const mapItem = (i) => ({
      ...i,
      imageUrl: i.image_url,
      isAvailable: i.is_available,
      dietaryLabels: i.dietary_labels || [],
      isTrending: i.is_trending,
      orderCount: i.order_count,
      restaurantName: i.restaurants ? i.restaurants.name : 'Restaurant'
    });

    res.json({
      banners: (banners || []).map(b => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        imageUrl: b.image_url,
        campaignType: b.campaign_type,
        link: b.link
      })),
      categories: ['All', 'Pizza & Italian', 'Burgers & Fast Food', 'Sushi & Japanese', 'African', 'Healthy / Salads', 'Desserts', 'Beverages'],
      popularRestaurants: (popularRestaurants || []).map(mapRestaurant),
      newRestaurants: (newRestaurants || []).map(mapRestaurant),
      trendingItems: (trendingItems || []).map(mapItem),
      dietaryItems: (dietaryItems || []).map(mapItem),
      quickReorder: quickReorder,
      offers: (offers || []).map(o => ({
        id: o.id,
        code: o.code,
        description: o.description,
        discountAmount: o.discount_amount,
        isPercentage: o.is_percentage,
        minOrderAmount: o.min_order_amount
      }))
    });

  } catch (error) {
    console.error('Home data error:', error);
    next(error);
  }
};

module.exports = {
  getHomeData
};
