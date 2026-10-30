// Tab "Rekapan Orderan": A "ID | Waktu" | B Pelanggan | C Tipe | D Total | E Status
// Kolom tambahan (dibuat otomatis): F WhatsApp | G Meja/Alamat | H Pembayaran | I Pesanan |
// J Kupon | K Subtotal | L Diskon | M Catatan
import { ORDER_EXTRA_HEADERS, SHEETS, TIME_ZONE } from './constants.js';
import { appendValues, clearValues, deleteRow, getValues, updateValues } from './sheets.js';
import { sanitizeCell, str, toNumber } from './parse.js';
import { HttpError } from './errors.js';

const ID_SEPARATOR = ' | ';

let headersReady = false;
async function ensureHeaders() {
  if (headersReady) return;
  const existing = await getValues(SHEETS.orders, 'F1:M1');
  if (!existing[0] || existing[0].every((cell) => !str(cell))) {
    await updateValues(SHEETS.orders, 'F1:M1', [[...ORDER_EXTRA_HEADERS]]);
  }
  headersReady = true;
}

export function generateOrderId() {
  const time = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 4).padEnd(2, '0');
  return `ORD-${time}${rand}`;
}

const formatTime = (date) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(date);

export function formatLines(lines) {
  return lines
    .map((l) => `${l.qty}x ${l.name} @${l.price}${l.note ? ` (catatan: ${l.note})` : ''}`)
    .join('\n');
}

export function parseOrderRows(rows) {
  return rows
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => str(r[0]))
    .map(({ r, row }) => {
      const [id, time = ''] = str(r[0]).split(ID_SEPARATOR);
      return {
        row,
        id,
        time,
        customerName: str(r[1]),
        type: str(r[2]),
        total: toNumber(r[3]),
        status: str(r[4]) || 'Ordered',
        phone: str(r[5]),
        destination: str(r[6]),
        paymentMethod: str(r[7]),
        itemsText: str(r[8]),
        coupon: str(r[9]),
        subtotal: toNumber(r[10]),
        discount: toNumber(r[11]),
        notes: str(r[12]),
      };
    })
    .reverse(); // terbaru di atas
}

export async function listOrders() {
  await ensureHeaders();
  return parseOrderRows(await getValues(SHEETS.orders, 'A2:M'));
}

export async function createOrder(order) {
  await ensureHeaders();
  const time = formatTime(new Date());
  await appendValues(SHEETS.orders, 'A:M', [[
    `${order.id}${ID_SEPARATOR}${time}`,
    sanitizeCell(order.customerName),
    order.type,
    order.total,
    order.status,
    `'${order.phone}`,
    sanitizeCell(order.destination),
    order.paymentMethod,
    sanitizeCell(formatLines(order.lines)),
    order.couponCode,
    order.subtotal,
    order.discount,
    sanitizeCell(order.notes),
  ]]);
  return { time };
}

async function assertOrderRow(row, expectedId) {
  const rows = await getValues(SHEETS.orders, `A${row}:A${row}`);
  const actual = str(rows[0]?.[0]).split(ID_SEPARATOR)[0];
  if (!actual || actual !== expectedId) {
    throw new HttpError(409, 'Pesanan sudah berubah di spreadsheet. Muat ulang daftar lalu coba lagi.');
  }
}

export async function updateOrderStatus(row, expectedId, status) {
  await assertOrderRow(row, expectedId);
  await updateValues(SHEETS.orders, `E${row}`, [[status]]);
}

export async function removeOrder(row, expectedId) {
  await assertOrderRow(row, expectedId);
  await deleteRow(SHEETS.orders, row);
}

export async function clearOrders() {
  await clearValues(SHEETS.orders, 'A2:M');
}
