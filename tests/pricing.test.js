import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCouponRows } from '../api/_lib/couponRepo.js';
import { parseMenuRows } from '../api/_lib/menuRepo.js';
import { parseOrderRows } from '../api/_lib/orderRepo.js';
import { parseSheetDate, parseUsedBy, sanitizeCell, toNumber, toPercentFraction } from '../api/_lib/parse.js';
import { buildOrder, calcDiscount, evaluateCoupon, normalizePhone, todayJakarta } from '../api/_lib/pricing.js';
import { createToken, verifyToken } from '../api/_lib/auth.js';
import { validateCouponInput, validateCustomerOrder, validateMenuInput } from '../api/_lib/validate.js';

const MENU = [
  { name: 'NASI TELUR DADAR', price: 15000, available: true },
  { name: 'NUGGET', price: 20000, available: true },
  { name: 'NASI GULTIK', price: 20000, available: false },
];

// Kupon contoh dari spreadsheet: MAEM1111, 10%, min 30.000, maks 10.000, batas 3 pemakaian
const coupon = (overrides = {}) => ({
  code: 'MAEM1111',
  percent: 0.1,
  minPurchase: 30000,
  maxDiscount: 10000,
  expires: '2026-11-12',
  limit: 3,
  usedBy: [],
  ...overrides,
});

describe('parse', () => {
  it('membaca angka dan persen dari sel Sheets', () => {
    assert.equal(toNumber('Rp20.000'), 20000);
    assert.equal(toNumber(15000), 15000);
    assert.equal(toPercentFraction(0.1), 0.1);
    assert.equal(toPercentFraction('10%'), 0.1);
    assert.equal(toPercentFraction(10), 0.1);
  });

  it('membaca tanggal serial, ISO, dan teks Indonesia', () => {
    assert.equal(parseSheetDate(46338), '2026-11-12'); // serial Sheets untuk 12 Nov 2026
    assert.equal(parseSheetDate('2026-11-12'), '2026-11-12');
    assert.equal(parseSheetDate('12 November 2026'), '2026-11-12');
    assert.equal(parseSheetDate('bukan tanggal'), '');
  });

  it('mengabaikan baris contoh "(nama - nomor pelanggan)" pada kolom pemakai', () => {
    const cell = '(nama - nomor pelanggan)\n(nama - nomor pelanggan)\nBudi - 628123456789';
    assert.deepEqual(parseUsedBy(cell), ['Budi - 628123456789']);
  });

  it('mencegah formula injection', () => {
    assert.equal(sanitizeCell('=HYPERLINK("x")'), `'=HYPERLINK("x")`);
    assert.equal(sanitizeCell('Budi'), 'Budi');
  });
});

describe('parse baris sheet', () => {
  it('menu: status, kategori, dan baris kosong', () => {
    const items = parseMenuRows([
      ['NASI GULTIK', 'MAIN COURSE', 20000, '', '', 'out of stock'],
      [],
      ['NUGGET', 'SNACKS', 20000, 'https://x/y.jpg', 'Enak', 'available'],
    ]);
    assert.equal(items.length, 2);
    assert.equal(items[0].available, false);
    assert.equal(items[0].row, 2);
    assert.equal(items[1].row, 4);
    assert.equal(items[1].image, 'https://x/y.jpg');
  });

  it('kupon: sesuai tata letak sheet', () => {
    const [c] = parseCouponRows([['MAEM1111', 0.1, 30000, 10000, 46338, 3, '(nama - nomor pelanggan)\n(nama - nomor pelanggan)']]);
    assert.equal(c.code, 'MAEM1111');
    assert.equal(c.percent, 0.1);
    assert.equal(c.expires, '2026-11-12');
    assert.equal(c.limit, 3);
    assert.equal(c.usedBy.length, 0);
  });

  it('pesanan: terbaru di atas, ID dipisah dari waktu', () => {
    const orders = parseOrderRows([
      ['ORD-AAA | 29/10/2026 10.00', 'Budi', 'Dine-in', 15000, 'Ordered'],
      ['ORD-BBB | 29/10/2026 11.00', 'Sari', 'Takeaway', 20000, 'Done'],
    ]);
    assert.equal(orders[0].id, 'ORD-BBB');
    assert.equal(orders[0].row, 3);
    assert.equal(orders[1].time, '29/10/2026 10.00');
  });
});

