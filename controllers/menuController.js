const supabase = require('../utils/supabase');

const getRestaurants = async (req, res) => {
  try {
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('*');
      
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
    res.status(500).json({ message: error.message });
  }
};

const getRestaurantItems = async (req, res) => {
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
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
    getRestaurants,
    getRestaurantItems
};
