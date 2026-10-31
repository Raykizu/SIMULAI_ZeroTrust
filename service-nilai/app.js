const express = require('express');
const config = require('../config');
const db = require('../db/database');
const { verifyToken, safeEqual } = require('../shared/auth');
const { angkaKeHuruf } = require('../shared/grade');
const { dalamJamAkses, labelJamAkses } = require('../shared/access');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function guard(req, res, next) {
  const gatewaySecret = req.get('X-Gateway-Secret') || '';

  if (!safeEqual(gatewaySecret, config.gatewaySecret)) {
    return res.status(403).json({ error: 'Akses langsung ke Service Nilai ditolak: gateway secret tidak valid' });
  }

  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Token tidak dikirim ke Service Nilai' });
  }

  try {
    req.auth = verifyToken(token);
  } catch (error) {
    const alasan = error.name === 'TokenExpiredError'
      ? 'Token sudah kedaluwarsa'
      : 'Token tidak valid';
    return res.status(401).json({ error: alasan });
  }

  return next();
}

app.use(guard);

app.get('/nilai', (req, res) => {
  const { role } = req.auth;
  const userId = Number(req.auth.sub);

  const dasarQuery = `
    SELECT
      n.id,
      n.nilai_angka,
      n.nilai_huruf,
      n.final,
      n.updated_at,
      k.id AS kelas_id,
      k.kode AS kelas_kode,
      k.nama AS kelas_nama,
      d.nama AS dosen_nama,
      m.nama AS mahasiswa_nama,
      m.nim AS mahasiswa_nim
    FROM nilai n
    JOIN kelas k ON k.id = n.kelas_id
    JOIN users d ON d.id = k.dosen_id
    JOIN users m ON m.id = n.mahasiswa_id
  `;

  let rows;

  if (role === 'mahasiswa') {
    rows = db.prepare(`${dasarQuery} WHERE n.mahasiswa_id = ? ORDER BY k.kode`).all(userId);
  } else if (role === 'dosen') {
    rows = db.prepare(`${dasarQuery} WHERE k.dosen_id = ? ORDER BY k.kode, n.id`).all(userId);
  } else {
    return res.status(403).json({ error: 'Role ini tidak diizinkan mengakses data nilai' });
  }

  return res.json({ data: rows });
});

app.get('/kelas', (req, res) => {
  const { role } = req.auth;
  const userId = Number(req.auth.sub);

  if (role === 'dosen') {
    const rows = db.prepare(`
      SELECT
        k.id, k.kode, k.nama, k.dosen_id, d.nama AS dosen_nama,
        (SELECT COUNT(*) FROM nilai n WHERE n.kelas_id = k.id) AS jumlah_mahasiswa,
        (SELECT COUNT(*) FROM nilai n WHERE n.kelas_id = k.id AND n.final = 1) AS jumlah_final
      FROM kelas k
      JOIN users d ON d.id = k.dosen_id
      WHERE k.dosen_id = ?
      ORDER BY k.kode
    `).all(userId);

    return res.json({ data: rows });
  }

  if (role === 'mahasiswa') {
    const rows = db.prepare(`
      SELECT
        k.id, k.kode, k.nama, k.dosen_id, d.nama AS dosen_nama,
        n.nilai_angka, n.nilai_huruf, n.final
      FROM kelas k
      JOIN users d ON d.id = k.dosen_id
      JOIN nilai n ON n.kelas_id = k.id AND n.mahasiswa_id = ?
      ORDER BY k.kode
    `).all(userId);

    return res.json({ data: rows });
  }

  if (role === 'admin') {
    const rows = db.prepare(`
      SELECT
        k.id, k.kode, k.nama, k.dosen_id, d.nama AS dosen_nama,
        (SELECT COUNT(*) FROM nilai n WHERE n.kelas_id = k.id) AS jumlah_mahasiswa
      FROM kelas k
      JOIN users d ON d.id = k.dosen_id
      ORDER BY k.kode
    `).all();

    return res.json({ data: rows });
  }

  return res.status(403).json({ error: 'Role tidak diizinkan melihat daftar kelas' });
});

