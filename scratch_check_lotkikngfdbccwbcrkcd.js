const { createClient } = require('@supabase/supabase-js');

async function run() {
  const url = 'https://lotkikngfdbccwbcrkcd.supabase.co';
  const key = 'sb_publishable_V1Rifl2v5DJXsXo_n8dSoA_woBXMVX4';
  
  const supabase = createClient(url, key);
  
  const { data, error } = await supabase.from('restaurants').select('*').limit(1);
  if (error) {
    console.error('ERROR ON LOTKIKNGFDBCCWBCRKCD:', error);
  } else {
    console.log('RESTAURANTS COLUMNS:', Object.keys(data[0] || {}));
    console.log('RESTAURANTS RECORD:', data[0]);
  }
}

run();
