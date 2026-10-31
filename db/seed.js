const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { angkaKeHuruf } = require('../shared/grade');
const { hashSecret } = require('../shared/auth');

const reset = process.argv.includes('--reset');

if (reset) {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${config.dbPath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  console.log('[seed] Database lama dihapus.');
}

const db = require('./database');

const existing = db.prepare('SELECT COUNT(*) AS total FROM users').get();
if (existing.total > 0) {
  console.log(`[seed] Database sudah berisi ${existing.total} user. Gunakan "npm run reset" untuk membuat ulang data awal.`);
  process.exit(0);
}

const users = [
  {
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    nama: 'Admin Program Studi',
    nim: null,
    device: 'DEV-ADMIN-01',
    deviceLabel: 'Laptop Admin'
  },
  {
    username: 'dosen1',
    password: 'dosen123',
    role: 'dosen',
    nama: 'Wawan Sukmawan',
    nim: null,
    device: 'DEV-DOSEN1-01',
    deviceLabel: 'Laptop Wawan'
  },
  {
    username: 'dosen2',
    password: 'dosen123',
    role: 'dosen',
    nama: 'Kirana Lestari',
    nim: null,
    device: 'DEV-DOSEN2-01',
    deviceLabel: 'Laptop Kirana'
  },
  {
    username: 'mhs1',
    password: 'mhs123',
    role: 'mahasiswa',
    nama: 'Andi Pratama',
    nim: '2023001',
    device: 'DEV-MHS1-01',
    deviceLabel: 'Ponsel Andi'
  },
  {
    username: 'mhs2',
    password: 'mhs123',
    role: 'mahasiswa',
    nama: 'Rina Lestari',
    nim: '2023002',
    device: 'DEV-MHS2-01',
    deviceLabel: 'Ponsel Rina'
  },
  {
    username: 'mhs3',
    password: 'mhs123',
    role: 'mahasiswa',
    nama: 'Fajar Nugraha',
    nim: '2023003',
    device: 'DEV-MHS3-01',
    deviceLabel: 'Ponsel Fajar'
  }
];

const kelas = [
  { kode: 'IF101', nama: 'Pemrograman Web', dosen: 'dosen1' },
  { kode: 'IF102', nama: 'Basis Data', dosen: 'dosen2' },
  { kode: 'IF103', nama: 'Algoritma dan Struktur Data', dosen: 'dosen1' }
];

const nilaiAwal = {
  '2023001': { IF101: 88, IF102: 79, IF103: 91 },
  '2023002': { IF101: 72, IF102: 85, IF103: 68 },
  '2023003': { IF101: 64, IF102: 58, IF103: 77 }
};

const seed = db.transaction(() => {
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role, nama, nim)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertDevice = db.prepare(`
    INSERT INTO devices (user_id, device_id, label) VALUES (?, ?, ?)
  `);
  const insertKelas = db.prepare(`
    INSERT INTO kelas (kode, nama, dosen_id) VALUES (?, ?, ?)
  `);
  const insertNilai = db.prepare(`
    INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, final, updated_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `);
  const insertClient = db.prepare(`
    INSERT INTO service_clients (client_id, client_secret_hash, nama) VALUES (?, ?, ?)
  `);

  const ids = {};
  const now = new Date().toISOString();

  for (const user of users) {
    const result = insertUser.run(
      user.username,
      bcrypt.hashSync(user.password, 10),
      user.role,
      user.nama,
      user.nim
    );
    ids[user.username] = Number(result.lastInsertRowid);
    insertDevice.run(ids[user.username], user.device, user.deviceLabel);
  }

  const kelasIds = {};
  for (const item of kelas) {
    const result = insertKelas.run(item.kode, item.nama, ids[item.dosen]);
    kelasIds[item.kode] = Number(result.lastInsertRowid);
  }

  for (const [nim, daftarNilai] of Object.entries(nilaiAwal)) {
    const mahasiswaId = ids[`mhs${nim.slice(-1)}`];
    for (const [kode, angka] of Object.entries(daftarNilai)) {
      insertNilai.run(kelasIds[kode], mahasiswaId, angka, angkaKeHuruf(angka), now);
    }
  }

  insertClient.run(
    config.serviceClient.id,
    hashSecret(config.serviceClient.secret),
    'Service Nilai'
  );
});

seed();

console.log('[seed] Data awal berhasil dibuat.');
console.log('[seed] Akun demo:');
console.log('  admin    / admin123  device DEV-ADMIN-01');
console.log('  dosen1   / dosen123  device DEV-DOSEN1-01');
console.log('  dosen2   / dosen123  device DEV-DOSEN2-01');
console.log('  mhs1     / mhs123    device DEV-MHS1-01  (NIM 2023001)');
console.log('  mhs2     / mhs123    device DEV-MHS2-01  (NIM 2023002)');
console.log('  mhs3     / mhs123    device DEV-MHS3-01  (NIM 2023003)');
console.log(`[seed] Service client: ${config.serviceClient.id} / ${config.serviceClient.secret}`);
console.log(`[seed] Database: ${path.relative(process.cwd(), config.dbPath)}`);
