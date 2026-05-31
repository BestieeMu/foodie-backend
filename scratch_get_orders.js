const supabase = require('./utils/supabase');
async function run() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, user_id, restaurant_id, status, total, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching orders:', error);
  } else {
    console.log('Orders in database:', orders);
  }
}
run();
