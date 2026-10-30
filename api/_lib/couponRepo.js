// Tab "Kode Kupon": A Kode | B Diskon | C Minimal Belanja | D Maksimal Diskon |
// E Expired Tanggal | F Batas Pemakaian | G Telah dipakai oleh (satu baris per pemakai)
import { SHEETS } from './constants.js';
import { assertRowMatches, appendValues, deleteRow, getValues, updateValues } from './sheets.js';
import { parseSheetDate, parseUsedBy, str, toNumber, toPercentFraction } from './parse.js';
import { HttpError } from './errors.js';

export function parseCouponRows(rows) {
  return rows
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => str(r[0]))
    .map(({ r, row }) => ({
      row,
      code: str(r[0]).toUpperCase(),
      percent: toPercentFraction(r[1]),
      minPurchase: toNumber(r[2]),
      maxDiscount: toNumber(r[3]),
      expires: parseSheetDate(r[4]),
      limit: toNumber(r[5]),
      usedBy: parseUsedBy(r[6]),
    }));
}

export async function listCoupons({ ttl = 0 } = {}) {
  return parseCouponRows(await getValues(SHEETS.coupons, 'A2:G', { ttl }));
}

export async function findCoupon(code, { ttl = 0 } = {}) {
  const wanted = str(code).toUpperCase();
  return (await listCoupons({ ttl })).find((c) => c.code === wanted) ?? null;
}

const toRow = (c, usedBy = '') => [c.code, c.percent, c.minPurchase, c.maxDiscount, c.expires, c.limit, usedBy];

export async function createCoupon(coupon) {
  const existing = await findCoupon(coupon.code);
  if (existing) throw new HttpError(409, `Kode kupon ${coupon.code} sudah ada.`);
  await appendValues(SHEETS.coupons, 'A:G', [toRow(coupon)]);
}

/** Ubah aturan kupon; kolom pemakaian (G) tidak disentuh. */
export async function updateCoupon(row, expectedCode, coupon) {
  await assertRowMatches(SHEETS.coupons, row, expectedCode, 'Kupon');
  await updateValues(SHEETS.coupons, `A${row}:F${row}`, [toRow(coupon).slice(0, 6)]);
}

export async function removeCoupon(row, expectedCode) {
  await assertRowMatches(SHEETS.coupons, row, expectedCode, 'Kupon');
  await deleteRow(SHEETS.coupons, row);
}

/** Catat pemakaian kupon: tambah baris "nama - nomor" di kolom G. */
export async function recordUsage(coupon, label) {
  const current = await getValues(SHEETS.coupons, `G${coupon.row}:G${coupon.row}`);
  const lines = parseUsedBy(current[0]?.[0]);
  lines.push(label);
  await updateValues(SHEETS.coupons, `G${coupon.row}`, [[lines.join('\n')]]);
}

export async function resetUsage(row, expectedCode) {
  await assertRowMatches(SHEETS.coupons, row, expectedCode, 'Kupon');
  await updateValues(SHEETS.coupons, `G${row}`, [['']]);
}
