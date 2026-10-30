// Modal detail menu: gambar, deskripsi lengkap, catatan opsional, dan tombol tambah.
import { addItem, findItem } from './cart.js';
import { closedMessage, isOpen, onStoreChange } from './storeView.js';
import { $, closeModal, formatRupiah, imageTag, openModal, toast } from './utils.js';

const els = {
  modal: $('#detail-modal'),
  image: $('#detail-image-wrap'),
  category: $('#detail-category'),
  name: $('#detail-name'),
  price: $('#detail-price'),
  desc: $('#detail-desc'),
  note: $('#detail-note'),
  qty: $('#detail-qty'),
  minus: $('#detail-minus'),
  plus: $('#detail-plus'),
  add: $('#detail-add'),
  actions: $('#detail-actions'),
  soldOut: $('#detail-soldout'),
};

let current = null;

function syncClosed() {
  const closed = !isOpen();
  els.add.disabled = closed;
  els.add.classList.toggle('opacity-50', closed);
  els.add.classList.toggle('cursor-not-allowed', closed);
  els.add.title = closed ? closedMessage() : '';
}
let qty = 1;

const setQty = (value) => {
  qty = Math.min(Math.max(value, 1), 99);
  els.qty.textContent = qty;
};

export function openDetail(item) {
  current = item;
  setQty(1);

  els.image.innerHTML = imageTag(item.image, item.name);
  els.category.textContent = item.category;
  els.name.textContent = item.name;
  els.price.textContent = formatRupiah(item.price);
  els.desc.textContent = item.description || 'Belum ada deskripsi untuk menu ini.';
  els.note.value = findItem(item.name)?.note ?? '';

  els.actions.classList.toggle('hidden', !item.available);
  els.soldOut.classList.toggle('hidden', item.available);
  syncClosed();
  openModal(els.modal);
}

export function initDetail() {
  onStoreChange(syncClosed);
  els.minus.addEventListener('click', () => setQty(qty - 1));
  els.plus.addEventListener('click', () => setQty(qty + 1));
  els.add.addEventListener('click', () => {
    if (!current) return;
    if (!isOpen()) return toast(closedMessage(), 'error');
    addItem(current, qty, els.note.value);
    toast(`${qty}x ${current.name} masuk keranjang`, 'success');
    closeModal(els.modal);
  });
}
