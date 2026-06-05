const supabase = require('./utils/supabase');

async function run() {
  const { data, error } = await supabase.from('restaurants').select('*').limit(1);
  if (error) {
    console.error('ERROR SELECTING RESTAURANT:', error);
  } else {
    console.log('RESTAURANT COLUMNS:', Object.keys(data[0] || {}));
    console.log('SAMPLE RECORD:', data[0]);
  }
}

run();
