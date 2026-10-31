const express = require('express');
const config = require('../config');
const db = require('../db/database');
const { verifyToken, safeEqual } = require('../shared/auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function guard(req, res, next) {
  const gatewaySecret = req.get('X-Gateway-Secret') || '';

  if (!safeEqual(gatewaySecret, config.gatewaySecret)) {
    return res.status(403).json({ error: 'Akses langsung ke Service Transkrip ditolak: gateway secret tidak valid' });
  }

  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Token tidak dikirim ke Service Transkrip' });
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

app.get('/transkrip', (req, res) => {
  if (req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Hanya admin yang boleh melihat seluruh transkrip' });
  }

  const rows = db.prepare(`
    SELECT
      t.id,
      u.nim,
      u.nama AS mahasiswa_nama,
      k.kode AS kelas_kode,
      t.kode_mk,
      t.nama_mk,
      t.nilai_angka,
      t.nilai_huruf,
      t.sinkron_at
    FROM transkrip t
    JOIN users u ON u.id = t.mahasiswa_id
    JOIN kelas k ON k.id = t.kelas_id
    ORDER BY u.nim, t.kode_mk
  `).all();

  return res.json({ data: rows });
});

app.get('/transkrip/:nim', (req, res) => {
  const { role } = req.auth;
  const nim = req.params.nim;

  if (role !== 'admin' && role !== 'mahasiswa') {
    return res.status(403).json({ error: 'Role ini tidak diizinkan melihat transkrip' });
  }

  const mahasiswa = db.prepare('SELECT id, nim, nama FROM users WHERE nim = ?').get(nim);
  if (!mahasiswa) return res.status(404).json({ error: 'Mahasiswa dengan NIM tersebut tidak ditemukan' });

  if (role === 'mahasiswa' && mahasiswa.id !== Number(req.auth.sub)) {
    return res.status(403).json({ error: 'Mahasiswa hanya boleh melihat transkrip miliknya' });
  }

  const rows = db.prepare(`
    SELECT
      t.id,
      t.kode_mk,
      t.nama_mk,
      t.nilai_angka,
      t.nilai_huruf,
      t.sinkron_at,
      k.kode AS kelas_kode
    FROM transkrip t
    JOIN kelas k ON k.id = t.kelas_id
    WHERE t.mahasiswa_id = ?
    ORDER BY t.kode_mk
  `).all(mahasiswa.id);

  return res.json({
    mahasiswa: { nim: mahasiswa.nim, nama: mahasiswa.nama },
    data: rows
  });
});

app.post('/transkrip/sinkron', (req, res) => {
  if (req.auth.role !== 'service' || req.auth.type !== 'service') {
    return res.status(403).json({ error: 'Sinkron transkrip hanya boleh memakai token service' });
  }

  const kelasId = Number(req.body && req.body.kelasId);
  if (!Number.isInteger(kelasId)) {
    return res.status(400).json({ error: 'kelasId tidak valid' });
  }

  const kelas = db.prepare('SELECT id, kode, nama FROM kelas WHERE id = ?').get(kelasId);
  if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });

  const daftarNilai = db.prepare(`
    SELECT n.mahasiswa_id, n.nilai_angka, n.nilai_huruf
    FROM nilai n
    WHERE n.kelas_id = ? AND n.final = 1
  `).all(kelasId);

  const upsert = db.prepare(`
    INSERT INTO transkrip (mahasiswa_id, kelas_id, kode_mk, nama_mk, nilai_angka, nilai_huruf, sinkron_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (mahasiswa_id, kelas_id) DO UPDATE SET
      kode_mk = excluded.kode_mk,
      nama_mk = excluded.nama_mk,
      nilai_angka = excluded.nilai_angka,
      nilai_huruf = excluded.nilai_huruf,
      sinkron_at = excluded.sinkron_at
  `);

  const sinkron = db.transaction(() => {
    const now = new Date().toISOString();
    for (const nilai of daftarNilai) {
      upsert.run(
        nilai.mahasiswa_id,
        kelasId,
        kelas.kode,
        kelas.nama,
        nilai.nilai_angka,
        nilai.nilai_huruf,
        now
      );
    }
  });

  sinkron();

  return res.json({
    message: 'Transkrip berhasil disinkronkan',
    kelasId,
    kode: kelas.kode,
    synced: daftarNilai.length
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan di Service Transkrip' });
});

app.use((error, req, res, next) => {
  console.error('[service-transkrip] Error:', error.message);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Terjadi kesalahan pada Service Transkrip' });
});

app.listen(config.ports.transkrip, () => {
  console.log(`[service-transkrip] berjalan di http://localhost:${config.ports.transkrip}`);
});
