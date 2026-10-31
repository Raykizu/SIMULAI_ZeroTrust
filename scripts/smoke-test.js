const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const NILAI_URL = process.env.NILAI_URL || 'http://127.0.0.1:3001';

let lulus = 0;
let gagal = 0;

function cek(kondisi, label, detail = '') {
  if (kondisi) {
    lulus += 1;
    console.log(`PASS  ${label}`);
  } else {
    gagal += 1;
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function request(path, { method = 'GET', token, device, body, base = BASE } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (device) headers['X-Device-ID'] = device;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  return { status: response.status, data };
}

async function login(username, password, device) {
  return request('/auth/login', {
    method: 'POST',
    device,
    body: { username, password }
  });
}

async function main() {
  console.log(`Smoke test terhadap ${BASE}\n`);

  const meta = await request('/meta');
  cek(meta.status === 200 && typeof meta.data.labelJamAkses === 'string', 'Gateway aktif dan /meta tersedia');

  const langsung = await request('/nilai', { base: NILAI_URL });
  cek(langsung.status === 403, 'Service Nilai menolak akses langsung tanpa gateway secret', JSON.stringify(langsung.data));

  const deviceSalah = await login('mhs1', 'mhs123', 'DEV-MHS2-01');
  cek(deviceSalah.status === 403, 'Login ditolak saat device tidak terdaftar', JSON.stringify(deviceSalah.data));

  const mhs = await login('mhs1', 'mhs123', 'DEV-MHS1-01');
  cek(mhs.status === 200 && mhs.data.accessToken, 'Login mahasiswa berhasil');

  const mhsToken = mhs.data.accessToken;
  const mhsRefresh = mhs.data.refreshToken;
  const mhsDevice = 'DEV-MHS1-01';

  const nilaiMhs = await request('/nilai', { token: mhsToken, device: mhsDevice });
  cek(nilaiMhs.status === 200 && nilaiMhs.data.data.length === 3, 'Mahasiswa hanya menerima 3 nilai miliknya');

  const transkripSendiri = await request('/transkrip/2023001', { token: mhsToken, device: mhsDevice });
  cek(transkripSendiri.status === 200, 'Mahasiswa dapat membaca transkrip sendiri');

  const transkripOrangLain = await request('/transkrip/2023002', { token: mhsToken, device: mhsDevice });
  cek(transkripOrangLain.status === 403, 'Mahasiswa ditolak membaca transkrip mahasiswa lain');

  const deviceTokenSalah = await request('/nilai', { token: mhsToken, device: 'DEV-MHS2-01' });
  cek(deviceTokenSalah.status === 403, 'Token valid tetap ditolak bila device tidak cocok');

  const admin = await login('admin', 'admin123', 'DEV-ADMIN-01');
  cek(admin.status === 200, 'Login admin berhasil');
  const adminToken = admin.data.accessToken;

  const nilaiAdmin = await request('/nilai', { token: adminToken, device: 'DEV-ADMIN-01' });
  cek(nilaiAdmin.status === 403, 'Admin ditolak mengakses data nilai mentah');

  const transkripAdmin = await request('/transkrip', { token: adminToken, device: 'DEV-ADMIN-01' });
  cek(transkripAdmin.status === 200, 'Admin dapat membaca seluruh transkrip');

  const auditAdmin = await request('/audit?limit=20', { token: adminToken, device: 'DEV-ADMIN-01' });
  cek(auditAdmin.status === 200 && Array.isArray(auditAdmin.data.data), 'Admin dapat membaca audit log');

  const dosen = await login('dosen1', 'dosen123', 'DEV-DOSEN1-01');
  cek(dosen.status === 200, 'Login dosen berhasil');
  const dosenToken = dosen.data.accessToken;
  const dosenDevice = 'DEV-DOSEN1-01';

  const kelasDosen = await request('/kelas', { token: dosenToken, device: dosenDevice });
  cek(kelasDosen.status === 200 && kelasDosen.data.data.length === 2, 'Dosen hanya melihat 2 kelas yang diampu');

  const nilaiDosen = await request('/nilai', { token: dosenToken, device: dosenDevice });
  cek(nilaiDosen.status === 200 && nilaiDosen.data.data.length === 6, 'Dosen hanya melihat nilai dari kelas yang diampu');

  const nilaiMahasiswaLain = nilaiDosen.data.data.find((item) => item.mahasiswa_nim !== '2023001');
  if (nilaiMahasiswaLain) {
    const ubahOlehMahasiswa = await request(`/nilai/${nilaiMahasiswaLain.id}`, {
      method: 'PUT',
      token: mhsToken,
      device: mhsDevice,
      body: { nilai_angka: 100 }
    });
    cek(
      ubahOlehMahasiswa.status === 403,
      'Mahasiswa ditolak mengubah nilai mahasiswa lain',
      JSON.stringify(ubahOlehMahasiswa.data)
    );
  }

  const dosenLain = await login('dosen2', 'dosen123', 'DEV-DOSEN2-01');
  cek(dosenLain.status === 200, 'Login dosen lain berhasil');

  const nilaiDosenLain = await request('/nilai', {
    token: dosenLain.data.accessToken,
    device: 'DEV-DOSEN2-01'
  });
  cek(
    nilaiDosenLain.status === 200 && nilaiDosenLain.data.data.length > 0,
    'Dosen lain memiliki data nilai untuk uji kepemilikan'
  );

  if (nilaiDosenLain.status === 200 && nilaiDosenLain.data.data.length > 0) {
    const nilaiMilikDosenLain = nilaiDosenLain.data.data[0];
    const ubahMilikDosenLain = await request(`/nilai/${nilaiMilikDosenLain.id}`, {
      method: 'PUT',
      token: dosenToken,
      device: dosenDevice,
      body: { nilai_angka: 95 }
    });
    cek(
      ubahMilikDosenLain.status === 403,
      'Dosen ditolak mengubah nilai kelas dosen lain',
      JSON.stringify(ubahMilikDosenLain.data)
    );
  }

  const kelasDosenLain = await request('/kelas', {
    token: dosenLain.data.accessToken,
    device: 'DEV-DOSEN2-01'
  });
  if (kelasDosenLain.status === 200 && kelasDosenLain.data.data.length > 0) {
    const kelasMilikDosenLain = kelasDosenLain.data.data[0];
    const finalisasiMilikDosenLain = await request(`/kelas/${kelasMilikDosenLain.id}/finalisasi`, {
      method: 'POST',
      token: dosenToken,
      device: dosenDevice,
      body: {}
    });
    cek(
      finalisasiMilikDosenLain.status === 403,
      'Dosen ditolak memfinalisasi kelas dosen lain',
      JSON.stringify(finalisasiMilikDosenLain.data)
    );
  }

  const transkripDosen = await request('/transkrip/2023001', { token: dosenToken, device: dosenDevice });
  cek(transkripDosen.status === 403, 'Dosen ditolak mengakses transkrip');

  const userSinkron = await request('/transkrip/sinkron', {
    method: 'POST',
    token: dosenToken,
    device: dosenDevice,
    body: { kelasId: 1 }
  });
  cek(userSinkron.status === 403, 'Token user ditolak untuk sinkron transkrip');

  const serviceSalah = await request('/auth/service', {
    method: 'POST',
    body: { clientId: 'service-nilai', clientSecret: 'salah' }
  });
  cek(serviceSalah.status === 401, 'Client secret service yang salah ditolak');

  const service = await request('/auth/service', {
    method: 'POST',
    body: { clientId: 'service-nilai', clientSecret: 'nilai-secret-2026' }
  });
  cek(service.status === 200 && service.data.accessToken, 'Token service berhasil diterbitkan');

  const kelasIf101 = kelasDosen.data.data.find((item) => item.kode === 'IF101');
  const sinkron = await request('/transkrip/sinkron', {
    method: 'POST',
    token: service.data.accessToken,
    body: { kelasId: kelasIf101.id }
  });
  cek(sinkron.status === 200, 'Token service dapat memanggil sinkron transkrip', JSON.stringify(sinkron.data));

  const nilaiDraft = nilaiDosen.data.data.find((item) => item.final === 0);
  if (nilaiDraft) {
    const ubah = await request(`/nilai/${nilaiDraft.id}`, {
      method: 'PUT',
      token: dosenToken,
      device: dosenDevice,
      body: { nilai_angka: 90 }
    });

    if (ubah.status === 403 && String(ubah.data && ubah.data.error).includes('jam akses')) {
      console.log('SKIP  Uji ubah nilai karena di luar jam akses');
    } else {
      cek(ubah.status === 200 && ubah.data.data.nilai_angka === 90, 'Dosen dapat mengubah nilai kelas yang diampu');
    }
  }

  const finalisasi = await request(`/kelas/${kelasIf101.id}/finalisasi`, {
    method: 'POST',
    token: dosenToken,
    device: dosenDevice,
    body: {}
  });

  if (finalisasi.status === 403 && String(finalisasi.data && finalisasi.data.error).includes('jam akses')) {
    console.log('SKIP  Uji finalisasi karena di luar jam akses');
  } else {
    cek(finalisasi.status === 200 && finalisasi.data.sync, 'Finalisasi nilai memicu sinkron transkrip', JSON.stringify(finalisasi.data));

    const transkripSetelahFinal = await request('/transkrip/2023001', {
      token: mhsToken,
      device: mhsDevice
    });
    const adaIf101 = transkripSetelahFinal.data.data.some((item) => item.kode_mk === 'IF101');
    cek(transkripSetelahFinal.status === 200 && adaIf101, 'Transkrip mahasiswa terisi setelah finalisasi');
  }

  const refresh = await request('/auth/refresh', {
    method: 'POST',
    device: mhsDevice,
    body: { refreshToken: mhsRefresh }
  });
  cek(refresh.status === 200 && refresh.data.accessToken, 'Refresh token menerbitkan access token baru');

  const logout = await request('/auth/logout', {
    method: 'POST',
    device: mhsDevice,
    body: { refreshToken: mhsRefresh }
  });
  cek(logout.status === 200, 'Logout mencabut refresh token');

  const refreshSetelahLogout = await request('/auth/refresh', {
    method: 'POST',
    device: mhsDevice,
    body: { refreshToken: mhsRefresh }
  });
  cek(refreshSetelahLogout.status === 401, 'Refresh token yang dicabut tidak dapat dipakai lagi');

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Smoke test gagal dijalankan:', error.message);
  console.error('Pastikan ketiga service sudah berjalan (npm start).');
  process.exit(1);
});
