const supabase = require('./utils/supabase');
async function run() {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', 'b2425d17-c4b9-4a19-93e2-7c28d4ef2b0d')
    .select();
  if (error) {
    console.error('Update error:', error);
  } else {
    console.log('Update success:', data);
  }
}
run();
