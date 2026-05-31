const supabase = require('./utils/supabase');
async function run() {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .limit(10);
  if (error) {
    console.error('Error fetching users:', error);
  } else {
    console.log('Users:', users.map(u => ({ id: u.id, name: u.name, role: u.role, email: u.email })));
  }
}
run();
