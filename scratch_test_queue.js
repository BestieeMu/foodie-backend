const supabase = require('./utils/supabase');

async function run() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, restaurant:restaurant_id(name, address)')
    .eq('type', 'delivery')
    .is('driver_id', null)
    .in('status', ['pending', 'preparing', 'ready_for_pickup']) 
    .order('created_at', { ascending: true })
    .limit(50);
    
  if (error) {
    console.error('ERROR RUNNING SELECT:', error);
  } else {
    console.log('SUCCESS! DATA LENGTH:', data.length);
    console.log('FIRST ITEM:', data[0]);
  }
}

run();
