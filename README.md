# SIMULAI - Sistem Simulasi Nilai

**SIMULAI (Sistem Simulasi Nilai)** adalah sistem simulasi nilai mata kuliah dengan penerapan **Zero Trust Security** (`never trust, always verify`, `least privilege`, `assume breach`). Seluruh akses masuk melalui **API Gateway** yang berperan sebagai **Policy Enforcement Point (PEP)**, dilengkapi **Policy Engine / Policy Administrator (PE/PA)** di dalamnya.

Project ini dibuat untuk tugas praktikum Keamanan Informasi dan berjalan sepenuhnya di satu komputer.

## Fitur Utama

- Autentikasi JWT dengan access token 10 menit dan refresh token 1 hari.
- Refresh token disimpan di database (hash) sehingga dapat dicabut saat logout.
- Token service 5 menit untuk panggilan antar-service.
- Gateway secret `X-Gateway-Secret` pada setiap request yang diteruskan ke service.
- Service memverifikasi ulang gateway secret, tanda tangan JWT, dan masa berlaku token.
- Policy Engine memutuskan `allow/deny` berdasarkan role, kepemilikan data, device, dan jam akses.
- Verifikasi device terdaftar melalui header `X-Device-ID`.
- Jam akses ubah/finalisasi nilai yang dapat diatur melalui konfigurasi.
- Audit log untuk setiap keputusan akses.
- Frontend lokal minimalis bernuansa biru muda untuk mahasiswa, dosen, dan admin.

## Arsitektur

```text
                    +-----------------------------+
                    |  Browser / Postman / curl   |
                    +--------------+--------------+
                                   |
                                   v
                 +-----------------------------------+
                 | API Gateway :3000                 |
                 | PEP + Policy Engine / Admin       |
                 | - /auth/login, refresh, logout    |
                 | - /auth/service                   |
                 | - cek token, device, kebijakan    |
                 | - tulis audit log                 |
                 +----+------------------------+-----+
                      |                        |
          /nilai, /kelas|                       |/transkrip
                      v                        v
          +---------------------+   +----------------------+
          | Service Nilai :3001 |   | Service Transkrip    |
          | - nilai & kelas     |   | :3002                |
          | - finalisasi        |   | - transkrip          |
          +----------+----------+   +----------+-----------+
                     |                         |
                     +-----------+-------------+
                                 |
                     +-----------v-----------+
                     | SQLite (database      |
                     | bersama) + audit_logs |
                     +-----------------------+

Finalisasi nilai:
Service Nilai -> POST /auth/service ke Gateway (token service)
             -> POST /transkrip/sinkron ke Gateway (token service)
             -> Gateway meneruskan ke Service Transkrip
```

Setiap request ke service membawa:

- `Authorization: Bearer <access token atau service token>`
- `X-Gateway-Secret: <secret>` yang ditambahkan gateway
- `X-Device-ID: <device>` untuk request dari user

Service menolak request tanpa gateway secret, walaupun request tersebut membawa token yang valid. Sebaliknya, request dengan gateway secret tetapi tanpa token valid juga ditolak.

## Teknologi

- Node.js 18+ (diuji pada Node.js 22)
- Express
- `http-proxy-middleware` sebagai proxy gateway
- `jsonwebtoken` untuk JWT
- `better-sqlite3` untuk database SQLite
- `bcryptjs` untuk hash password
- HTML, CSS, dan JavaScript vanilla untuk frontend

## Struktur Folder

```text
ZeroTrust_SIMULASI/
├── config.js                 # Konfigurasi terpusat dari .env
├── db/
│   ├── database.js           # Koneksi dan skema SQLite
│   └── seed.js               # Data awal
├── gateway/
│   ├── app.js                # API Gateway, auth, proxy, audit
│   ├── policy.js             # Policy Engine (allow/deny + alasan)
│   └── public/               # Frontend lokal
│       ├── index.html
│       ├── styles.css
│       └── app.js
├── service-nilai/
│   └── app.js                # Service Nilai :3001
├── service-transkrip/
│   └── app.js                # Service Transkrip :3002
├── shared/
│   ├── access.js             # Jam akses
│   ├── auth.js               # JWT, hash token, util keamanan
│   └── grade.js              # Konversi nilai angka ke huruf
├── scripts/
│   └── smoke-test.js         # Uji alur utama end-to-end
├── data/                     # Database dibuat saat seed
├── .env.example
└── README.md
```

## Prasyarat

- Node.js 18 atau lebih baru
- npm
- Port `3000`, `3001`, dan `3002` tersedia

## Cara Menjalankan

