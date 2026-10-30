# Ma’em Eatery

Website pemesanan Ma’em Eatery. **Google Sheets adalah database-nya** (menu, kupon, pesanan) lewat
Vercel Serverless Functions + Service Account — **tanpa Apps Script**. Karena data ada di satu
spreadsheet, perubahan di satu perangkat otomatis terlihat di semua perangkat.

## Fitur

| # | Fitur | Cara kerja |
|---|-------|-----------|
| 1 | **Kode Kupon** di dashboard admin | Tab *Kode Kupon* di sheet = tab *Kode Kupon* di dashboard (tambah/edit/hapus/reset pemakaian). Validasi di server: expired, minimal belanja, maksimal diskon, batas pemakaian, 1 nomor 1 kali pakai. |
| 2 | Menu & kategori dari tab **Kelola Menu** | Edit lewat Sheets **atau** dashboard → sama-sama berubah. Kategori mengikuti kolom *Kategori*. Status `out of stock` tampil sebagai **Habis**. |
| 3 | Tanpa `localStorage` untuk data bersama | Menu, kupon, dan pesanan dibaca/ditulis ke Sheets. Sinkronisasi otomatis tiap 15 dtk (menu) / 10 dtk (pesanan di admin). Hanya *isi keranjang* pelanggan yang tetap di perangkatnya (memang milik per-pelanggan). |
| 4 | **Keranjang Menu** + detail menu + catatan | Klik kartu menu → gambar & deskripsi penuh + catatan opsional. Di keranjang, tiap menu punya kolom catatan sendiri. |
| 6 | **Buka/Tutup, jam, papan pengumuman** | Pill status di header (klik = jadwal mingguan). Saat **tutup**: tombol tambah/checkout terkunci dan server menolak pesanan (403). Diatur di dashboard tab *Jam & Pengumuman* atau langsung di tab *Pengaturan* di Sheets. |
| 7 | Ikon Instagram & WhatsApp | Di samping tombol keranjang; link otomatis dari `instagramUsername` dan `whatsappNumber` di `config.js`. |
| 5 | Metode pembayaran | Dine-in: Cash / Transfer / QRIS. Takeaway: Transfer / QRIS. Dicek ulang di server. |

## Struktur

```
api/                 Vercel Functions (hanya 4 → aman untuk paket Hobby)
  login.js           POST  PIN admin → token sesi
  menu.js            GET publik | POST/PUT/DELETE admin
  coupons.js         POST validate (publik) | GET/POST/PUT/DELETE admin
  orders.js          POST buat pesanan (publik) | GET/PATCH/DELETE admin
  _lib/              sheets, auth, repo per-tab, harga/kupon, validasi (logika murni dites)
public/              Frontend statis (HTML + Tailwind CDN + ES modules)
tests/               node --test (24 tes: harga, kupon, validasi, sesi)
```

## Setup (sekali saja)