app.put('/nilai/:id', (req, res) => {
  if (req.auth.role !== 'dosen') {
    return res.status(403).json({ error: 'Hanya dosen yang boleh mengubah nilai' });
  }

  const nilaiId = Number(req.params.id);
  const angka = Number(req.body && req.body.nilai_angka);

  if (!Number.isInteger(nilaiId)) {
    return res.status(400).json({ error: 'ID nilai tidak valid' });
  }

  if (!Number.isFinite(angka) || angka < 0 || angka > 100) {
    return res.status(400).json({ error: 'Nilai angka harus berupa angka 0 sampai 100' });
  }

  const nilai = db.prepare(`
    SELECT n.id, n.final, k.dosen_id
    FROM nilai n
    JOIN kelas k ON k.id = n.kelas_id
    WHERE n.id = ?
  `).get(nilaiId);

  if (!nilai) return res.status(404).json({ error: 'Nilai tidak ditemukan' });
  if (nilai.dosen_id !== Number(req.auth.sub)) {
    return res.status(403).json({ error: 'Kelas bukan kelas yang diampu dosen ini' });
  }
  if (nilai.final) {
    return res.status(409).json({ error: 'Nilai sudah difinalisasi dan tidak dapat diubah' });
  }
  if (!dalamJamAkses()) {
    return res.status(403).json({ error: `Perubahan nilai hanya diizinkan pukul ${labelJamAkses()}` });
  }

  const huruf = angkaKeHuruf(angka);
  db.prepare(`
    UPDATE nilai SET nilai_angka = ?, nilai_huruf = ?, updated_at = ? WHERE id = ?
  `).run(angka, huruf, new Date().toISOString(), nilaiId);

  const data = db.prepare(`
    SELECT
      n.id, n.nilai_angka, n.nilai_huruf, n.final, n.updated_at,
      k.id AS kelas_id, k.kode AS kelas_kode, k.nama AS kelas_nama
    FROM nilai n
    JOIN kelas k ON k.id = n.kelas_id
    WHERE n.id = ?
  `).get(nilaiId);

  return res.json({ message: 'Nilai berhasil diperbarui', data });
});

async function ambilTokenService() {
  const response = await fetch(`${config.gatewayUrl}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: config.serviceClient.id,
      clientSecret: config.serviceClient.secret
    }),
    signal: AbortSignal.timeout(5000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal memperoleh token service');
  }

  return data.accessToken;
}

async function sinkronTranskrip(kelasId) {
  const token = await ambilTokenService();

  const response = await fetch(`${config.gatewayUrl}/transkrip/sinkron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ kelasId }),
    signal: AbortSignal.timeout(5000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Sinkron transkrip ditolak');
  }

  return data;
}

app.post('/kelas/:id/finalisasi', async (req, res) => {
  if (req.auth.role !== 'dosen') {
    return res.status(403).json({ error: 'Hanya dosen yang boleh memfinalisasi nilai' });
  }

  const kelasId = Number(req.params.id);
  if (!Number.isInteger(kelasId)) {
    return res.status(400).json({ error: 'ID kelas tidak valid' });
  }

  const kelas = db.prepare('SELECT id, kode, nama, dosen_id FROM kelas WHERE id = ?').get(kelasId);
  if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  if (kelas.dosen_id !== Number(req.auth.sub)) {
    return res.status(403).json({ error: 'Kelas bukan kelas yang diampu dosen ini' });
  }
  if (!dalamJamAkses()) {
    return res.status(403).json({ error: `Finalisasi hanya diizinkan pukul ${labelJamAkses()}` });
  }

  const hasil = db.prepare(`
    UPDATE nilai SET final = 1, updated_at = ? WHERE kelas_id = ?
  `).run(new Date().toISOString(), kelasId);

  try {
    const sync = await sinkronTranskrip(kelasId);
    return res.json({
      message: 'Nilai kelas difinalisasi dan transkrip berhasil disinkronkan',
      kelas,
      jumlah_nilai_final: hasil.changes,
      sync
    });
  } catch (error) {
    return res.status(502).json({
      error: `Nilai sudah difinalisasi, tetapi sinkron transkrip gagal: ${error.message}. Silakan ulangi finalisasi untuk mencoba sinkron lagi.`,
      finalized: true,
      synced: false,
      kelas,
      jumlah_nilai_final: hasil.changes
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan di Service Nilai' });
});

app.use((error, req, res, next) => {
  console.error('[service-nilai] Error:', error.message);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Terjadi kesalahan pada Service Nilai' });
});

app.listen(config.ports.nilai, () => {
  console.log(`[service-nilai] berjalan di http://localhost:${config.ports.nilai}`);
});
