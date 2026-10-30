// Validasi & normalisasi input dari client (fungsi murni).
import { ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS, MENU_STATUS } from './constants.js';
import { badRequest } from './errors.js';
import { normalizePhone } from './pricing.js';
import { str } from './parse.js';
import { DAYS, DAY_LABELS, DEFAULT_CLOSED_MESSAGE, MODES, normalizeRange } from './storeHours.js';

function intInRange(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${label} tidak valid.`);
  return n;
}

function textInRange(value, min, max, label) {
  const text = str(value);
  if (text.length < min || text.length > max) {
    throw badRequest(min > 0 ? `${label} wajib diisi (${min}-${max} karakter).` : `${label} maksimal ${max} karakter.`);
  }
  return text;
}

export function validateCustomerOrder(body = {}) {
  const name = textInRange(body.name, 2, 80, 'Nama');
  const phone = normalizePhone(body.phone);
  if (phone.length < 10 || phone.length > 15) throw badRequest('Nomor WhatsApp tidak valid.');

  const type = str(body.type);
  if (!ORDER_TYPES.includes(type)) throw badRequest('Tipe pesanan tidak valid.');

  const paymentMethod = str(body.paymentMethod);
  if (!PAYMENT_METHODS[type].includes(paymentMethod)) {
    throw badRequest(`Metode pembayaran ${paymentMethod || '(kosong)'} tidak tersedia untuk ${type}.`);
  }

  const table = type === 'Dine-in' ? textInRange(body.table, 0, 30, 'Nomor meja') : '';
  const address = type === 'Takeaway' ? textInRange(body.address, 5, 300, 'Alamat pengiriman') : '';
  const notes = textInRange(body.notes, 0, 300, 'Catatan');
  const couponCode = str(body.couponCode).toUpperCase();

  return { name, phone, type, paymentMethod, table, address, notes, couponCode };
}

export function validateOrderStatus(status) {
  const value = str(status);
  if (!ORDER_STATUSES.includes(value)) throw badRequest('Status pesanan tidak valid.');
  return value;
}

export function validateMenuInput(body = {}, existingCategories = []) {
  const name = textInRange(body.name, 1, 80, 'Nama menu');
  let category = textInRange(body.category, 1, 40, 'Kategori');
  // Samakan penulisan dengan kategori yang sudah ada (case-insensitive).
  const match = existingCategories.find((c) => c.toLowerCase() === category.toLowerCase());
  if (match) category = match;

  const price = intInRange(body.price, 0, 10_000_000, 'Harga');
  const image = str(body.image);
  if (image && !/^https?:\/\/\S+$/i.test(image)) throw badRequest('URL gambar harus diawali http:// atau https://');
  if (image.length > 500) throw badRequest('URL gambar terlalu panjang.');
  const description = textInRange(body.description, 0, 500, 'Deskripsi');
  const available = body.available === false || body.available === 'false' ? false : true;

  return {
    name,
    category,
    price,
    image,
    description,
    status: available ? MENU_STATUS.available : MENU_STATUS.outOfStock,
  };
}

export function validateCouponInput(body = {}) {
  const code = str(body.code).toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    throw badRequest('Kode kupon 3-30 karakter (huruf, angka, - atau _).');
  }
  const percentValue = Number(body.percent);
  if (!Number.isFinite(percentValue) || percentValue <= 0 || percentValue > 100) {
    throw badRequest('Diskon harus di antara 1 dan 100 persen.');
  }
  const minPurchase = intInRange(body.minPurchase ?? 0, 0, 100_000_000, 'Minimal belanja');
  const maxDiscount = intInRange(body.maxDiscount ?? 0, 0, 100_000_000, 'Maksimal diskon');
  const limit = intInRange(body.limit ?? 0, 0, 100_000, 'Batas pemakaian');
  const expires = str(body.expires);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw badRequest('Tanggal kedaluwarsa wajib diisi.');

  return { code, percent: Math.round(percentValue * 100) / 10000, minPurchase, maxDiscount, limit, expires };
}

export function validateRow(value) {
  return intInRange(value, 2, 100_000, 'Baris data');
}

export function validateSettingsInput(body = {}) {
  const mode = str(body.mode);
  if (!MODES.includes(mode)) throw badRequest('Mode buka/tutup tidak valid.');

  const hours = {};
  for (const day of DAYS) {
    const raw = body.hours?.[day];
    const value = typeof raw === 'string' ? normalizeRange(raw) : null; // hari yang tidak dikirim ditolak, bukan dianggap libur
    if (value === null) {
      throw badRequest(`Jam ${DAY_LABELS[day]} tidak valid. Pakai format JJ:MM-JJ:MM (jam buka dan tutup tidak boleh sama) atau "tutup".`);
    }
    hours[day] = value;
  }

  return {
    mode,
    hours,
    announcement: textInRange(body.announcement, 0, 500, 'Pengumuman'),
    closedMessage: textInRange(body.closedMessage, 0, 300, 'Pesan tutup') || DEFAULT_CLOSED_MESSAGE,
  };
}