describe('kupon', () => {
  const base = { subtotal: 50000, phone: '081234567890', today: '2026-10-29' };

  it('diskon 10% dibatasi maksimal', () => {
    assert.equal(calcDiscount(coupon(), 50000), 5000);
    assert.equal(calcDiscount(coupon(), 200000), 10000);
  });

  it('valid pada hari terakhir, kedaluwarsa sesudahnya', () => {
    assert.equal(evaluateCoupon(coupon(), { ...base, today: '2026-11-12' }).valid, true);
    assert.equal(evaluateCoupon(coupon(), { ...base, today: '2026-11-13' }).valid, false);
  });

  it('menolak di bawah minimal belanja', () => {
    const r = evaluateCoupon(coupon(), { ...base, subtotal: 29000 });
    assert.equal(r.valid, false);
    assert.match(r.reason, /Minimal belanja/);
  });

  it('menolak ketika kuota habis', () => {
    const used = ['A - 6281', 'B - 6282', 'C - 6283'];
    assert.equal(evaluateCoupon(coupon({ usedBy: used }), base).valid, false);
    assert.equal(evaluateCoupon(coupon({ usedBy: used, limit: 0 }), base).valid, true); // 0 = tanpa batas
  });

  it('satu nomor hanya boleh sekali, beda format nomor tetap terdeteksi', () => {
    const used = ['Budi - 6281234567890'];
    assert.equal(evaluateCoupon(coupon({ usedBy: used }), { ...base, phone: '081234567890' }).valid, false);
    assert.equal(evaluateCoupon(coupon({ usedBy: used }), { ...base, phone: '+62 812-3456-7890' }).valid, false);
    assert.equal(evaluateCoupon(coupon({ usedBy: used }), { ...base, phone: '081111111111' }).valid, true);
  });

  it('kupon tidak ditemukan', () => {
    assert.equal(evaluateCoupon(null, base).valid, false);
  });
});

describe('buildOrder', () => {
  const today = '2026-10-29';

  it('memakai harga dari sheet dan menggabungkan item kembar', () => {
    const r = buildOrder({
      items: [
        { name: 'nasi telur dadar', qty: 1, note: 'tanpa kecap', price: 1 }, // harga dari client diabaikan
        { name: 'NASI TELUR DADAR', qty: 2 },
        { name: 'NUGGET', qty: 1 },
      ],
      menu: MENU,
      today,
    });
    assert.equal(r.lines.length, 2);
    assert.equal(r.lines[0].qty, 3);
    assert.equal(r.lines[0].note, 'tanpa kecap');
    assert.equal(r.subtotal, 65000);
    assert.equal(r.total, 65000);
  });

  it('menerapkan kupon pada total', () => {
    const r = buildOrder({ items: [{ name: 'NUGGET', qty: 2 }], menu: MENU, coupon: coupon(), phone: '0811', today });
    assert.equal(r.discount, 4000);
    assert.equal(r.total, 36000);
    assert.equal(r.couponCode, 'MAEM1111');
  });

  it('menolak menu habis, tidak ada, dan qty tidak valid', () => {
    assert.throws(() => buildOrder({ items: [{ name: 'NASI GULTIK', qty: 1 }], menu: MENU, today }), /habis/);
    assert.throws(() => buildOrder({ items: [{ name: 'XYZ', qty: 1 }], menu: MENU, today }), /tidak ditemukan/);
    assert.throws(() => buildOrder({ items: [{ name: 'NUGGET', qty: 0 }], menu: MENU, today }), /tidak valid/);
    assert.throws(() => buildOrder({ items: [{ name: 'NUGGET', qty: 1.5 }], menu: MENU, today }), /tidak valid/);
    assert.throws(() => buildOrder({ items: [], menu: MENU, today }), /kosong/);
  });

  it('menolak pesanan jika kupon tidak memenuhi syarat', () => {
    assert.throws(
      () => buildOrder({ items: [{ name: 'NASI TELUR DADAR', qty: 1 }], menu: MENU, coupon: coupon(), phone: '0811', today }),
      /Minimal belanja/,
    );
  });
});

