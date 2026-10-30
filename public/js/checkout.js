// Formulir pemesanan, pilihan pembayaran, dan layar konfirmasi.
import { api } from './api.js';
import { CONFIG } from './config.js';
import { clearCart, getCoupon, getItems, total } from './cart.js';
import { resetCouponUi } from './cartView.js';
import { closedMessage, isOpen } from './storeView.js';
import { $, closeModal, esc, formatRupiah, hide, normalizePhone, openModal, show, toast } from './utils.js';

const CUSTOMER_KEY = 'maem_customer';

const els = {
  modal: $('#checkout-modal'),
  form: $('#checkout-form'),
  name: $('#cust-name'),
  phone: $('#cust-phone'),
  type: $('#order-type'),
  table: $('#cust-table'),
  address: $('#cust-address'),
  notes: $('#cust-notes'),
  tableBox: $('#table-no-container'),
  addressBox: $('#address-container'),
  payment: $('#payment-options'),
  paymentHint: $('#payment-hint'),
  total: $('#checkout-total'),
  error: $('#checkout-error'),
  submit: $('#checkout-submit'),
  success: $('#success-modal'),
  successId: $('#success-id'),
  successBody: $('#success-body'),
  successWa: $('#success-wa'),
};

const PAYMENT_META = {
  Cash: { icon: 'fa-money-bill-wave', hint: 'Bayar langsung di kasir.' },
  Transfer: { icon: 'fa-building-columns', hint: 'Nomor rekening ditampilkan setelah pesanan dikirim.' },
  QRIS: { icon: 'fa-qrcode', hint: 'Kode QRIS ditampilkan setelah pesanan dikirim.' },
};

const selectedPayment = () => $('input[name="payment"]:checked', els.payment)?.value;

function renderPaymentOptions(keep) {
  const methods = CONFIG.paymentMethods[els.type.value];
  const chosen = methods.includes(keep) ? keep : methods[0];
  els.payment.className = `grid gap-2 ${methods.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`;
  els.payment.innerHTML = methods
    .map(
      (method) => `
      <label class="pay-option relative">
        <input type="radio" name="payment" value="${method}" ${method === chosen ? 'checked' : ''}>
        <span><i class="fa-solid ${PAYMENT_META[method].icon} text-base"></i>${method}</span>
      </label>`,
    )
    .join('');
  updatePaymentHint();
}

function updatePaymentHint() {
  els.paymentHint.textContent = PAYMENT_META[selectedPayment()]?.hint ?? '';
}

function syncOrderType() {
  const isTakeaway = els.type.value === 'Takeaway';
  els.addressBox.classList.toggle('hidden', !isTakeaway);
  els.tableBox.classList.toggle('hidden', isTakeaway);
  renderPaymentOptions(selectedPayment());
}

function loadCustomer() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || '{}');
    if (saved.name && !els.name.value) els.name.value = saved.name;
    if (saved.phone && !els.phone.value) els.phone.value = saved.phone;
  } catch {
    /* abaikan */
  }
}

function saveCustomer(name, phone) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name, phone }));
  } catch {
    /* abaikan */
  }
}

function showError(message) {
  els.error.textContent = message;
  show(els.error);
}

export function openCheckout() {
  hide(els.error);
  loadCustomer();
  syncOrderType();
  els.total.textContent = formatRupiah(total());
  openModal(els.modal);
}

// ---------- Konfirmasi ----------

function whatsappMessage(order) {
  const lines = [`*HALO MAEM EATERY, SAYA MAU PESAN!* 🍽️`, '', `*ID Pesanan:* ${order.id}`, `*Nama:* ${order.customerName}`, `*No. WA:* ${order.phone}`, `*Tipe Order:* ${order.type}`];
  lines.push(order.type === 'Takeaway' ? `*Alamat Pengiriman:* ${order.destination}` : `*Nomor Meja:* ${order.destination}`);
  lines.push(`*Pembayaran:* ${order.paymentMethod}`);
  if (order.notes) lines.push(`*Catatan:* ${order.notes}`);

  lines.push('', '*DETAIL PESANAN:*');
  order.lines.forEach((l) => {
    lines.push(`- ${l.name} (x${l.qty}) : ${formatRupiah(l.lineTotal)}`);
    if (l.note) lines.push(`   _Catatan: ${l.note}_`);
  });

  if (order.discount > 0) {
    lines.push('', `*Subtotal:* ${formatRupiah(order.subtotal)}`, `*Diskon (${order.couponCode}):* -${formatRupiah(order.discount)}`);
  }
  lines.push(`*TOTAL BAYAR: ${formatRupiah(order.total)}*`, '');
  lines.push(order.paymentMethod === 'Cash' ? 'Mohon segera diproses ya, terima kasih!' : `Pembayaran via ${order.paymentMethod} akan saya kirimkan buktinya. Terima kasih!`);
  return lines.join('\n');
}

