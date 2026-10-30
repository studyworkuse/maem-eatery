// Logika harga, kupon, dan validasi pesanan (fungsi murni, tanpa I/O).
import { TIME_ZONE } from './constants.js';
import { badRequest } from './errors.js';

export const formatRupiah = (amount) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount || 0);

/** Normalisasi nomor telepon Indonesia ke format 628xxx. */
export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return digits;
}

/** Tanggal hari ini (YYYY-MM-DD) pada zona waktu Jakarta. */
export function todayJakarta(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Ambil nomor telepon dari baris "nama - nomor". */
function phoneFromUsage(line) {
  const parts = String(line).split(' - ');
  return normalizePhone(parts[parts.length - 1]);
}

export function calcDiscount(coupon, subtotal) {
  let discount = Math.floor(subtotal * coupon.percent);
  if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  return Math.max(0, Math.min(discount, subtotal));
}

/**
 * Evaluasi kupon terhadap pesanan.
 * @returns {{valid: boolean, discount?: number, reason?: string}}
 */
export function evaluateCoupon(coupon, { subtotal, phone, today }) {
  if (!coupon) return { valid: false, reason: 'Kode kupon tidak valid.' };
  if (coupon.expires && today > coupon.expires) {
    return { valid: false, reason: 'Kupon sudah kedaluwarsa.' };
  }
  if (coupon.limit > 0 && coupon.usedBy.length >= coupon.limit) {
    return { valid: false, reason: 'Kuota pemakaian kupon sudah habis.' };
  }
  if (subtotal < coupon.minPurchase) {
    return { valid: false, reason: `Minimal belanja ${formatRupiah(coupon.minPurchase)} untuk memakai kupon ini.` };
  }
  const normalized = phone ? normalizePhone(phone) : '';
  if (normalized && coupon.usedBy.some((line) => phoneFromUsage(line) === normalized)) {
    return { valid: false, reason: 'Kupon ini sudah pernah kamu pakai.' };
  }
  return { valid: true, discount: calcDiscount(coupon, subtotal) };
}

const keyOf = (name) => String(name ?? '').trim().toLowerCase();

/**
 * Hitung pesanan dari harga di Sheets (harga dari client TIDAK dipercaya).
 */
export function buildOrder({ items, menu, coupon, phone, today }) {
  if (!Array.isArray(items) || items.length === 0) throw badRequest('Keranjang menu masih kosong.');
  if (items.length > 50) throw badRequest('Terlalu banyak item dalam satu pesanan.');

  const byName = new Map(menu.map((m) => [keyOf(m.name), m]));
  const merged = new Map();

  for (const item of items) {
    const menuItem = byName.get(keyOf(item?.name));
    if (!menuItem) throw badRequest(`Menu "${item?.name ?? ''}" tidak ditemukan atau sudah dihapus.`);
    if (!menuItem.available) throw badRequest(`Menu "${menuItem.name}" sedang habis.`);

    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw badRequest(`Jumlah untuk "${menuItem.name}" tidak valid.`);
    }
    const note = String(item.note ?? '').trim().slice(0, 150);

    const existing = merged.get(menuItem.name);
    if (existing) {
      existing.qty += qty;
      existing.note ||= note;
    } else {
      merged.set(menuItem.name, { name: menuItem.name, price: menuItem.price, qty, note });
    }
  }

  const lines = [...merged.values()].map((l) => ({ ...l, lineTotal: l.price * l.qty }));
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  let discount = 0;
  let couponCode = '';
  if (coupon) {
    const result = evaluateCoupon(coupon, { subtotal, phone, today });
    if (!result.valid) throw badRequest(result.reason);
    discount = result.discount;
    couponCode = coupon.code;
  }

  return { lines, subtotal, discount, couponCode, total: subtotal - discount };
}
