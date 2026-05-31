const supabase = require('./utils/supabase');
async function run() {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', 'u_1780241981102')
    .single();
  if (error) {
    console.error('Error fetching user:', error);
  } else {
    console.log('Bimbo Restaurant Admin user row:', user);
  }
}
run();
