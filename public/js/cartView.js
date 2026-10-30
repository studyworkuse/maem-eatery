// Panel "Keranjang Menu": daftar menu + catatan per menu, kupon, dan ringkasan total.
import { api } from './api.js';
import { changeQty, count, discount, getCoupon, getItems, onCartChange, removeItem, setCoupon, setNote, subtotal, total } from './cart.js';
import { closedMessage, isOpen, onStoreChange } from './storeView.js';
import { $, esc, formatRupiah, hide, imageTag, show, toast } from './utils.js';

const els = {
  btn: $('#cart-btn'),
  badge: $('#cart-badge'),
  drawer: $('#cart-drawer'),
  panel: $('#cart-panel'),
  backdrop: $('#cart-backdrop'),
  close: $('#close-cart'),
  items: $('#cart-items-container'),
  subtotal: $('#cart-subtotal'),
  discount: $('#cart-discount'),
  discountRow: $('#discount-row'),
  total: $('#cart-total'),
  couponInput: $('#coupon-input'),
  couponBtn: $('#apply-coupon-btn'),
  couponMessage: $('#coupon-message'),
  checkout: $('#checkout-btn'),
  closedNote: $('#cart-closed-note'),
};

let couponNotice = null; // { text, tone }

function showCouponMessage(text, tone = 'ok') {
  couponNotice = text ? { text, tone } : null;
  if (!text) {
    hide(els.couponMessage);
    return;
  }
  els.couponMessage.textContent = text;
  els.couponMessage.className = `text-xs mt-1 font-semibold ${tone === 'ok' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600' : 'text-red-500'}`;
  show(els.couponMessage);
}

function itemHtml(item) {
  return `
    <div class="bg-gray-50 p-3.5 rounded-2xl border border-gray-100" data-item="${esc(item.name)}">
      <div class="flex items-start">
        <div class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">${imageTag(item.image, item.name)}</div>
        <div class="ml-3 flex-grow min-w-0">
          <h4 class="text-xs font-bold text-gray-900 line-clamp-2">${esc(item.name)}</h4>
          <p class="text-xs font-extrabold text-gray-700 mt-0.5">${formatRupiah(item.price)}</p>
          <div class="flex items-center space-x-2 mt-2">
            <button type="button" data-action="dec" aria-label="Kurangi" class="w-6 h-6 rounded-md bg-white border border-gray-300 flex items-center justify-center text-xs font-bold hover:bg-gray-100">-</button>
            <span class="text-xs font-bold w-5 text-center">${item.qty}</span>
            <button type="button" data-action="inc" aria-label="Tambah" class="w-6 h-6 rounded-md bg-white border border-gray-300 flex items-center justify-center text-xs font-bold hover:bg-gray-100">+</button>
            <span class="text-xs text-gray-500 ml-auto font-semibold">${formatRupiah(item.price * item.qty)}</span>
          </div>
        </div>
        <button type="button" data-action="remove" aria-label="Hapus ${esc(item.name)}" class="text-gray-400 hover:text-red-500 p-2 transition">
          <i class="fa-solid fa-trash-can text-sm"></i>
        </button>
      </div>
      <textarea data-note rows="1" maxlength="150" placeholder="Catatan untuk menu ini (opsional)"
        class="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">${esc(item.note)}</textarea>
    </div>`;
}

export function renderCart() {
  const items = getItems();
  els.badge.textContent = count();

  if (items.length === 0) {
    els.items.innerHTML = `
      <div class="text-center py-12">
        <i class="fa-solid fa-cart-flatbed text-4xl text-gray-300 mb-3"></i>
        <p class="text-sm font-semibold text-gray-500">Keranjang menu masih kosong</p>
      </div>`;
  } else {
    els.items.innerHTML = items.map(itemHtml).join('');
  }

  const coupon = getCoupon();
  const off = discount();
  if (coupon && off === 0 && subtotal() > 0) {
    showCouponMessage(`Kupon ${coupon.code} butuh minimal belanja ${formatRupiah(coupon.minPurchase)}.`, 'warn');
  } else if (coupon && couponNotice?.tone === 'warn') {
    showCouponMessage(`Kupon ${coupon.code} aktif.`, 'ok');
  }
  if (!coupon && couponNotice?.tone !== 'error') showCouponMessage('');

  els.subtotal.textContent = formatRupiah(subtotal());
  els.discountRow.classList.toggle('hidden', off === 0);
  els.discount.textContent = `-${formatRupiah(off)}`;
  els.total.textContent = formatRupiah(total());

  const closed = !isOpen();
  els.checkout.disabled = closed;
  els.checkout.classList.toggle('opacity-50', closed);
  els.checkout.classList.toggle('cursor-not-allowed', closed);
  els.closedNote.classList.toggle('hidden', !closed);
  els.closedNote.textContent = closed ? closedMessage() : '';
}

export function openCart() {
  els.drawer.classList.remove('pointer-events-none');
  els.drawer.setAttribute('aria-hidden', 'false');
  els.backdrop.classList.remove('opacity-0', 'pointer-events-none');
  els.panel.classList.remove('translate-x-full');
}

export function closeCart() {
  els.panel.classList.add('translate-x-full');
  els.backdrop.classList.add('opacity-0', 'pointer-events-none');
  els.drawer.setAttribute('aria-hidden', 'true');
  setTimeout(() => els.drawer.classList.add('pointer-events-none'), 300);
}

async function applyCoupon() {
  const code = els.couponInput.value.trim().toUpperCase();
  if (!code) return showCouponMessage('Masukkan kode kupon terlebih dahulu.', 'error');
  if (getItems().length === 0) return showCouponMessage('Tambahkan menu ke keranjang dulu.', 'error');

  els.couponBtn.disabled = true;
  try {
    const result = await api.validateCoupon({ code, subtotal: subtotal() });
    if (result.valid) {
      setCoupon({ code: result.code, percent: result.percent, minPurchase: result.minPurchase, maxDiscount: result.maxDiscount });
      showCouponMessage(result.message, 'ok');
    } else {
      setCoupon(null);
      showCouponMessage(result.message, 'error');
    }
  } catch (error) {
    showCouponMessage(error.message, 'error');
  } finally {
    els.couponBtn.disabled = false;
  }
}

export function resetCouponUi() {
  els.couponInput.value = '';
  showCouponMessage('');
}

export function initCartView({ onCheckout }) {
  onCartChange(renderCart);
  onStoreChange(renderCart);
  renderCart();

  els.btn.addEventListener('click', openCart);
  els.close.addEventListener('click', closeCart);
  els.backdrop.addEventListener('click', closeCart);
  els.couponBtn.addEventListener('click', applyCoupon);
  els.couponInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') applyCoupon();
  });

  els.items.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    const row = event.target.closest('[data-item]');
    if (!button || !row) return;
    const name = row.dataset.item;
    if (button.dataset.action === 'inc') changeQty(name, 1);
    if (button.dataset.action === 'dec') changeQty(name, -1);
    if (button.dataset.action === 'remove') removeItem(name);
  });

  els.items.addEventListener('input', (event) => {
    if (!event.target.matches('[data-note]')) return;
    setNote(event.target.closest('[data-item]').dataset.item, event.target.value);
  });

  els.checkout.addEventListener('click', () => {
    if (!isOpen()) return toast(closedMessage(), 'error');
    if (getItems().length === 0) return toast('Keranjang menu Anda masih kosong.', 'error');
    closeCart();
    onCheckout();
  });

  document.addEventListener('keydown', (event) => event.key === 'Escape' && closeCart());
}
