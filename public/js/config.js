// Konfigurasi sisi klien. Data menu, kupon, dan pesanan TIDAK disimpan di sini
// melainkan di Google Sheets (lewat /api).

export const CONFIG = Object.freeze({
  /** Nomor WhatsApp restoran, format internasional tanpa "+". */
  whatsappNumber: '6285181471902',

  /** Username Instagram restoran (tanpa @). */
  instagramUsername: 'maem_eatery',

  /** Interval sinkronisasi antar-perangkat (ms). */
  menuPollMs: 15_000,
  adminPollMs: 10_000,
  settingsPollMs: 30_000, // status buka/tutup & pengumuman

  /** Metode pembayaran per tipe pesanan (harus sama dengan backend). */
  paymentMethods: {
    'Dine-in': ['Cash', 'Transfer', 'QRIS'],
    Takeaway: ['Transfer', 'QRIS'],
  },

  /** Informasi pembayaran yang ditampilkan setelah pesanan dibuat. GANTI sesuai data asli. */
  payment: {
    bank: { name: 'BRI', accountNumber: '5472 0100 4214 506', accountHolder: 'Haura Syifa' },
    /** Taruh gambar QRIS di public/assets/qris.png (atau ubah path ini). */
    qrisImage: '/assets/qris.png',
  },
});
