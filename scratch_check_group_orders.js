const supabase = require('./utils/supabase');

async function run() {
  const { data, error } = await supabase
    .from('group_orders')
    .select('id')
    .limit(1);
    
  console.log('Query direct ID error:', error);

  // Let's query information_schema columns for group_orders
  const { data: cols, error: colsErr } = await supabase
    .from('group_orders')
    .select('updated_at')
    .limit(1);
  console.log('Query updated_at error:', colsErr);
}

run();
