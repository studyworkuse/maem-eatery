import { requireAdmin } from './_lib/auth.js';
import { createCoupon, findCoupon, listCoupons, removeCoupon, resetUsage, updateCoupon } from './_lib/couponRepo.js';
import { HttpError } from './_lib/errors.js';
import { readBody, route } from './_lib/http.js';
import { evaluateCoupon, formatRupiah, todayJakarta } from './_lib/pricing.js';
import { toNumber } from './_lib/parse.js';
import { validateCouponInput, validateRow } from './_lib/validate.js';

/** Cek kupon untuk pelanggan (publik). Selalu 200; `valid` menandakan hasilnya. */
async function validateForCustomer(body) {
  const subtotal = toNumber(body.subtotal);
  const coupon = await findCoupon(body.code, { ttl: 3000 });
  const result = evaluateCoupon(coupon, { subtotal, phone: body.phone, today: todayJakarta() });
  if (!result.valid) return { valid: false, message: result.reason };

  return {
    valid: true,
    code: coupon.code,
    percent: coupon.percent,
    minPurchase: coupon.minPurchase,
    maxDiscount: coupon.maxDiscount,
    discount: result.discount,
    message: `Kupon ${coupon.code} dipasang: diskon ${Math.round(coupon.percent * 1000) / 10}%${
      coupon.maxDiscount > 0 ? ` (maks. ${formatRupiah(coupon.maxDiscount)})` : ''
    }.`,
  };
}

export default route({
  // GET /api/coupons -> { items } (admin)
  GET: async (req) => {
    requireAdmin(req);
    return { items: await listCoupons() };
  },

  // POST /api/coupons  { action: 'validate', code, subtotal, phone? }  (publik)
  //                    { action: 'create' | 'reset', ... }               (admin)
  POST: async (req) => {
    const body = readBody(req);
    if (body.action === 'validate') return validateForCustomer(body);

    requireAdmin(req);
    if (body.action === 'reset') {
      await resetUsage(validateRow(body.row), body.expectedCode);
      return { ok: true };
    }
    await createCoupon(validateCouponInput(body));
    return { ok: true };
  },

  // PUT /api/coupons  { row, expectedCode, code, percent, minPurchase, maxDiscount, expires, limit }
  PUT: async (req) => {
    requireAdmin(req);
    const body = readBody(req);
    const coupon = validateCouponInput(body);
    const existing = await listCoupons();
    const duplicate = existing.find((c) => c.code === coupon.code);
    if (duplicate && duplicate.row !== Number(body.row)) {
      throw new HttpError(409, `Kode kupon ${coupon.code} sudah ada.`);
    }
    await updateCoupon(validateRow(body.row), body.expectedCode, coupon);
    return { ok: true };
  },

  // DELETE /api/coupons?row=2&code=MAEM1111
  DELETE: async (req) => {
    requireAdmin(req);
    await removeCoupon(validateRow(req.query?.row), req.query?.code);
    return { ok: true };
  },
});
