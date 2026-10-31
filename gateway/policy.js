const db = require('../db/database');
const { dalamJamAkses, labelJamAkses } = require('../shared/access');

function allow(alasan) {
  return { allow: true, alasan };
}

function deny(alasan) {
  return { allow: false, alasan };
}

function deviceTerdaftar(userId, deviceId) {
  return Boolean(
    db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?').get(userId, deviceId)
  );
}

function decide({ auth, method, endpoint, deviceId }) {
  const role = auth.role;

  if (auth.type === 'service') {
    if (role === 'service' && method === 'POST' && endpoint === '/transkrip/sinkron') {
      return allow('Token service valid untuk sinkron transkrip');
    }
    return deny('Token service hanya boleh mengakses sinkron transkrip');
  }

  if (auth.type !== 'access') {
    return deny('Tipe token tidak dikenali');
  }

  if (!deviceId) {
    return deny('Header X-Device-ID wajib dikirim');
  }

  if (!deviceTerdaftar(Number(auth.sub), deviceId)) {
    return deny('Device tidak terdaftar untuk user ini');
  }

  if (method === 'GET' && endpoint === '/nilai') {
    if (role === 'mahasiswa' || role === 'dosen') {
      return allow(`Role ${role} diizinkan melihat nilai`);
    }
    return deny('Role admin tidak diizinkan melihat data nilai');
  }

  const ubahNilai = endpoint.match(/^\/nilai\/(\d+)$/);
  if (method === 'PUT' && ubahNilai) {
    if (role !== 'dosen') {
      return deny('Hanya dosen yang boleh mengubah nilai');
    }

    const nilai = db.prepare(`
      SELECT n.id, n.final, k.dosen_id
      FROM nilai n
      JOIN kelas k ON k.id = n.kelas_id
      WHERE n.id = ?
    `).get(Number(ubahNilai[1]));

    if (!nilai) return deny('Nilai tidak ditemukan');
    if (nilai.dosen_id !== Number(auth.sub)) return deny('Kelas bukan kelas yang diampu dosen ini');
    if (nilai.final) return deny('Nilai sudah difinalisasi dan tidak dapat diubah');
    if (!dalamJamAkses()) return deny(`Di luar jam akses perubahan nilai (${labelJamAkses()})`);

    return allow('Dosen pengampu, nilai belum final, dan dalam jam akses');
  }

  if (method === 'GET' && endpoint === '/kelas') {
    if (['admin', 'dosen', 'mahasiswa'].includes(role)) {
      return allow(`Role ${role} diizinkan melihat daftar kelas`);
    }
    return deny('Role tidak diizinkan melihat daftar kelas');
  }

  const finalisasi = endpoint.match(/^\/kelas\/(\d+)\/finalisasi$/);
  if (method === 'POST' && finalisasi) {
    if (role !== 'dosen') {
      return deny('Hanya dosen yang boleh memfinalisasi nilai');
    }

    const kelas = db.prepare('SELECT id, dosen_id FROM kelas WHERE id = ?').get(Number(finalisasi[1]));
    if (!kelas) return deny('Kelas tidak ditemukan');
    if (kelas.dosen_id !== Number(auth.sub)) return deny('Kelas bukan kelas yang diampu dosen ini');
    if (!dalamJamAkses()) return deny(`Di luar jam akses finalisasi nilai (${labelJamAkses()})`);

    return allow('Dosen pengampu dan dalam jam akses finalisasi');
  }

  if (method === 'POST' && endpoint === '/transkrip/sinkron') {
    return deny('Sinkron transkrip hanya boleh memakai token service');
  }

  if (method === 'GET' && endpoint === '/transkrip') {
    if (role === 'admin') return allow('Admin diizinkan melihat seluruh transkrip');
    return deny('Hanya admin yang boleh melihat seluruh transkrip');
  }

  const transkrip = endpoint.match(/^\/transkrip\/([^/]+)$/);
  if (method === 'GET' && transkrip) {
    const nim = decodeURIComponent(transkrip[1]);

    if (role === 'admin') {
      return allow('Admin diizinkan melihat transkrip semua mahasiswa');
    }

    if (role === 'mahasiswa') {
      const mahasiswa = db.prepare('SELECT id FROM users WHERE nim = ?').get(nim);
      if (mahasiswa && mahasiswa.id === Number(auth.sub)) {
        return allow('Mahasiswa mengakses transkrip miliknya sendiri');
      }
      return deny('Mahasiswa hanya boleh melihat transkrip miliknya');
    }

    return deny('Role dosen tidak diizinkan melihat transkrip');
  }

  if (method === 'GET' && endpoint === '/audit') {
    if (role === 'admin') return allow('Admin diizinkan melihat audit log');
    return deny('Hanya admin yang boleh melihat audit log');
  }

  return deny('Endpoint tidak diizinkan oleh kebijakan');
}

module.exports = { decide };