```powershell
cd ZeroTrust_SIMULASI
npm install
npm start
```

Perintah `npm start` akan:

1. Membuat data awal jika database masih kosong.
2. Menjalankan API Gateway pada port `3000`.
3. Menjalankan Service Nilai pada port `3001`.
4. Menjalankan Service Transkrip pada port `3002`.

Buka browser ke:

```text
http://localhost:3000
```

Untuk menghentikan semua service, tekan `Ctrl+C` pada terminal yang menjalankan `npm start`.

### Menjalankan Service Secara Terpisah

```powershell
npm run start:gateway
npm run start:nilai
npm run start:transkrip
```

### Membuat Ulang Data Awal

```powershell
npm run reset
```

Hentikan service terlebih dahulu agar file database tidak terkunci.

### Menjalankan Smoke Test

Dengan ketiga service aktif:

```powershell
npm run smoke
```

Smoke test memeriksa login, device, pembatasan role, akses langsung ke service, token service, kepemilikan data (mahasiswa tidak dapat mengubah nilai mahasiswa lain, dosen tidak dapat mengubah atau memfinalisasi kelas dosen lain), finalisasi dan sinkron transkrip, refresh token, serta pencabutan token. Jika dijalankan di luar jam akses, pengujian ubah/finalisasi nilai akan dilewati.

### Menguji Kepemilikan Data Saja

Untuk menguji khusus percobaan mengubah data milik pihak lain tanpa menjalankan seluruh smoke test:

```powershell
npm run test:kepemilikan
```

Uji ini hanya mengirim percobaan yang seharusnya ditolak, sehingga tidak mengubah data nilai maupun status finalisasi. Hasil yang diharapkan adalah seluruh pengujian `PASS` dengan status `403` untuk setiap percobaan.

## Akun dan Device Data Awal

| Role | Username | Password | Device ID | NIM | Nama |
| --- | --- | --- | --- | --- | --- |
| Admin | `admin` | `admin123` | `DEV-ADMIN-01` | - | Admin Program Studi |
| Dosen | `dosen1` | `dosen123` | `DEV-DOSEN1-01` | - | Wawan Sukmawan |
| Dosen | `dosen2` | `dosen123` | `DEV-DOSEN2-01` | - | Kirana Lestari |
| Mahasiswa | `mhs1` | `mhs123` | `DEV-MHS1-01` | `2023001` | Andi Pratama |
| Mahasiswa | `mhs2` | `mhs123` | `DEV-MHS2-01` | `2023002` | Rina Lestari |
| Mahasiswa | `mhs3` | `mhs123` | `DEV-MHS3-01` | `2023003` | Fajar Nugraha |

Kredensial service-to-service:

| Client ID | Client Secret |
| --- | --- |
| `service-nilai` | `nilai-secret-2026` |

Kelas data awal:

| Kode | Mata Kuliah | Dosen Pengampu |
| --- | --- | --- |
| `IF101` | Pemrograman Web | `dosen1` |
| `IF102` | Basis Data | `dosen2` |
| `IF103` | Algoritma dan Struktur Data | `dosen1` |

Setiap user memiliki tepat satu device terdaftar. Login dengan device yang tidak terdaftar akan ditolak.

## Cara Menggunakan Frontend

1. Buka `http://localhost:3000`.
2. Isi username dan password, lalu pilih device ID yang sesuai dari kotak dropdown.
3. Setelah login:
   - **Mahasiswa** melihat nilai miliknya dan transkrip miliknya.
   - **Dosen** melihat kelas yang diampu, mengubah nilai, dan memfinalisasi kelas.
   - **Admin** melihat seluruh transkrip dan audit log.
4. Tombol **Keluar** memanggil logout dan mencabut refresh token.

Frontend hanya alat bantu demonstrasi lokal. Pengujian utama tetap dapat dilakukan dengan Postman atau curl.

## Kebutuhan Sistem dan Implementasinya

### 4.1 Autentikasi dan Token

| Kebutuhan | Implementasi |
| --- | --- |
| Access token JWT 10 menit, berisi `sub` dan `role` | `shared/auth.js`, `signAccessToken()` dengan `expiresIn: 10m` |
| Dikirim melalui `Authorization: Bearer <token>` | Diperiksa gateway dan setiap service |
| Refresh token 1 hari, disimpan di database, dapat dicabut | Tabel `refresh_tokens`, token disimpan sebagai hash SHA-256 |
| Logout mencabut refresh token | `POST /auth/logout` mengubah `revoked = 1` |
| Token service 5 menit | `POST /auth/service` dengan client ID dan secret |
| Gateway secret | Gateway menambahkan `X-Gateway-Secret`; service menolak tanpa header tersebut |
| Verifikasi ulang di service | Service memverifikasi gateway secret, JWT, `type`, dan masa berlaku |

