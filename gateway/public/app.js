const STORAGE_KEY = 'simulasi-session';
const main = document.querySelector('#main');

const state = {
  accessToken: null,
  refreshToken: null,
  user: null,
  deviceId: null,
  meta: null
};

let toastTimer = null;

function $(selector) {
  return document.querySelector(selector);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function roleLabel(role) {
  return { admin: 'Admin', dosen: 'Dosen', mahasiswa: 'Mahasiswa' }[role] || role;
}

function labelJamAkses() {
  return (state.meta && state.meta.labelJamAkses) || '07.00-21.00';
}

function formatWaktu(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
}

function persist() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    user: state.user,
    deviceId: state.deviceId
  }));
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  state.accessToken = null;
  state.refreshToken = null;
  state.user = null;
  state.deviceId = null;
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 4200);
}

function showLogin() {
  $('#app-view').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
  $('#password').value = '';
  $('#login-error').textContent = '';
}

function showApp() {
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#user-chip').textContent = `${state.user.nama} - ${roleLabel(state.user.role)}`;
}

async function loadMeta() {
  try {
    const response = await fetch('/meta');
    if (!response.ok) return;
    state.meta = await response.json();
  } catch (error) {
    state.meta = null;
  }
}

async function refreshSession() {
  if (!state.refreshToken) return false;

  try {
    const response = await fetch('/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': state.deviceId || ''
      },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    });

    if (!response.ok) {
      clearSession();
      showLogin();
      showToast('Sesi berakhir. Silakan login kembali.', 'error');
      return false;
    }

    const data = await response.json();
    state.accessToken = data.accessToken;
    persist();
    return true;
  } catch (error) {
    clearSession();
    showLogin();
    showToast('Gagal memperbarui sesi. Silakan login kembali.', 'error');
    return false;
  }
}

