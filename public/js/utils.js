// Helper umum untuk DOM, format, dan UI.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape teks sebelum dimasukkan ke innerHTML (cegah XSS dari data Sheets/pelanggan). */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const formatRupiah = (amount) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount || 0);

/** Normalisasi nomor telepon Indonesia ke format 628xxx. */
export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return digits;
}

/** Hitung diskon dari aturan kupon (sama dengan backend; backend tetap penentu akhir). */
export function calcDiscount(coupon, subtotal) {
  if (!coupon || subtotal < coupon.minPurchase) return 0;
  let discount = Math.floor(subtotal * coupon.percent);
  if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  return Math.max(0, Math.min(discount, subtotal));
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export const show = (el) => el.classList.remove('hidden');
export const hide = (el) => el.classList.add('hidden');

let openModals = 0;
export function openModal(el) {
  if (!el.classList.contains('hidden')) return;
  show(el);
  openModals += 1;
  document.body.classList.add('modal-open');
}
export function closeModal(el) {
  if (el.classList.contains('hidden')) return;
  hide(el);
  openModals = Math.max(0, openModals - 1);
  if (openModals === 0) document.body.classList.remove('modal-open');
}

export function toast(message, type = 'info') {
  const container = $('#toast-container');
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : ''}`;
  node.textContent = message;
  container.appendChild(node);
  setTimeout(() => node.remove(), 3500);
}

/** Placeholder bila gambar kosong / gagal dimuat. */
export const imagePlaceholder = (extra = '') =>
  `<div class="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300 ${extra}"><i class="fa-solid fa-utensils text-4xl"></i></div>`;

export function imageTag(src, alt, className = 'w-full h-full object-cover') {
  if (!src) return imagePlaceholder();
  return `<img src="${esc(src)}" alt="${esc(alt)}" class="${className}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback>`;
}

/** Ganti <img data-fallback> yang gagal dimuat dengan placeholder. */
export function installImageFallback() {
  document.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-fallback')) return;
      img.insertAdjacentHTML('afterend', imagePlaceholder());
      img.remove();
    },
    true,
  );
}
