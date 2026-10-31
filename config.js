const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'simulasi-dev-jwt-secret-change-me',
  gatewaySecret: process.env.GATEWAY_SECRET || 'simulasi-gateway-secret-change-me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '10m',
  serviceTokenTtl: process.env.SERVICE_TOKEN_TTL || '5m',
  refreshTokenTtlMs: toNumber(process.env.REFRESH_TOKEN_TTL_MS, 24 * 60 * 60 * 1000),
  ports: {
    gateway: toNumber(process.env.GATEWAY_PORT, 3000),
    nilai: toNumber(process.env.NILAI_PORT, 3001),
    transkrip: toNumber(process.env.TRANSKRIP_PORT, 3002)
  },
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:3000',
  services: {
    nilai: process.env.NILAI_URL || 'http://127.0.0.1:3001',
    transkrip: process.env.TRANSKRIP_URL || 'http://127.0.0.1:3002'
  },
  accessStartHour: toNumber(process.env.ACCESS_START_HOUR, 7),
  accessEndHour: toNumber(process.env.ACCESS_END_HOUR, 21),
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'simulasi.db'),
  serviceClient: {
    id: process.env.SERVICE_CLIENT_ID || 'service-nilai',
    secret: process.env.SERVICE_CLIENT_SECRET || 'nilai-secret-2026'
  }
};
