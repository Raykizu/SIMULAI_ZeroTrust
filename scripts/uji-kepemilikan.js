const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

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

async function request(path, { method = 'GET', token, device, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (device) headers['X-Device-ID'] = device;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
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
  console.log(`Uji kepemilikan data terhadap ${BASE}\n`);

  const mhs1 = await login('mhs1', 'mhs123', 'DEV-MHS1-01');
  const dosen1 = await login('dosen1', 'dosen123', 'DEV-DOSEN1-01');
  const dosen2 = await login('dosen2', 'dosen123', 'DEV-DOSEN2-01');

  cek(mhs1.status === 200, 'Login mahasiswa mhs1 berhasil');
  cek(dosen1.status === 200, 'Login dosen1 berhasil');
  cek(dosen2.status === 200, 'Login dosen2 berhasil');

  const nilaiDosen1 = await request('/nilai', {
    token: dosen1.data.accessToken,
    device: 'DEV-DOSEN1-01'
  });
  cek(nilaiDosen1.status === 200, 'Dosen1 dapat membaca data nilai kelas yang diampu');

  const nilaiMahasiswaLain = (nilaiDosen1.data.data || []).find(
    (item) => item.mahasiswa_nim !== '2023001'
  );

  if (nilaiMahasiswaLain) {
    const ubahOlehMahasiswa = await request(`/nilai/${nilaiMahasiswaLain.id}`, {
      method: 'PUT',
      token: mhs1.data.accessToken,
      device: 'DEV-MHS1-01',
      body: { nilai_angka: 100 }
    });
    cek(
      ubahOlehMahasiswa.status === 403,
      'Mahasiswa ditolak mengubah nilai mahasiswa lain',
      JSON.stringify(ubahOlehMahasiswa.data)
    );
  } else {
    cek(false, 'Mahasiswa ditolak mengubah nilai mahasiswa lain', 'Data nilai mahasiswa lain tidak ditemukan');
  }

  const nilaiDosen2 = await request('/nilai', {
    token: dosen2.data.accessToken,
    device: 'DEV-DOSEN2-01'
  });
  cek(nilaiDosen2.status === 200, 'Dosen2 dapat membaca data nilai kelas yang diampu');

  const nilaiMilikDosen2 = (nilaiDosen2.data.data || [])[0];
  if (nilaiMilikDosen2) {
    const ubahOlehDosen = await request(`/nilai/${nilaiMilikDosen2.id}`, {
      method: 'PUT',
      token: dosen1.data.accessToken,
      device: 'DEV-DOSEN1-01',
      body: { nilai_angka: 95 }
    });
    cek(
      ubahOlehDosen.status === 403,
      'Dosen1 ditolak mengubah nilai kelas dosen2',
      JSON.stringify(ubahOlehDosen.data)
    );
  } else {
    cek(false, 'Dosen1 ditolak mengubah nilai kelas dosen2', 'Data nilai dosen2 tidak ditemukan');
  }

  const kelasDosen2 = await request('/kelas', {
    token: dosen2.data.accessToken,
    device: 'DEV-DOSEN2-01'
  });
  cek(kelasDosen2.status === 200, 'Dosen2 dapat membaca daftar kelas yang diampu');

  const kelasMilikDosen2 = (kelasDosen2.data.data || [])[0];
  if (kelasMilikDosen2) {
    const finalisasiOlehDosen = await request(`/kelas/${kelasMilikDosen2.id}/finalisasi`, {
      method: 'POST',
      token: dosen1.data.accessToken,
      device: 'DEV-DOSEN1-01',
      body: {}
    });
    cek(
      finalisasiOlehDosen.status === 403,
      'Dosen1 ditolak memfinalisasi kelas dosen2',
      JSON.stringify(finalisasiOlehDosen.data)
    );
  } else {
    cek(false, 'Dosen1 ditolak memfinalisasi kelas dosen2', 'Data kelas dosen2 tidak ditemukan');
  }

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal.`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Uji kepemilikan gagal dijalankan:', error.message);
  console.error('Pastikan ketiga service sudah berjalan (npm start).');
  process.exit(1);
});
