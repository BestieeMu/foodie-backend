const supabase = require('../utils/supabase');

const getRestaurants = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('*')
      .range(offset, offset + limit - 1);
      
    if (error) throw error;

    res.json(
      restaurants.map(r => ({
        id: r.id,
        name: r.name,
        rating: r.rating,
        categories: r.categories,
        imageUrl: r.image_url, // map snake_case to camelCase
        address: r.address,
      }))
    );
  } catch (error) {
    next(error);
  }
};

const getRestaurantItems = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: rest, error: restError } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', id)
      .single();

    if (restError || !rest) return res.status(404).json({ message: 'Restaurant not found' });

    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', rest.id);

    if (itemsError) throw itemsError;

    // Map snake_case to camelCase
    const mappedItems = items.map(i => ({
      ...i,
      imageUrl: i.image_url,
      isAvailable: i.is_available
    }));

    res.json(mappedItems);
  } catch (error) {
    next(error);
  }
};

module.exports = {
    getRestaurants,
    getRestaurantItems
};
