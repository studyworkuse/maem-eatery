// Titik masuk aplikasi: merangkai modul-modul.
import { initAdmin } from './admin.js';
import { addItem, reconcile } from './cart.js';
import { initCartView, openCart } from './cartView.js';
import { initCheckout, openCheckout } from './checkout.js';
import { initDetail, openDetail } from './detail.js';
import { initMenuView, loadMenu, renderMenu } from './menuView.js';
import { initStoreView, onStoreChange } from './storeView.js';
import { $, $$, closeModal, installImageFallback, toast } from './utils.js';

installImageFallback();

// Tombol tutup & klik latar untuk semua modal.
$$('[data-close]').forEach((btn) => btn.addEventListener('click', () => closeModal($(`#${btn.dataset.close}`))));
$$('.modal').forEach((modal) =>
  modal.addEventListener('mousedown', (event) => {
    if (event.target === modal) closeModal(modal);
  }),
);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  $$('.modal:not(.hidden)').forEach(closeModal);
});

onStoreChange(renderMenu); // tombol + di kartu menu ikut terkunci saat tutup
initStoreView();
initDetail();
initCheckout();
initCartView({ onCheckout: openCheckout });
initAdmin({ onMenuUpdated: () => loadMenu({ silent: true }) });

initMenuView({
  onSelect: openDetail,
  onQuickAdd: (item) => {
    addItem(item, 1);
    toast(`${item.name} masuk keranjang`, 'success');
  },
  onUpdate: (menu) => {
    // Menu berubah di Sheets: samakan harga/ketersediaan di keranjang.
    const removed = reconcile(menu);
    if (removed.length) {
      toast(`Dikeluarkan dari keranjang (habis/dihapus): ${removed.join(', ')}`, 'error');
      openCart();
    }
  },
});
