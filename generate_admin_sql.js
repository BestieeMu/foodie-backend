const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('./utils/password');

async function generateAdminSql() {
  const email = 'admin@foodie.com';
  const password = 'password123';
  const name = 'Super Admin';
  const role = 'super_admin';

  try {
    const hashed = await hashPassword(password);
    const id = uuidv4();

    console.log(`
-- Run this in your Supabase SQL Editor:
INSERT INTO users (id, email, password, name, role, is_verified)
VALUES (
  '${id}',
  '${email}',
  '${hashed}',
  '${name}',
  '${role}',
  true
);
`);
  } catch (err) {
      console.error(err);
  }
}

generateAdminSql();
