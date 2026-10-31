const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');

const config = require('../config');
const db = require('../db/database');
const { decide } = require('./policy');
const {
  signAccessToken,
  signServiceToken,
  verifyToken,
  hashToken,
  hashSecret,
  safeEqual,
  createRefreshToken
} = require('../shared/auth');
const { labelJamAkses } = require('../shared/access');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function catatAudit({ req, subjek, role, hasil, alasan }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (waktu, subjek, role, method, endpoint, device, hasil, alasan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      subjek || '-',
      role || '-',
      req.method,
      req.originalUrl.split('?')[0],
      req.get('X-Device-ID') || '-',
      hasil,
      alasan || '-'
    );
  } catch (error) {
    console.error('[gateway] Gagal menulis audit log:', error.message);
  }
}

function ambilBearer(req) {
  const header = req.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function deviceMilikUser(userId, deviceId) {
  return Boolean(
    db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?').get(userId, deviceId)
  );
}

function protect(req, res, next) {
  const token = ambilBearer(req);
  const deviceId = req.get('X-Device-ID') || null;

  if (!token) {
    catatAudit({
      req,
      subjek: '-',
      role: '-',
      hasil: 'deny',
      alasan: 'Access token tidak dikirim'
    });
    return res.status(401).json({ error: 'Access token tidak dikirim' });
  }

  let auth;
  try {
    auth = verifyToken(token);
  } catch (error) {
    const alasan = error.name === 'TokenExpiredError'
      ? 'Access token sudah kedaluwarsa'
      : 'Access token tidak valid';
    catatAudit({ req, subjek: '-', role: '-', hasil: 'deny', alasan });
    return res.status(401).json({ error: alasan });
  }

  const decision = decide({
    auth,
    method: req.method,
    endpoint: req.originalUrl.split('?')[0],
    deviceId
  });

  catatAudit({
    req,
    subjek: auth.username || auth.sub,
    role: auth.role,
    hasil: decision.allow ? 'allow' : 'deny',
    alasan: decision.alasan
  });

  if (!decision.allow) {
    return res.status(403).json({ error: decision.alasan, code: 'POLICY_DENIED' });
  }

  req.auth = auth;
  return next();
}

app.get('/meta', (req, res) => {
  res.json({
    accessStartHour: config.accessStartHour,
    accessEndHour: config.accessEndHour,
    labelJamAkses: labelJamAkses()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', time: new Date().toISOString() });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const deviceId = req.get('X-Device-ID') || null;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !password || !bcrypt.compareSync(password, user.password_hash)) {
    catatAudit({
      req,
      subjek: username || '-',
      role: user ? user.role : '-',
      hasil: 'deny',
      alasan: 'Username atau password salah'
    });
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  if (!deviceId) {
    catatAudit({
      req,
      subjek: user.username,
      role: user.role,
      hasil: 'deny',
      alasan: 'Header X-Device-ID tidak dikirim saat login'
    });
    return res.status(400).json({ error: 'Header X-Device-ID wajib dikirim' });
  }

  if (!deviceMilikUser(user.id, deviceId)) {
    catatAudit({
      req,
      subjek: user.username,
      role: user.role,
      hasil: 'deny',
      alasan: 'Device tidak terdaftar untuk user'
    });
    return res.status(403).json({ error: 'Device tidak terdaftar untuk user ini' });
  }

  const accessToken = signAccessToken(user);
  const refreshToken = createRefreshToken();

  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked, created_at)
    VALUES (?, ?, ?, 0, ?)
  `).run(user.id, hashToken(refreshToken), Date.now() + config.refreshTokenTtlMs, new Date().toISOString());

  catatAudit({
    req,
    subjek: user.username,
    role: user.role,
    hasil: 'allow',
    alasan: 'Login berhasil, kredensial dan device valid'
  });

  return res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      nama: user.nama,
      role: user.role,
      nim: user.nim
    }
  });
});

app.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  const deviceId = req.get('X-Device-ID') || null;

  if (!refreshToken) {
    catatAudit({ req, hasil: 'deny', alasan: 'Refresh token tidak dikirim' });
    return res.status(400).json({ error: 'Refresh token wajib dikirim' });
  }

  const row = db.prepare(`
    SELECT rt.id, rt.user_id, rt.revoked, rt.expires_at, u.username, u.nama, u.role, u.nim
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ?
  `).get(hashToken(refreshToken));

  if (!row || row.revoked || row.expires_at <= Date.now()) {
    catatAudit({
      req,
      subjek: row ? row.username : '-',
      role: row ? row.role : '-',
      hasil: 'deny',
      alasan: 'Refresh token tidak valid, sudah dicabut, atau kedaluwarsa'
    });
    return res.status(401).json({ error: 'Refresh token tidak valid atau sudah dicabut' });
  }

  if (!deviceId || !deviceMilikUser(row.user_id, deviceId)) {
    catatAudit({
      req,
      subjek: row.username,
      role: row.role,
      hasil: 'deny',
      alasan: 'Device tidak valid saat refresh token'
    });
    return res.status(403).json({ error: 'Device tidak terdaftar untuk user ini' });
  }

  const accessToken = signAccessToken({
    id: row.user_id,
    username: row.username,
    nama: row.nama,
    role: row.role,
    nim: row.nim
  });

  catatAudit({
    req,
    subjek: row.username,
    role: row.role,
    hasil: 'allow',
    alasan: 'Refresh token valid, access token baru diterbitkan'
  });

  return res.json({ accessToken });
});

app.post('/auth/logout', (req, res) => {
  const { refreshToken } = req.body || {};
  const deviceId = req.get('X-Device-ID') || null;

  if (!refreshToken) {
    catatAudit({ req, hasil: 'deny', alasan: 'Refresh token tidak dikirim saat logout' });
    return res.status(400).json({ error: 'Refresh token wajib dikirim' });
  }

  const row = db.prepare(`
    SELECT rt.id, rt.user_id, rt.revoked, u.username, u.role
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ?
  `).get(hashToken(refreshToken));

  if (!row) {
    catatAudit({ req, hasil: 'deny', alasan: 'Refresh token tidak ditemukan saat logout' });
    return res.status(401).json({ error: 'Refresh token tidak valid' });
  }

  if (!deviceId || !deviceMilikUser(row.user_id, deviceId)) {
    catatAudit({
      req,
      subjek: row.username,
      role: row.role,
      hasil: 'deny',
      alasan: 'Device tidak valid saat logout'
    });
    return res.status(403).json({ error: 'Device tidak terdaftar untuk user ini' });
  }

  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(row.id);

  catatAudit({
    req,
    subjek: row.username,
    role: row.role,
    hasil: 'allow',
    alasan: 'Refresh token dicabut'
  });

  return res.json({ message: 'Logout berhasil, refresh token dicabut' });
});

app.post('/auth/service', (req, res) => {
  const { clientId, clientSecret } = req.body || {};

  if (!clientId || !clientSecret) {
    catatAudit({ req, hasil: 'deny', alasan: 'Client ID atau secret tidak dikirim' });
    return res.status(400).json({ error: 'Client ID dan secret wajib dikirim' });
  }

  const client = db.prepare('SELECT * FROM service_clients WHERE client_id = ?').get(clientId);

  if (!client || !safeEqual(hashSecret(clientSecret), client.client_secret_hash)) {
    catatAudit({
      req,
      subjek: clientId,
      role: 'service',
      hasil: 'deny',
      alasan: 'Client ID atau secret service salah'
    });
    return res.status(401).json({ error: 'Client ID atau secret service salah' });
  }

  const accessToken = signServiceToken(client.client_id);

  catatAudit({
    req,
    subjek: client.client_id,
    role: 'service',
    hasil: 'allow',
    alasan: 'Token service diterbitkan'
  });

  return res.json({ accessToken, tokenType: 'service' });
});

app.get('/audit', protect, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const rows = db.prepare(`
    SELECT id, waktu, subjek, role, method, endpoint, device, hasil, alasan
    FROM audit_logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);

  res.json({ data: rows });
});

const opsiProxy = (target) => ({
  target,
  changeOrigin: true,
  xfwd: true,
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-Gateway-Secret', config.gatewaySecret);
    fixRequestBody(proxyReq, req);
  },
  onError: (error, req, res) => {
    console.error(`[gateway] Proxy error ke ${target}:`, error.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Service tujuan tidak tersedia' });
    }
  }
});

const proxyNilai = createProxyMiddleware(['/nilai', '/kelas'], opsiProxy(config.services.nilai));
const proxyTranskrip = createProxyMiddleware(['/transkrip'], opsiProxy(config.services.transkrip));

app.use((req, res, next) => {
  const pathname = req.path;
  const butuhProteksi =
    pathname.startsWith('/nilai') ||
    pathname.startsWith('/kelas') ||
    pathname.startsWith('/transkrip');

  if (butuhProteksi) return protect(req, res, next);
  return next();
});

app.use(proxyNilai);
app.use(proxyTranskrip);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

app.use((error, req, res, next) => {
  console.error('[gateway] Error:', error.message);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Terjadi kesalahan pada gateway' });
});

app.listen(config.ports.gateway, () => {
  console.log(`[gateway] API Gateway (PEP) berjalan di http://localhost:${config.ports.gateway}`);
  console.log(`[gateway] Jam akses ubah/finalisasi: ${labelJamAkses()}`);
});