async function api(path, options = {}) {
  const request = () => {
    const headers = { ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
    if (state.deviceId) headers['X-Device-ID'] = state.deviceId;
    return fetch(path, { ...options, headers });
  };

  let response = await request();

  if (response.status === 401 && state.refreshToken) {
    const refreshed = await refreshSession();
    if (refreshed) response = await request();
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const error = new Error((data && data.error) || `Permintaan gagal (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function hero({ eyebrow, title, subtitle, stats }) {
  return `
    <section class="hero-card">
      <div>
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h1>${esc(title)}</h1>
        <p class="muted">${esc(subtitle)}</p>
      </div>
      <div class="stat-row">
        ${stats.map((item) => `
          <div class="stat">
            <span>${esc(item.label)}</span>
            <strong>${esc(item.value)}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

async function renderMahasiswa() {
  const [nilaiResponse, transkripResponse] = await Promise.all([
    api('/nilai'),
    api(`/transkrip/${encodeURIComponent(state.user.nim)}`)
  ]);

  const nilai = nilaiResponse.data || [];
  const transkrip = transkripResponse.data || [];
  const rataRata = nilai.length
    ? (nilai.reduce((total, item) => total + Number(item.nilai_angka || 0), 0) / nilai.length).toFixed(1)
    : '-';
  const jumlahFinal = nilai.filter((item) => item.final).length;

  const barisNilai = nilai.map((item) => `
    <tr>
      <td>${esc(item.kelas_kode)}</td>
      <td>${esc(item.kelas_nama)}</td>
      <td>${esc(item.dosen_nama)}</td>
      <td>${esc(item.nilai_angka)}</td>
      <td><span class="badge grade">${esc(item.nilai_huruf || '-')}</span></td>
      <td>${item.final ? '<span class="badge success">Final</span>' : '<span class="badge warning">Draft</span>'}</td>
    </tr>
  `).join('');

  const barisTranskrip = transkrip.map((item) => `
    <tr>
      <td>${esc(item.kode_mk)}</td>
      <td>${esc(item.nama_mk)}</td>
      <td>${esc(item.nilai_angka)}</td>
      <td><span class="badge grade">${esc(item.nilai_huruf || '-')}</span></td>
      <td>${esc(formatWaktu(item.sinkron_at))}</td>
    </tr>
  `).join('');

  main.innerHTML = `
    ${hero({
      eyebrow: 'Ruang mahasiswa',
      title: `Halo, ${state.user.nama}`,
      subtitle: `NIM ${state.user.nim} - akses nilai dan transkrip milik sendiri.`,
      stats: [
        { label: 'Mata kuliah', value: nilai.length },
        { label: 'Rata-rata', value: rataRata },
        { label: 'Sudah final', value: `${jumlahFinal}/${nilai.length}` },
        { label: 'Transkrip', value: transkrip.length }
      ]
    })}

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Nilai Saya</h2>
          <p>Hanya nilai milik Anda yang ditampilkan oleh Service Nilai.</p>
        </div>
      </div>
      ${nilai.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kode</th>
                <th>Mata kuliah</th>
                <th>Dosen</th>
                <th>Angka</th>
                <th>Huruf</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${barisNilai}</tbody>
          </table>
        </div>
      ` : '<div class="empty-state"><h2>Belum ada nilai</h2><p>Nilai akan tampil setelah dosen menginputnya.</p></div>'}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Transkrip</h2>
          <p>Nilai masuk ke transkrip setelah dosen melakukan finalisasi dan sinkron.</p>
        </div>
      </div>
      ${transkrip.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kode</th>
                <th>Mata kuliah</th>
                <th>Angka</th>
                <th>Huruf</th>
                <th>Disinkronkan</th>
              </tr>
            </thead>
            <tbody>${barisTranskrip}</tbody>
          </table>
        </div>
      ` : '<div class="empty-state"><h2>Transkrip belum tersedia</h2><p>Transkrip terisi setelah dosen memfinalisasi nilai kelas.</p></div>'}
    </section>
  `;
}

function blokKelas(kelas) {
  const jumlahFinal = kelas.rows.filter((row) => row.final).length;
  const semuaFinal = kelas.rows.length > 0 && kelas.rows.every((row) => row.final);

  const baris = kelas.rows.map((row) => `
    <tr>
      <td>${esc(row.mahasiswa_nim || '-')}</td>
      <td>${esc(row.mahasiswa_nama || '-')}</td>
      <td>
        <input
          class="input nilai-input"
          type="number"
          min="0"
          max="100"
          step="1"
          value="${row.nilai_angka ?? ''}"
          data-nilai-id="${row.id}"
          ${row.final ? 'disabled' : ''}
        >
      </td>
      <td><span class="badge grade">${esc(row.nilai_huruf || '-')}</span></td>
      <td>${row.final ? '<span class="badge success">Final</span>' : '<span class="badge warning">Draft</span>'}</td>
      <td>
        ${row.final
          ? '<span class="muted">Terkunci</span>'
          : `<button class="btn small primary" type="button" data-save="${row.id}">Simpan</button>`}
      </td>
    </tr>
  `).join('');

  return `
    <section class="panel class-block">
      <div class="class-title">
        <div>
          <h2>${esc(kelas.kode)} - ${esc(kelas.nama)}</h2>
          <p>${esc(kelas.dosen_nama)} - ${kelas.rows.length} mahasiswa - ${jumlahFinal} nilai final</p>
        </div>
        <div class="class-actions">
          ${semuaFinal
            ? '<span class="badge success">Sudah final</span>'
            : `<button class="btn small primary" type="button" data-finalize="${kelas.id}" ${kelas.rows.length ? '' : 'disabled'}>Finalisasi &amp; Sinkron</button>`}
        </div>
      </div>
      ${kelas.rows.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NIM</th>
                <th>Mahasiswa</th>
                <th>Nilai</th>
                <th>Huruf</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>${baris}</tbody>
          </table>
        </div>
      ` : '<div class="empty-state"><h2>Belum ada mahasiswa</h2><p>Kelas ini belum memiliki data nilai.</p></div>'}
    </section>
  `;
}

async function renderDosen() {
  const [kelasResponse, nilaiResponse] = await Promise.all([
    api('/kelas'),
    api('/nilai')
  ]);

  const kelas = kelasResponse.data || [];
  const nilai = nilaiResponse.data || [];
  const daftarKelas = kelas.map((item) => ({
    ...item,
    rows: nilai.filter((row) => row.kelas_id === item.id)
  }));

  const totalMahasiswa = daftarKelas.reduce((total, item) => total + item.rows.length, 0);
  const totalFinal = daftarKelas.reduce(
    (total, item) => total + item.rows.filter((row) => row.final).length,
    0
  );

  main.innerHTML = `
    ${hero({
      eyebrow: 'Ruang dosen',
      title: `Kelas ${state.user.nama}`,
      subtitle: `Hanya kelas yang Anda ampu yang dapat diubah dan difinalisasi.`,
      stats: [
        { label: 'Kelas diampu', value: daftarKelas.length },
        { label: 'Mahasiswa', value: totalMahasiswa },
        { label: 'Nilai final', value: totalFinal },
        { label: 'Jam akses', value: labelJamAkses() }
      ]
    })}

    <div class="panel">
      <div class="panel-note">
        Perubahan dan finalisasi nilai hanya diizinkan pukul ${esc(labelJamAkses())} waktu server.
        Nilai yang sudah final terkunci dan disinkronkan ke transkrip.
      </div>
    </div>

    ${daftarKelas.length
      ? daftarKelas.map(blokKelas).join('')
      : '<div class="panel"><div class="empty-state"><h2>Tidak ada kelas</h2><p>Belum ada kelas yang diampu oleh akun ini.</p></div></div>'}
  `;
}

async function renderAdmin() {
  const [transkripResponse, auditResponse] = await Promise.all([
    api('/transkrip'),
    api('/audit?limit=200')
  ]);

  const transkrip = transkripResponse.data || [];
  const audit = auditResponse.data || [];
  const jumlahMahasiswa = new Set(transkrip.map((item) => item.nim)).size;

  const barisTranskrip = transkrip.map((item) => `
    <tr>
      <td>${esc(item.nim)}</td>
      <td>${esc(item.mahasiswa_nama)}</td>
      <td>${esc(item.kode_mk)}</td>
      <td>${esc(item.nama_mk)}</td>
      <td>${esc(item.nilai_angka)}</td>
      <td><span class="badge grade">${esc(item.nilai_huruf || '-')}</span></td>
      <td>${esc(formatWaktu(item.sinkron_at))}</td>
    </tr>
  `).join('');

  const barisAudit = audit.map((item) => `
    <tr>
      <td>${esc(formatWaktu(item.waktu))}</td>
      <td>${esc(item.subjek)}</td>
      <td>${esc(item.role)}</td>
      <td><span class="badge">${esc(item.method)}</span> ${esc(item.endpoint)}</td>
      <td>${esc(item.device)}</td>
      <td>${item.hasil === 'allow'
        ? '<span class="badge success">allow</span>'
        : '<span class="badge danger">deny</span>'}</td>
      <td>${esc(item.alasan)}</td>
    </tr>
  `).join('');

  main.innerHTML = `
    ${hero({
      eyebrow: 'Ruang admin',
      title: 'Transkrip dan Audit',
      subtitle: 'Admin dapat melihat seluruh transkrip, tetapi tidak dapat mengakses data nilai mentah.',
      stats: [
        { label: 'Mahasiswa', value: jumlahMahasiswa },
        { label: 'Baris transkrip', value: transkrip.length },
        { label: 'Audit log', value: audit.length }
      ]
    })}

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Transkrip Seluruh Mahasiswa</h2>
          <p>Data transkrip hasil sinkron dari Service Nilai.</p>
        </div>
        <div class="head-actions">
          <button class="btn ghost small" type="button" data-refresh>Muat ulang</button>
        </div>
      </div>
      ${transkrip.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NIM</th>
                <th>Nama</th>
                <th>Kode</th>
                <th>Mata kuliah</th>
                <th>Angka</th>
                <th>Huruf</th>
                <th>Disinkronkan</th>
              </tr>
            </thead>
            <tbody>${barisTranskrip}</tbody>
          </table>
        </div>
      ` : '<div class="empty-state"><h2>Transkrip kosong</h2><p>Belum ada kelas yang difinalisasi oleh dosen.</p></div>'}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Audit Log</h2>
          <p>200 keputusan akses terakhir yang dicatat API Gateway.</p>
        </div>
        <div class="head-actions">
          <button class="btn ghost small" type="button" data-refresh>Muat ulang</button>
        </div>
      </div>
      ${audit.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Subjek</th>
                <th>Role</th>
                <th>Aksi</th>
                <th>Device</th>
                <th>Hasil</th>
                <th>Alasan</th>
              </tr>
            </thead>
            <tbody>${barisAudit}</tbody>
          </table>
        </div>
      ` : '<div class="empty-state"><h2>Audit kosong</h2><p>Belum ada keputusan akses yang tercatat.</p></div>'}
    </section>
  `;
}

async function renderDashboard() {
  if (!state.user) return;

  main.innerHTML = '<div class="loading">Memuat data...</div>';

  try {
    if (state.user.role === 'mahasiswa') await renderMahasiswa();
    else if (state.user.role === 'dosen') await renderDosen();
    else if (state.user.role === 'admin') await renderAdmin();
    else throw new Error('Role tidak dikenali');
  } catch (error) {
    if (!state.accessToken) return;
    main.innerHTML = `
      <div class="panel">
        <div class="empty-state">
          <h2>Akses gagal</h2>
          <p>${esc(error.message)}</p>
          <button class="btn primary" type="button" data-retry>Muat ulang</button>
        </div>
      </div>
    `;
  }
}

async function simpanNilai(button) {
  const id = button.dataset.save;
  const input = main.querySelector(`[data-nilai-id="${id}"]`);

  if (input.value.trim() === '') {
    showToast('Nilai tidak boleh kosong.', 'error');
    return;
  }

  const angka = Number(input.value);

  if (!Number.isFinite(angka) || angka < 0 || angka > 100) {
    showToast('Nilai harus berupa angka 0 sampai 100.', 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'Menyimpan...';

  try {
    await api(`/nilai/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ nilai_angka: angka })
    });
    showToast('Nilai berhasil disimpan.', 'success');
    await renderDashboard();
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false;
    button.textContent = 'Simpan';
  }
}

async function finalisasiKelas(button) {
  const id = button.dataset.finalize;
  const setuju = window.confirm(
    'Finalisasi semua nilai pada kelas ini? Nilai akan terkunci dan disinkronkan ke transkrip.'
  );
  if (!setuju) return;

  button.disabled = true;
  button.textContent = 'Memproses...';

  try {
    const hasil = await api(`/kelas/${id}/finalisasi`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    showToast(
      `Finalisasi berhasil. ${hasil.sync ? hasil.sync.synced : 0} transkrip disinkronkan.`,
      'success'
    );
    await renderDashboard();
  } catch (error) {
    showToast(error.message, 'error');
    await renderDashboard();
  }
}

main.addEventListener('click', async (event) => {
  if (event.target.closest('[data-retry]')) {
    await renderDashboard();
    return;
  }

  const refresh = event.target.closest('[data-refresh]');
  if (refresh) {
    await renderDashboard();
    return;
  }

  const save = event.target.closest('[data-save]');
  if (save) {
    await simpanNilai(save);
    return;
  }

  const finalize = event.target.closest('[data-finalize]');
  if (finalize) {
    await finalisasiKelas(finalize);
  }
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = $('#username').value.trim();
  const password = $('#password').value;
  const deviceId = $('#device-id').value.trim();
  const errorElement = $('#login-error');
  const button = $('#login-button');

  errorElement.textContent = '';
  button.disabled = true;
  button.textContent = 'Memeriksa...';

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Login gagal');

    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.user = data.user;
    state.deviceId = deviceId;
    persist();
    showApp();
    showToast(`Selamat datang, ${data.user.nama}.`, 'success');
    await renderDashboard();
  } catch (error) {
    errorElement.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Masuk';
  }
});

$('#logout-button').addEventListener('click', async () => {
  const refreshToken = state.refreshToken;
  const deviceId = state.deviceId;

  try {
    if (refreshToken) {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': deviceId || ''
        },
        body: JSON.stringify({ refreshToken })
      });
    }
  } catch (error) {
    // Sesi lokal tetap dibersihkan walaupun request logout gagal.
  }

  clearSession();
  showLogin();
  showToast('Anda telah keluar. Refresh token dicabut.', 'success');
});

async function init() {
  await loadMeta();

  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const session = JSON.parse(saved);
    if (!session.accessToken || !session.user) return;
    state.accessToken = session.accessToken;
    state.refreshToken = session.refreshToken;
    state.user = session.user;
    state.deviceId = session.deviceId;
    showApp();
    await renderDashboard();
  } catch (error) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

init();