### 1. Service Account Google
1. [Google Cloud Console](https://console.cloud.google.com) → buat project → **APIs & Services → Library → Google Sheets API → Enable**.
2. **IAM & Admin → Service Accounts → Create** → buka akun tsb → **Keys → Add key → JSON** (file terunduh).
3. Buka spreadsheet → **Bagikan** → tambahkan `client_email` dari file JSON tadi sebagai **Editor**.

### 2. Siapkan spreadsheet
Nama tab harus persis: `Rekapan Orderan`, `Kelola Menu`, `Kode Kupon`.

- **Kelola Menu**: A Nama · B Kategori · C Harga · D URL Gambar · E Deskripsi · F Status (`available` / `out of stock`). Gambar & deskripsi boleh kosong.
- **Kode Kupon**: A Kode · B Diskon · C Minimal Belanja · D Maksimal Diskon · E Expired Tanggal · F Batas Pemakaian · G Telah dipakai oleh.
  - Baris contoh `(nama - nomor pelanggan)` di kolom G **diabaikan** otomatis (tidak dihitung sebagai pemakaian).
  - Batas Pemakaian `0` / kosong = tanpa batas; Maksimal Diskon `0` / kosong = tanpa batas.
- **Rekapan Orderan**: kolom A–E sudah ada. Kolom F–M (WhatsApp, Meja/Alamat, Pembayaran, Pesanan, Kupon, Subtotal, Diskon, Catatan) **dibuat otomatis** saat pesanan pertama masuk.

### 3. Deploy ke GitHub + Vercel
1. Push folder ini ke repo GitHub.
2. Vercel → **Add New Project** → pilih repo (Framework: *Other*; tidak perlu build command).
3. **Settings → Environment Variables**, isi:

| Variabel | Isi |
|----------|-----|
| `SPREADSHEET_ID` | `1EpDsGV1Vp1sx_hRwzEXiqwoabjaL39LG2y-_r6x9I3Q` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` dari JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` dari JSON (tempel apa adanya) |
| `ADMIN_PIN` | PIN admin pilihanmu |
| `SESSION_SECRET` | string acak ≥ 32 karakter |

4. **Redeploy**.

### 4. Sesuaikan `public/js/config.js`
- `whatsappNumber` — nomor WA restoran (juga dipakai tombol WhatsApp di header).
- `instagramUsername` — username Instagram tanpa @ (`maem_eatery`).
- `payment.bank` — **ganti data rekening** (sekarang masih placeholder `0000000000`).
- `payment.qrisImage` — taruh gambar QRIS di `public/assets/qris.png`.

### 5. Tab *Pengaturan* (otomatis)
Dibuat sendiri saat pertama kali dibuka (tidak perlu dibuat manual). Isinya baris `kunci | nilai`:

| Kunci | Nilai |
|-------|-------|
| `mode` | `auto` (ikuti jadwal) / `buka` (paksa buka) / `tutup` (paksa tutup) |
| `jam_senin` … `jam_minggu` | `09:00-21:00`, atau `tutup` untuk libur. Jam tutup < jam buka (mis. `18:00-02:00`) = buka lewat tengah malam |
| `pengumuman` | Teks papan pengumuman (kosong = disembunyikan) |
| `pesan_tutup` | Pesan yang tampil saat tutup |

Jam bawaan `09:00-21:00` setiap hari — **sesuaikan** di dashboard. Jam memakai WIB. Format jam yang salah dianggap *tutup* (aman). Perubahan terlihat di semua perangkat dalam ±30 detik.

## Development lokal
```bash
npm install
cp .env.example .env.local   # lalu isi
npx vercel dev               # http://localhost:3000
npm test
```

## Troubleshooting: "Terjadi kesalahan pada server"
Buka **`https://DOMAIN-ANDA.vercel.app/api/health`** di browser. Halaman ini menunjukkan variabel mana yang belum
terisi dan apakah tiap tab bisa dibaca (tanpa menampilkan nilai rahasia):

| Tampilan | Artinya / solusi |
|---|---|
| `env: ... false` | Environment variable itu belum diisi di Vercel → isi lalu **Redeploy**. |
| `privateKeyFormat: format salah` | `GOOGLE_PRIVATE_KEY` terpotong; salin utuh dari `-----BEGIN` sampai `END PRIVATE KEY-----`. |
| `Spreadsheet belum dibagikan...` | Bagikan spreadsheet ke `client_email` sebagai **Editor**. |
| `Google Sheets API belum diaktifkan` | Google Cloud → APIs & Services → Library → Google Sheets API → **Enable**. |
| `Spreadsheet tidak ditemukan` | `SPREADSHEET_ID` salah (ambil dari URL antara `/d/` dan `/edit`). |
| `Nama tab ... harus persis` | Ganti nama tab menjadi `Rekapan Orderan`, `Kelola Menu`, `Kode Kupon`. |

Setelah mengubah environment variable, selalu **Redeploy**. Detail teknis lengkap ada di Vercel → Project → **Logs**.
Endpoint `/api/health` boleh dihapus (file `api/health.js`) setelah semuanya berjalan.

## Catatan keamanan & batasan
- **PIN admin kini di server** (env var), bukan di kode frontend. Sebelumnya PIN terlihat di sumber halaman. Login dibatasi 5 percobaan/10 menit/IP (best-effort per instance).
- Harga & kupon **dihitung ulang di server** dari Sheets; nilai dari browser tidak dipercaya.
- Teks pelanggan dibersihkan dari *formula injection* sebelum masuk Sheets, dan di-escape saat ditampilkan (anti-XSS).
- Kuota Sheets API ±60 baca/menit per service account. Aman karena respons menu di-cache CDN 5 dtk dan ada cache baca singkat di server. Jika trafik sangat tinggi, naikkan `menuPollMs`.
- Pemakaian kupon dicatat setelah pesanan tersimpan; dua pesanan *persis bersamaan* pada kuota terakhir berpotensi sama-sama lolos (Sheets tidak punya transaksi atomik).
- Edit/hapus dari admin memverifikasi baris masih sama (mencegah salah hapus jika sheet diedit bersamaan); jika berbeda, muncul pesan untuk memuat ulang.
- Menghapus baris langsung di Sheets saat pelanggan membuka keranjang: item dikeluarkan otomatis pada sinkronisasi berikutnya.