### 4.2 Kebijakan Akses

Policy Engine berada di `gateway/policy.js`. Selain membaca isi token, Policy Engine membaca database untuk memeriksa:

- Kelas yang diampu dosen.
- Kepemilikan NIM mahasiswa.
- Status finalisasi nilai.
- Device yang terdaftar untuk user.

| Method | Endpoint | Ditangani oleh | Diizinkan | Kondisi |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | Gateway | Semua user | Kredensial valid dan device terdaftar |
| POST | `/auth/refresh` | Gateway | Semua user | Refresh token valid, belum dicabut, device cocok |
| POST | `/auth/logout` | Gateway | Semua user | Refresh token valid dan device cocok |
| POST | `/auth/service` | Gateway | Service Nilai | Client ID dan secret valid |
| GET | `/nilai` | Service Nilai | Mahasiswa, dosen | Mahasiswa hanya nilai miliknya; dosen hanya kelas yang diampu |
| PUT | `/nilai/:id` | Service Nilai | Dosen | Kelas yang diampu, nilai belum final, dalam jam akses |
| POST | `/kelas/:id/finalisasi` | Service Nilai | Dosen | Kelas yang diampu, dalam jam akses, lalu sinkron transkrip |
| GET | `/transkrip/:nim` | Service Transkrip | Mahasiswa, admin | Mahasiswa hanya NIM sendiri; admin semua NIM |
| POST | `/transkrip/sinkron` | Service Transkrip | Service Nilai | Hanya token service; token user ditolak |
| GET | `/transkrip` | Service Transkrip | Admin | Endpoint tambahan untuk frontend admin |
| GET | `/kelas` | Service Nilai | Admin, dosen, mahasiswa | Endpoint tambahan untuk frontend |
| GET | `/audit` | Gateway | Admin | Endpoint tambahan untuk melihat audit log |
| GET | `/meta`, `/health` | Gateway | Publik | Informasi jam akses dan status gateway |

### 4.3 Verifikasi Konteks

- **Device terdaftar**: setiap request user wajib membawa `X-Device-ID`. Gateway mencocokkannya dengan tabel `devices`.
- **Jam akses**: perubahan dan finalisasi nilai hanya diizinkan pada `ACCESS_START_HOUR` sampai `ACCESS_END_HOUR` (default `07.00-21.00` waktu server). Nilai dapat diubah melalui `.env`.
- **Pemeriksaan berlapis**: gateway memeriksa kebijakan, lalu Service Nilai memeriksa ulang role, kepemilikan kelas, status final, dan jam akses.

### 4.4 Audit Log

Gateway menulis audit log untuk setiap keputusan akses ke tabel `audit_logs`:

- waktu
- subjek (username user atau client service)
- role
- method dan endpoint
- device
- hasil (`allow` atau `deny`)
- alasan keputusan

Audit log dapat dilihat oleh admin melalui frontend atau `GET /audit`.

## Konfigurasi

Salin `.env.example` menjadi `.env` jika ingin mengubah nilai default.

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `JWT_SECRET` | `simulasi-dev-jwt-secret-change-me` | Secret tanda tangan JWT |
| `GATEWAY_SECRET` | `simulasi-gateway-secret-change-me` | Secret yang ditambahkan gateway ke service |
| `ACCESS_TOKEN_TTL` | `10m` | Masa berlaku access token |
| `SERVICE_TOKEN_TTL` | `5m` | Masa berlaku token service |
| `REFRESH_TOKEN_TTL_MS` | `86400000` | Masa berlaku refresh token (1 hari) |
| `GATEWAY_PORT` | `3000` | Port API Gateway |
| `NILAI_PORT` | `3001` | Port Service Nilai |
| `TRANSKRIP_PORT` | `3002` | Port Service Transkrip |
| `ACCESS_START_HOUR` | `7` | Awal jam akses (format 24 jam) |
| `ACCESS_END_HOUR` | `21` | Akhir jam akses (format 24 jam) |
| `SERVICE_CLIENT_ID` | `service-nilai` | Client ID service |
| `SERVICE_CLIENT_SECRET` | `nilai-secret-2026` | Client secret service |
| `DB_PATH` | `./data/simulasi.db` | Lokasi database SQLite |

