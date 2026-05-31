const { v4: uuidv4 } = require('uuid');
const supabase = require('./utils/supabase');
const { hashPassword } = require('./utils/password');

async function createSuperAdmin() {
  const email = 'admin@foodie.com';
  const password = 'password123';
  const name = 'Super Admin';
  const role = 'super_admin';

  try {
    const hashed = await hashPassword(password);

    const newUser = {
      id: uuidv4(),
      email,
      password: hashed,
      name,
      role,
      is_verified: true,
    };

    const { data, error } = await supabase.from('users').insert(newUser).select().single();
    
    if (error) {
      if (error.code === '23505') {
          console.log('Super admin already exists with this email.');
      } else {
          console.error('Error creating super admin:', error);
      }
    } else {
      console.log('Successfully created super admin!');
      console.log('Email:', email);
      console.log('Password:', password);
    }
  } catch (err) {
      console.error(err);
  }
}

createSuperAdmin();
