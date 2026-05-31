const supabase = require('./utils/supabase');
async function run() {
  const { data: statuses, error: statusErr } = await supabase
    .from('orders')
    .select('status');
  if (statusErr) {
    console.error('Error fetching statuses:', statusErr);
  } else {
    console.log('Unique statuses in database:', [...new Set(statuses?.map(s => s.status))]);
  }
}
run();
