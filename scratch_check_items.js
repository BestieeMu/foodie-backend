const supabase = require('./utils/supabase');
async function run() {
  const { data: restaurants } = await supabase.from('restaurants').select('id, name');
  console.log('Restaurants in DB:', restaurants);
  const { data: items } = await supabase.from('menu_items').select('id, name, restaurant_id');
  console.log('Menu Items in DB:', items ? items.slice(0, 5) : null);
}
run();