function paymentInstructions(order) {
  const { bank, qrisImage } = CONFIG.payment;
  if (order.paymentMethod === 'Cash') {
    return `<div class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900"><strong>Bayar tunai</strong> di kasir sebesar <strong>${formatRupiah(order.total)}</strong>.</div>`;
  }
  if (order.paymentMethod === 'Transfer') {
    return `
      <div class="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 space-y-1">
        <p class="font-bold">Transfer sebesar ${formatRupiah(order.total)} ke:</p>
        <p>${esc(bank.name)} — a.n. ${esc(bank.accountHolder)}</p>
        <div class="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-blue-100">
          <span class="font-mono font-bold text-base tracking-wide">${esc(bank.accountNumber)}</span>
          <button type="button" data-copy="${esc(bank.accountNumber)}" class="text-xs font-bold text-blue-700 hover:underline">Salin</button>
        </div>
        <p class="text-xs text-blue-800 pt-1">Setelah transfer, kirim bukti lewat tombol WhatsApp di bawah.</p>
      </div>`;
  }
  return `
    <div class="rounded-xl bg-purple-50 border border-purple-200 p-4 text-sm text-purple-900 text-center space-y-2">
      <p class="font-bold">Scan QRIS untuk membayar ${formatRupiah(order.total)}</p>
      <img src="${esc(qrisImage)}" alt="Kode QRIS Ma’em Eatery" class="mx-auto max-h-64 rounded-lg bg-white p-2 border border-purple-100"
           onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'text-xs text-purple-700',textContent:'Kode QRIS belum tersedia. Hubungi kami lewat WhatsApp.'}))">
      <p class="text-xs text-purple-800">Setelah membayar, kirim bukti lewat tombol WhatsApp di bawah.</p>
    </div>`;
}

function showSuccess(order) {
  els.successId.textContent = order.id;
  els.successBody.innerHTML = `
    <div class="rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
      ${order.lines
        .map(
          (l) => `<div class="px-3 py-2"><div class="flex justify-between gap-3"><span>${l.qty}x ${esc(l.name)}</span><span class="font-semibold">${formatRupiah(l.lineTotal)}</span></div>${
            l.note ? `<p class="text-xs text-gray-500 mt-0.5">Catatan: ${esc(l.note)}</p>` : ''
          }</div>`,
        )
        .join('')}
      ${order.discount > 0 ? `<div class="px-3 py-2 flex justify-between text-green-600"><span>Diskon (${esc(order.couponCode)})</span><span class="font-semibold">-${formatRupiah(order.discount)}</span></div>` : ''}
      <div class="px-3 py-2 flex justify-between font-extrabold"><span>Total</span><span>${formatRupiah(order.total)}</span></div>
    </div>
    ${paymentInstructions(order)}`;

  els.successWa.href = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(whatsappMessage(order))}`;
  openModal(els.success);
}

// ---------- Submit ----------

async function handleSubmit(event) {
  event.preventDefault();
  hide(els.error);

  const name = els.name.value.trim();
  const phone = els.phone.value.trim();
  const type = els.type.value;
  const address = els.address.value.trim();

  if (!isOpen()) return showError(closedMessage());
  if (name.length < 2) return showError('Nama lengkap wajib diisi.');
  const normalized = normalizePhone(phone);
  if (normalized.length < 10 || normalized.length > 15) return showError('Nomor WhatsApp tidak valid.');
  if (type === 'Takeaway' && address.length < 5) return showError('Mohon isi alamat pengiriman untuk tipe order Takeaway.');
  if (getItems().length === 0) return showError('Keranjang menu masih kosong.');

  els.submit.disabled = true;
  els.submit.querySelector('span').textContent = 'Mengirim...';

  try {
    const { order } = await api.createOrder({
      name,
      phone,
      type,
      paymentMethod: selectedPayment(),
      table: els.table.value.trim(),
      address,
      notes: els.notes.value.trim(),
      couponCode: getCoupon()?.code,
      items: getItems().map(({ name: itemName, qty, note }) => ({ name: itemName, qty, note })),
    });

    saveCustomer(name, phone);
    clearCart();
    resetCouponUi();
    els.form.reset();
    closeModal(els.modal);
    showSuccess(order);
  } catch (error) {
    showError(error.message);
    if (/kupon/i.test(error.message)) toast('Kupon tidak bisa dipakai. Hapus kode kupon di keranjang lalu coba lagi.', 'error');
  } finally {
    els.submit.disabled = false;
    els.submit.querySelector('span').textContent = 'Kirim Pesanan';
  }
}

export function initCheckout() {
  els.type.addEventListener('change', syncOrderType);
  els.payment.addEventListener('change', updatePaymentHint);
  els.form.addEventListener('submit', handleSubmit);

  els.successBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      toast('Nomor rekening disalin', 'success');
    } catch {
      toast('Gagal menyalin. Salin manual ya.', 'error');
    }
  });
}
