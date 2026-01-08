const bcrypt = require('bcryptjs');

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function comparePassword(plain, hashed) {
  const isBcryptHash = typeof hashed === 'string' && /^\$2[aby]\$/.test(hashed);
  if (!isBcryptHash) {
    return plain === hashed;
  }
  return bcrypt.compare(plain, hashed);
}

module.exports = { hashPassword, comparePassword };