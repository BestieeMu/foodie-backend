const supabase = require('./utils/supabase');

const statuses = [
  'pending',
  'confirmed',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'arrived_pickup',
  'picked_up',
  'on_the_way',
  'delivered',
  'cancelled',
  'rejected',
  'scheduled'
];

async function testAll() {
  const orderId = 'b2425d17-c4b9-4a19-93e2-7c28d4ef2b0d';
  console.log('Testing database constraints directly...');
  
  for (const status of statuses) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select();
    
    if (error) {
      console.log(`❌ DB update failed for status [${status}]:`, error.message);
    } else {
      console.log(`✅ DB update succeeded for status [${status}]`);
    }
  }
}

testAll();
