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

const getMyMenu = async (req, res, next) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('restaurant_id')
      .eq('id', req.user.id)
      .single();

    if (!user || !user.restaurant_id) return res.status(404).json({ message: 'Restaurant not found' });

    const { data: items, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', user.restaurant_id);

    if (error) throw error;

    res.json(items.map(i => ({
      ...i,
      imageUrl: i.image_url,
      isAvailable: i.is_available
    })));
  } catch (error) {
    next(error);
  }
};

const createMenuItem = async (req, res, next) => {
  try {
    const { name, description, price, category, image, options } = req.body;

    const { data: user } = await supabase
      .from('users')
      .select('restaurant_id')
      .eq('id', req.user.id)
      .single();

    if (!user || !user.restaurant_id) return res.status(404).json({ message: 'Restaurant not found' });

    const { data: item, error } = await supabase
      .from('menu_items')
      .insert({
        restaurant_id: user.restaurant_id,
        name,
        description,
        price,
        category,
        image_url: image,
        options,
        is_available: true
      })
      .select()
      .single();

    if (error) throw error;
    res.json(item);
  } catch (error) {
    next(error);
  }
};

const updateMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, image, options, isAvailable } = req.body;

    const { data: item, error } = await supabase
      .from('menu_items')
      .update({
        name,
        description,
        price,
        category,
        image_url: image,
        options,
        is_available: isAvailable !== undefined ? isAvailable : true
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(item);
  } catch (error) {
    next(error);
  }
};

const deleteMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Menu item deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
    getRestaurants,
    getRestaurantItems,
    getMyMenu,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem
};
