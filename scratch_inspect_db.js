const supabase = require('./utils/supabase');

async function run() {
  // Query all policies
  const { data: policies, error: polErr } = await supabase
    .from('pg_policies')
    .select('*');
  console.log('POLICIES:', polErr || policies);

  // Query all triggers
  const { data: triggers, error: trigErr } = await supabase
    .from('pg_trigger')
    .select('*');
  console.log('TRIGGERS:', trigErr || triggers);
}

run();