Contoh demonstrasi penolakan di luar jam akses: ubah `.env` menjadi `ACCESS_START_HOUR=22` dan `ACCESS_END_HOUR=23`, lalu restart semua service. Penolakan juga dapat didemokan dengan mengatur `ACCESS_START_HOUR=0` dan `ACCESS_END_HOUR=0`.

## Contoh Pengujian dengan curl (PowerShell)

Login mahasiswa:

```powershell
$login = curl.exe -s -X POST http://localhost:3000/auth/login `
  -H "Content-Type: application/json" `
  -H "X-Device-ID: DEV-MHS1-01" `
  -d '{"username":"mhs1","password":"mhs123"}' | ConvertFrom-Json

$token = $login.accessToken
$refresh = $login.refreshToken
```

Melihat nilai milik sendiri:

```powershell
curl.exe -s http://localhost:3000/nilai `
  -H "Authorization: Bearer $token" `
  -H "X-Device-ID: DEV-MHS1-01"
```

Mencoba melihat transkrip mahasiswa lain (harus ditolak `403`):

```powershell
curl.exe -s http://localhost:3000/transkrip/2023002 `
  -H "Authorization: Bearer $token" `
  -H "X-Device-ID: DEV-MHS1-01"
```

Mengakses Service Nilai secara langsung (harus ditolak `403`):

```powershell
curl.exe -s http://localhost:3001/nilai `
  -H "Authorization: Bearer $token"
```

Meminta token service:

```powershell
$service = curl.exe -s -X POST http://localhost:3000/auth/service `
  -H "Content-Type: application/json" `
  -d '{"clientId":"service-nilai","clientSecret":"nilai-secret-2026"}' | ConvertFrom-Json

$serviceToken = $service.accessToken
```

Memanggil sinkron transkrip dengan token service (harus `200`):

```powershell
curl.exe -s -X POST http://localhost:3000/transkrip/sinkron `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $serviceToken" `
  -d '{"kelasId":1}'
```

Memanggil sinkron transkrip dengan token user (harus ditolak `403`):

```powershell
curl.exe -s -X POST http://localhost:3000/transkrip/sinkron `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -d '{"kelasId":1}'
```

Refresh token:

```powershell
curl.exe -s -X POST http://localhost:3000/auth/refresh `
  -H "Content-Type: application/json" `
  -H "X-Device-ID: DEV-MHS1-01" `
  -d "{`"refreshToken`":`"$refresh`"}"
```

Logout dan pencabutan refresh token:

```powershell
curl.exe -s -X POST http://localhost:3000/auth/logout `
  -H "Content-Type: application/json" `
  -H "X-Device-ID: DEV-MHS1-01" `
  -d "{`"refreshToken`":`"$refresh`"}"
```

Setelah logout, refresh token yang sama akan ditolak `401`.

## Skenario Demonstrasi Zero Trust

1. **Tanpa token** ke `/nilai` menghasilkan `401`.
2. **Device salah** walaupun token valid menghasilkan `403`.
3. **Akses langsung** ke port `3001` atau `3002` tanpa gateway secret menghasilkan `403`.
4. **Token user** untuk `/transkrip/sinkron` menghasilkan `403`; hanya token service yang diizinkan.
5. **Mahasiswa** membuka NIM mahasiswa lain menghasilkan `403`.
6. **Admin** membuka `/nilai` menghasilkan `403`.
7. **Dosen** mengubah nilai kelas dosen lain menghasilkan `403`.
8. **Di luar jam akses**, ubah dan finalisasi nilai menghasilkan `403`.
9. **Logout** mencabut refresh token sehingga refresh berikutnya menghasilkan `401`.
10. Semua keputusan di atas tercatat di **audit log** dengan alasan masing-masing.

## Catatan Keamanan dan Batasan

- Project ini ditujukan untuk demonstrasi lokal, bukan produksi.
- Ganti `JWT_SECRET`, `GATEWAY_SECRET`, dan client secret sebelum digunakan di lingkungan nyata.
- Access token tetap valid sampai masa berlakunya habis walaupun user sudah logout; yang dicabut adalah refresh token sesuai ketentuan tugas.
- Komunikasi lokal menggunakan HTTP. Pada produksi gunakan HTTPS/TLS.
- Database SQLite dipakai bersama oleh ketiga proses dengan mode WAL. Hentikan service sebelum melakukan `npm run reset`.
- Frontend menyimpan token di `sessionStorage` untuk kebutuhan demo lokal.
- Endpoint tambahan `GET /kelas`, `GET /transkrip`, `GET /audit`, dan `GET /meta` disediakan untuk kebutuhan tampilan dan demonstrasi, tetap melalui gateway dan kebijakan akses.
