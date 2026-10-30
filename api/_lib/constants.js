// Konstanta bersama untuk seluruh backend.

/** Nama tab pada Google Sheets (harus sama persis dengan di spreadsheet). */
export const SHEETS = Object.freeze({
  orders: 'Rekapan Orderan',
  menu: 'Kelola Menu',
  coupons: 'Kode Kupon',
  settings: 'Pengaturan', // dibuat otomatis bila belum ada
});

export const TIME_ZONE = 'Asia/Jakarta';

export const ORDER_TYPES = Object.freeze(['Dine-in', 'Takeaway']);
export const ORDER_STATUSES = Object.freeze(['Ordered', 'Waiting for Payment', 'Processed', 'Done']);

/** Metode pembayaran yang diizinkan per tipe pesanan. */
export const PAYMENT_METHODS = Object.freeze({
  'Dine-in': ['Cash', 'Transfer', 'QRIS'],
  Takeaway: ['Transfer', 'QRIS'],
});

export const MENU_STATUS = Object.freeze({
  available: 'available',
  outOfStock: 'out of stock',
});

/** Kolom tambahan pada tab "Rekapan Orderan" (A-E sudah ada di sheet). */
export const ORDER_EXTRA_HEADERS = Object.freeze([
  'No. WhatsApp',
  'Meja / Alamat',
  'Pembayaran',
  'Pesanan',
  'Kupon',
  'Subtotal',
  'Diskon',
  'Catatan',
]);