describe('validasi input', () => {
  const order = { name: 'Budi', phone: '081234567890', type: 'Dine-in', paymentMethod: 'Cash', table: 'Meja 5' };

  it('Dine-in boleh Cash/Transfer/QRIS', () => {
    for (const paymentMethod of ['Cash', 'Transfer', 'QRIS']) {
      assert.equal(validateCustomerOrder({ ...order, paymentMethod }).paymentMethod, paymentMethod);
    }
  });

  it('Takeaway hanya Transfer/QRIS dan wajib alamat', () => {
    const takeaway = { ...order, type: 'Takeaway', paymentMethod: 'Transfer', address: 'Jl. Damar No. 1 Padang' };
    assert.equal(validateCustomerOrder(takeaway).address, 'Jl. Damar No. 1 Padang');
    assert.throws(() => validateCustomerOrder({ ...takeaway, paymentMethod: 'Cash' }), /tidak tersedia/);
    assert.throws(() => validateCustomerOrder({ ...takeaway, address: '' }), /Alamat/);
  });

  it('nomor telepon dinormalisasi', () => {
    assert.equal(normalizePhone('0812-3456-7890'), '6281234567890');
    assert.equal(validateCustomerOrder(order).phone, '6281234567890');
    assert.throws(() => validateCustomerOrder({ ...order, phone: '123' }), /WhatsApp/);
  });

  it('menu: kategori disamakan dengan yang sudah ada', () => {
    const item = validateMenuInput({ name: 'Bakso', category: 'main course', price: '15000' }, ['MAIN COURSE']);
    assert.equal(item.category, 'MAIN COURSE');
    assert.equal(item.status, 'available');
    assert.throws(() => validateMenuInput({ name: 'X', category: 'Y', price: -1 }), /Harga/);
    assert.throws(() => validateMenuInput({ name: 'X', category: 'Y', price: 1, image: 'javascript:alert(1)' }), /URL gambar/);
  });

  it('kupon: persen disimpan sebagai pecahan', () => {
    const c = validateCouponInput({ code: 'maem1111', percent: 10, minPurchase: 30000, maxDiscount: 10000, limit: 3, expires: '2026-11-12' });
    assert.equal(c.code, 'MAEM1111');
    assert.equal(c.percent, 0.1);
    assert.throws(() => validateCouponInput({ code: 'A', percent: 10, expires: '2026-11-12' }), /Kode kupon/);
    assert.throws(() => validateCouponInput({ code: 'ABC', percent: 150, expires: '2026-11-12' }), /Diskon/);
  });
});

describe('sesi admin & waktu', () => {
  it('token valid, kedaluwarsa, dan dipalsukan', () => {
    const now = Date.now();
    const token = createToken('rahasia', now);
    assert.equal(verifyToken(token, 'rahasia', now + 1000), true);
    assert.equal(verifyToken(token, 'rahasia', now + 13 * 3600 * 1000), false);
    assert.equal(verifyToken(token, 'salah', now), false);
    assert.equal(verifyToken('9999999999999.palsu', 'rahasia', now), false);
  });

  it('tanggal hari ini memakai zona Jakarta', () => {
    // 29 Okt 2026 18.00 UTC = 30 Okt 2026 01.00 WIB
    assert.equal(todayJakarta(new Date('2026-10-29T18:00:00Z')), '2026-10-30');
  });
});
