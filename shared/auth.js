const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const ISSUER = 'simulasi-gateway';

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      nama: user.nama,
      role: user.role,
      nim: user.nim || null,
      type: 'access'
    },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl, issuer: ISSUER }
  );
}

function signServiceToken(clientId) {
  return jwt.sign(
    {
      sub: clientId,
      username: clientId,
      nama: clientId,
      role: 'service',
      type: 'service'
    },
    config.jwtSecret,
    { expiresIn: config.serviceTokenTtl, issuer: ISSUER }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { issuer: ISSUER });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

module.exports = {
  signAccessToken,
  signServiceToken,
  verifyToken,
  hashToken,
  hashSecret,
  safeEqual,
  createRefreshToken
};
