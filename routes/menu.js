const express = require('express');
const supabase = require('../utils/supabase');

const router = express.Router();

// Align to frontend: /menu/restaurants
router.get('/menu/restaurants', async (req, res) => {
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
});

// Align to frontend: /menu/restaurants/:id/items
router.get('/menu/restaurants/:id/items', async (req, res) => {
  try {
    const { data: rest, error: restError } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (restError || !rest) return res.status(404).json({ message: 'Restaurant not found' });

    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', rest.id);

    if (itemsError) throw itemsError;

    // Map snake_case to camelCase if needed, but keeping it simple for now
    // If frontend expects 'imageUrl', we should map it
    const mappedItems = items.map(i => ({
      ...i,
      imageUrl: i.image_url,
      isAvailable: i.is_available
    }));

    res.json(mappedItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
