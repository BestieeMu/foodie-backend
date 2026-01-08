const { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/auth');

describe('Auth utils JWT', () => {
  const user = { id: 'u_test', email: 'test@foodie.com', role: 'customer' };

  it('signs and verifies access token', () => {
    const token = signAccessToken(user);
    const payload = verifyAccessToken(token);
    expect(payload.id).toBe(user.id);
    expect(payload.email).toBe(user.email);
    expect(payload.role).toBe(user.role);
  });

  it('signs and verifies refresh token', () => {
    const token = signRefreshToken(user);
    const payload = verifyRefreshToken(token);
    expect(payload.id).toBe(user.id);
  });
});