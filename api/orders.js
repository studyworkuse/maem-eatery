import { requireAdmin } from './_lib/auth.js';
import { findCoupon, recordUsage } from './_lib/couponRepo.js';
import { HttpError, badRequest } from './_lib/errors.js';
import { readBody, route } from './_lib/http.js';
import { listMenu } from './_lib/menuRepo.js';
import { clearOrders, createOrder, generateOrderId, listOrders, removeOrder, updateOrderStatus } from './_lib/orderRepo.js';
import { buildOrder, todayJakarta } from './_lib/pricing.js';
import { readSettings } from './_lib/settingsRepo.js';
import { computeStatus } from './_lib/storeHours.js';
import { validateCustomerOrder, validateOrderStatus, validateRow } from './_lib/validate.js';

export default route({
  // GET /api/orders -> { items } (admin)
  GET: async (req) => {
    requireAdmin(req);
    return { items: await listOrders() };
  },

  // POST /api/orders  { name, phone, type, paymentMethod, table?, address?, notes?, couponCode?, items:[{name, qty, note}] }
  POST: async (req) => {
    // Resto tutup = tidak menerima pesanan sama sekali (dicek di server, bukan hanya di tampilan).
    const settings = await readSettings({ ttl: 3000 });
    if (!computeStatus(settings).open) throw new HttpError(403, settings.closedMessage);

    const body = readBody(req);
    const customer = validateCustomerOrder(body);

    const menu = await listMenu({ ttl: 3000 });
    let coupon = null;
    if (customer.couponCode) {
      coupon = await findCoupon(customer.couponCode); // baca langsung: kuota harus akurat
      if (!coupon) throw badRequest('Kode kupon tidak valid.');
    }

    const calc = buildOrder({ items: body.items, menu, coupon, phone: customer.phone, today: todayJakarta() });
    const id = generateOrderId();
    const order = {
      id,
      customerName: customer.name,
      phone: customer.phone,
      type: customer.type,
      paymentMethod: customer.paymentMethod,
      destination: customer.type === 'Takeaway' ? customer.address : customer.table || '-',
      notes: customer.notes,
      status: customer.paymentMethod === 'Cash' ? 'Ordered' : 'Waiting for Payment',
      ...calc,
    };

    const { time } = await createOrder(order);

    if (coupon) {
      try {
        await recordUsage(coupon, `${customer.name} - ${customer.phone}`);
      } catch (error) {
        console.error('[orders] Gagal mencatat pemakaian kupon:', error?.response?.data ?? error);
      }
    }

    return {
      order: {
        id,
        time,
        customerName: customer.name,
        phone: customer.phone,
        type: customer.type,
        paymentMethod: customer.paymentMethod,
        destination: order.destination,
        notes: customer.notes,
        status: order.status,
        lines: calc.lines,
        subtotal: calc.subtotal,
        discount: calc.discount,
        couponCode: calc.couponCode,
        total: calc.total,
      },
    };
  },

  // PATCH /api/orders  { row, id, status }
  PATCH: async (req) => {
    requireAdmin(req);
    const body = readBody(req);
    await updateOrderStatus(validateRow(body.row), String(body.id ?? ''), validateOrderStatus(body.status));
    return { ok: true };
  },

  // DELETE /api/orders?row=3&id=ORD-ABC123   |   DELETE /api/orders?all=1
  DELETE: async (req) => {
    requireAdmin(req);
    if (req.query?.all === '1') {
      await clearOrders();
      return { ok: true };
    }
    if (!req.query?.id) throw new HttpError(400, 'ID pesanan wajib diisi.');
    await removeOrder(validateRow(req.query.row), String(req.query.id));
    return { ok: true };
  },
});
