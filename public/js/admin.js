// Dashboard admin: pesanan, menu, dan kode kupon. Semua data dibaca/ditulis ke Google Sheets.
import { api, hasAdminToken, setAdminToken } from './api.js';
import { CONFIG } from './config.js';
import { applySettings } from './storeView.js';
import { $, $$, esc, formatRupiah, hide, imageTag, openModal, show, toast } from './utils.js';

const ORDER_STATUSES = ['Ordered', 'Waiting for Payment', 'Processed', 'Done'];

const els = {
  modal: $('#admin-modal'),
  openBtn: $('#admin-link-btn'),
  logout: $('#admin-logout'),
  auth: $('#admin-auth'),
  pin: $('#admin-pin-input'),
  pinSubmit: $('#submit-pin'),
  pinError: $('#pin-error'),
  dashboard: $('#admin-dashboard'),
  tabs: $$('[data-admin-tab]'),
  sections: { orders: $('#tab-orders'), menu: $('#tab-menu'), coupons: $('#tab-coupons'), settings: $('#tab-settings') },
  settingsForm: $('#settings-form'),
  settingsSubmit: $('#settings-submit'),
  settingsStatus: $('#settings-live-status'),
  modeOptions: $('#mode-options'),
  hoursEditor: $('#hours-editor'),
  announcement: $('#settings-announcement'),
  closedMessage: $('#settings-closed-message'),
  ordersBody: $('#orders-table-body'),
  clearOrders: $('#clear-orders'),
  menuForm: $('#menu-form'),
  menuFormTitle: $('#menu-form-title'),
  menuFormCancel: $('#menu-form-cancel'),
  menuFormSubmit: $('#menu-form-submit'),
  menuBody: $('#admin-menu-table-body'),
  categoryList: $('#menu-category-list'),
  couponForm: $('#coupon-form'),
  couponFormTitle: $('#coupon-form-title'),
  couponFormCancel: $('#coupon-form-cancel'),
  couponFormSubmit: $('#coupon-form-submit'),
  couponBody: $('#admin-coupon-table-body'),
};

const state = {
  tab: 'orders',
  orders: [],
  menu: [],
  coupons: [],
  editingMenu: null, // { row, name }
  editingCoupon: null, // { row, code }
  signatures: { orders: '', menu: '', coupons: '', settings: '' },
};

let pollTimer = null;
let onMenuChanged = () => {};

// ---------- Util ----------

const percentLabel = (fraction) => `${Math.round(fraction * 1000) / 10}%`;

const formatDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

/** Jalankan aksi admin dengan penanganan error & sesi berakhir yang seragam. */
async function guarded(action, { successMessage, silent = false } = {}) {
  try {
    const result = await action();
    if (successMessage) toast(successMessage, 'success');
    return result;
  } catch (error) {
    if (error.status === 401) {
      showLogin();
      toast(error.message, 'error');
    } else if (!silent) {
      toast(error.message, 'error');
    }
    return undefined;
  }
}

// ---------- Sesi ----------

function showLogin() {
  stopPolling();
  show(els.auth);
  hide(els.dashboard);
  hide(els.logout);
  els.pin.value = '';
  hide(els.pinError);
}

function showDashboard() {
  hide(els.auth);
  show(els.dashboard);
  show(els.logout);
  switchTab(state.tab);
  startPolling();
}

async function handleLogin(event) {
  event.preventDefault();
  hide(els.pinError);
  els.pinSubmit.disabled = true;
  try {
    const { token } = await api.login(els.pin.value);
    setAdminToken(token);
    showDashboard();
  } catch (error) {
    els.pinError.textContent = error.message;
    show(els.pinError);
  } finally {
    els.pinSubmit.disabled = false;
    els.pin.value = '';
  }
}

function logout() {
  setAdminToken(null);
  showLogin();
}

// ---------- Tab & polling ----------

function switchTab(tab) {
  state.tab = tab;
  els.tabs.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.adminTab === tab));
  Object.entries(els.sections).forEach(([name, section]) => section.classList.toggle('hidden', name !== tab));
  loadTab(tab);
}

const loaders = { orders: loadOrders, menu: loadMenu, coupons: loadCoupons, settings: loadSettings };
const loadTab = (tab, options) => guarded(() => loaders[tab](), options);

function startPolling() {
  stopPolling();
  // Sinkronisasi pesanan antar-perangkat selama dashboard terbuka.
  // Polling senyap: gangguan sementara tidak memunculkan toast berulang.
  pollTimer = setInterval(() => {
    if (!document.hidden && state.tab === 'orders') loadTab('orders', { silent: true });
  }, CONFIG.adminPollMs);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

// ---------- Pesanan ----------

async function loadOrders() {
  const { items } = await api.getOrders();
  const signature = JSON.stringify(items);
  if (signature === state.signatures.orders) return;
  state.signatures.orders = signature;
  state.orders = items;
  renderOrders();
}

function renderOrders() {
  if (state.orders.length === 0) {
    els.ordersBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Belum ada pesanan masuk.</td></tr>';
    return;
  }
  els.ordersBody.innerHTML = state.orders
    .map(
      (o) => `
      <tr data-row="${o.row}" data-id="${esc(o.id)}">
        <td class="p-3 align-top"><div class="font-bold text-gray-900">${esc(o.id)}</div><div class="text-[10px] text-gray-400">${esc(o.time)}</div></td>
        <td class="p-3 align-top">
          <div class="font-semibold">${esc(o.customerName)}</div>
          <a class="text-xs text-green-700 hover:underline" target="_blank" rel="noopener" href="https://wa.me/${esc(o.phone)}">${esc(o.phone)}</a>
          <details class="mt-1 text-xs text-gray-600">
            <summary class="cursor-pointer text-gray-500 hover:text-gray-900">Lihat pesanan</summary>
            <pre class="whitespace-pre-wrap font-sans mt-1">${esc(o.itemsText)}</pre>
            <p class="mt-1"><strong>${o.type === 'Takeaway' ? 'Alamat' : 'Meja'}:</strong> ${esc(o.destination)}</p>
            ${o.coupon ? `<p><strong>Kupon:</strong> ${esc(o.coupon)} (-${formatRupiah(o.discount)})</p>` : ''}
            ${o.notes ? `<p><strong>Catatan:</strong> ${esc(o.notes)}</p>` : ''}
          </details>
        </td>
        <td class="p-3 align-top">
          <span class="px-2 py-1 rounded text-[10px] font-bold ${o.type === 'Dine-in' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}">${esc(o.type)}</span>
          <div class="text-[11px] text-gray-500 mt-1 font-semibold">${esc(o.paymentMethod) || '-'}</div>
        </td>
        <td class="p-3 align-top font-bold">${formatRupiah(o.total)}</td>
        <td class="p-3 align-top">
          <select data-status class="text-xs border border-gray-300 rounded px-2 py-1 bg-white font-semibold focus:outline-none">
            ${ORDER_STATUSES.map((s) => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td class="p-3 align-top text-right"><button type="button" data-delete aria-label="Hapus pesanan" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`,
    )
    .join('');
}

async function handleOrderChange(event) {
  const select = event.target.closest('[data-status]');
  if (!select) return;
  const row = select.closest('tr');
  await guarded(() => api.updateOrderStatus(Number(row.dataset.row), row.dataset.id, select.value), { successMessage: 'Status diperbarui' });
  state.signatures.orders = '';
  loadTab('orders');
}

async function handleOrderClick(event) {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  const row = button.closest('tr');
  if (!confirm(`Hapus transaksi ${row.dataset.id} dari daftar?`)) return;
  await guarded(() => api.deleteOrder(Number(row.dataset.row), row.dataset.id), { successMessage: 'Pesanan dihapus' });
  state.signatures.orders = '';
  loadTab('orders');
}

async function handleClearOrders() {
  if (!confirm('Apakah Anda yakin ingin menghapus SELURUH riwayat pesanan? Data di spreadsheet ikut terhapus.')) return;
  await guarded(() => api.clearOrders(), { successMessage: 'Seluruh riwayat dihapus' });
  state.signatures.orders = '';
  loadTab('orders');
}

// ---------- Menu ----------

async function loadMenu() {
  const { items } = await api.getAdminMenu();
  const signature = JSON.stringify(items);
  if (signature === state.signatures.menu) return;
  state.signatures.menu = signature;
  state.menu = items;
  renderMenuAdmin();
}

function renderMenuAdmin() {
  els.categoryList.innerHTML = [...new Set(state.menu.map((m) => m.category))].map((c) => `<option value="${esc(c)}">`).join('');
  els.menuBody.innerHTML = state.menu.length
    ? state.menu
        .map(
          (m) => `
      <tr data-row="${m.row}" data-name="${esc(m.name)}">
        <td class="p-3"><div class="w-10 h-10 rounded-lg overflow-hidden">${imageTag(m.image, m.name)}</div></td>
        <td class="p-3 font-bold text-gray-900">${esc(m.name)}</td>
        <td class="p-3">${esc(m.category)}</td>
        <td class="p-3 font-semibold">${formatRupiah(m.price)}</td>
        <td class="p-3"><span class="px-2 py-1 rounded-full text-[10px] font-bold ${m.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}">${m.available ? 'available' : 'out of stock'}</span></td>
        <td class="p-3 text-right whitespace-nowrap">
          <button type="button" data-edit aria-label="Edit ${esc(m.name)}" class="text-gray-500 hover:text-gray-900 p-1"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-delete aria-label="Hapus ${esc(m.name)}" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="p-4 text-center text-gray-500">Belum ada menu.</td></tr>';
}

function resetMenuForm() {
  state.editingMenu = null;
  els.menuForm.reset();
  els.menuFormTitle.textContent = 'Tambah Item Menu';
  els.menuFormSubmit.textContent = 'Simpan Menu';
  hide(els.menuFormCancel);
}

function startEditMenu(item) {
  state.editingMenu = { row: item.row, name: item.name };
  $('#menu-name').value = item.name;
  $('#menu-price').value = item.price;
  $('#menu-category').value = item.category;
  $('#menu-status').value = item.available ? 'available' : 'out of stock';
  $('#menu-image').value = item.image;
  $('#menu-desc').value = item.description;
  els.menuFormTitle.textContent = `Edit Menu: ${item.name}`;
  els.menuFormSubmit.textContent = 'Perbarui Menu';
  show(els.menuFormCancel);
  els.menuForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function handleMenuSubmit(event) {
  event.preventDefault();
  const payload = {
    name: $('#menu-name').value,
    price: $('#menu-price').value,
    category: $('#menu-category').value,
    image: $('#menu-image').value,
    description: $('#menu-desc').value,
    available: $('#menu-status').value === 'available',
  };
  const editing = state.editingMenu;

  els.menuFormSubmit.disabled = true;
  const result = await guarded(
    () => (editing ? api.updateMenu({ ...payload, row: editing.row, expectedName: editing.name }) : api.createMenu(payload)),
    { successMessage: editing ? 'Menu diperbarui' : 'Menu ditambahkan' },
  );
  els.menuFormSubmit.disabled = false;

  if (result) {
    resetMenuForm();
    state.signatures.menu = '';
    await loadTab('menu');
    onMenuChanged();
  }
}

async function handleMenuClick(event) {
  const row = event.target.closest('tr[data-row]');
  if (!row) return;
  const item = state.menu.find((m) => m.row === Number(row.dataset.row));
  if (event.target.closest('[data-edit]') && item) return startEditMenu(item);

  if (event.target.closest('[data-delete]')) {
    if (!confirm(`Hapus "${row.dataset.name}" dari katalog? Baris di spreadsheet ikut terhapus.`)) return;
    const result = await guarded(() => api.deleteMenu(Number(row.dataset.row), row.dataset.name), { successMessage: 'Menu dihapus' });
    if (result) {
      if (state.editingMenu?.row === Number(row.dataset.row)) resetMenuForm();
      state.signatures.menu = '';
      await loadTab('menu');
      onMenuChanged();
    }
  }
}

// ---------- Kupon ----------

async function loadCoupons() {
  const { items } = await api.getCoupons();
  const signature = JSON.stringify(items);
  if (signature === state.signatures.coupons) return;
  state.signatures.coupons = signature;
  state.coupons = items;
  renderCoupons();
}

function renderCoupons() {
  const today = todayIso();
  els.couponBody.innerHTML = state.coupons.length
    ? state.coupons
        .map((c) => {
          const expired = c.expires && c.expires < today;
          const full = c.limit > 0 && c.usedBy.length >= c.limit;
          return `
      <tr data-row="${c.row}" data-code="${esc(c.code)}">
        <td class="p-3 align-top font-bold text-gray-900">${esc(c.code)}
          ${expired ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">Expired</span>' : ''}
          ${full && !expired ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Habis</span>' : ''}
        </td>
        <td class="p-3 align-top font-semibold">${percentLabel(c.percent)}</td>
        <td class="p-3 align-top text-xs">Min ${formatRupiah(c.minPurchase)}<br>Maks ${c.maxDiscount > 0 ? formatRupiah(c.maxDiscount) : 'tanpa batas'}</td>
        <td class="p-3 align-top">${formatDate(c.expires)}</td>
        <td class="p-3 align-top">
          <span class="font-semibold">${c.usedBy.length} / ${c.limit > 0 ? c.limit : '∞'}</span>
          ${c.usedBy.length ? `<details class="text-xs text-gray-600 mt-1"><summary class="cursor-pointer text-gray-500">Pemakai</summary><ul class="list-disc ml-4">${c.usedBy.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></details>` : ''}
        </td>
        <td class="p-3 align-top text-right whitespace-nowrap">
          <button type="button" data-edit aria-label="Edit ${esc(c.code)}" class="text-gray-500 hover:text-gray-900 p-1"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-reset aria-label="Reset pemakaian ${esc(c.code)}" title="Reset pemakaian" class="text-amber-600 hover:text-amber-800 p-1"><i class="fa-solid fa-rotate-left"></i></button>
          <button type="button" data-delete aria-label="Hapus ${esc(c.code)}" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="p-4 text-center text-gray-500">Belum ada kode kupon.</td></tr>';
}

function resetCouponForm() {
  state.editingCoupon = null;
  els.couponForm.reset();
  els.couponFormTitle.textContent = 'Tambah Kode Kupon';
  els.couponFormSubmit.textContent = 'Simpan Kupon';
  hide(els.couponFormCancel);
}

function startEditCoupon(coupon) {
  state.editingCoupon = { row: coupon.row, code: coupon.code };
  $('#coupon-code').value = coupon.code;
  $('#coupon-percent').value = Math.round(coupon.percent * 1000) / 10;
  $('#coupon-min').value = coupon.minPurchase;
  $('#coupon-max').value = coupon.maxDiscount;
  $('#coupon-expires').value = coupon.expires;
  $('#coupon-limit').value = coupon.limit;
  els.couponFormTitle.textContent = `Edit Kupon: ${coupon.code}`;
  els.couponFormSubmit.textContent = 'Perbarui Kupon';
  show(els.couponFormCancel);
  els.couponForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function handleCouponSubmit(event) {
  event.preventDefault();
  const payload = {
    code: $('#coupon-code').value,
    percent: $('#coupon-percent').value,
    minPurchase: $('#coupon-min').value || 0,
    maxDiscount: $('#coupon-max').value || 0,
    expires: $('#coupon-expires').value,
    limit: $('#coupon-limit').value || 0,
  };
  const editing = state.editingCoupon;

  els.couponFormSubmit.disabled = true;
  const result = await guarded(
    () => (editing ? api.updateCoupon({ ...payload, row: editing.row, expectedCode: editing.code }) : api.createCoupon(payload)),
    { successMessage: editing ? 'Kupon diperbarui' : 'Kupon ditambahkan' },
  );
  els.couponFormSubmit.disabled = false;

  if (result) {
    resetCouponForm();
    state.signatures.coupons = '';
    loadTab('coupons');
  }
}

async function handleCouponClick(event) {
  const row = event.target.closest('tr[data-row]');
  if (!row) return;
  const coupon = state.coupons.find((c) => c.row === Number(row.dataset.row));
  const rowNumber = Number(row.dataset.row);
  const code = row.dataset.code;

  if (event.target.closest('[data-edit]') && coupon) return startEditCoupon(coupon);

  let result;
  if (event.target.closest('[data-reset]')) {
    if (!confirm(`Reset daftar pemakai kupon ${code}? Kuota pemakaian akan kembali penuh.`)) return;
    result = await guarded(() => api.resetCouponUsage(rowNumber, code), { successMessage: 'Pemakaian kupon direset' });
  } else if (event.target.closest('[data-delete]')) {
    if (!confirm(`Hapus kupon ${code}? Baris di spreadsheet ikut terhapus.`)) return;
    result = await guarded(() => api.deleteCoupon(rowNumber, code), { successMessage: 'Kupon dihapus' });
    if (result && state.editingCoupon?.row === rowNumber) resetCouponForm();
  } else {
    return;
  }
  if (result) {
    state.signatures.coupons = '';
    loadTab('coupons');
  }
}

// ---------- Jam & Pengumuman ----------

const DAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
const DAY_LABELS = { senin: 'Senin', selasa: 'Selasa', rabu: 'Rabu', kamis: 'Kamis', jumat: 'Jumat', sabtu: 'Sabtu', minggu: 'Minggu' };
const MODE_OPTIONS = [
  { value: 'auto', title: 'Otomatis', hint: 'Ikuti jadwal mingguan' },
  { value: 'open', title: 'Paksa Buka', hint: 'Abaikan jadwal, terima pesanan' },
  { value: 'closed', title: 'Paksa Tutup', hint: 'Libur / darurat, tolak pesanan' },
];

const timePart = (range, index) => (range === 'tutup' ? '' : range.split('-')[index]);

function renderSettingsForm({ settings, status }) {
  els.modeOptions.innerHTML = MODE_OPTIONS.map(
    (m) => `
    <label class="pay-option relative">
      <input type="radio" name="store-mode" value="${m.value}" ${settings.mode === m.value ? 'checked' : ''}>
      <span class="text-center"><strong class="block text-sm">${m.title}</strong><small class="block text-[11px] font-medium opacity-70">${m.hint}</small></span>
    </label>`,
  ).join('');

  els.hoursEditor.innerHTML = DAYS.map((day) => {
    const range = settings.hours[day];
    const closed = range === 'tutup';
    return `
    <div class="flex items-center gap-2 flex-wrap" data-day="${day}">
      <span class="w-16 text-sm font-semibold text-gray-700">${DAY_LABELS[day]}</span>
      <input type="time" data-open value="${timePart(range, 0)}" ${closed ? 'disabled' : ''} class="field-input !w-auto" aria-label="Jam buka ${DAY_LABELS[day]}">
      <span class="text-gray-400">–</span>
      <input type="time" data-close value="${timePart(range, 1)}" ${closed ? 'disabled' : ''} class="field-input !w-auto" aria-label="Jam tutup ${DAY_LABELS[day]}">
      <label class="flex items-center gap-1.5 text-xs font-semibold text-gray-600 ml-auto">
        <input type="checkbox" data-off ${closed ? 'checked' : ''}> Libur
      </label>
    </div>`;
  }).join('');

  els.announcement.value = settings.announcement;
  els.closedMessage.value = settings.closedMessage;
  els.settingsStatus.textContent = `Saat ini: ${status.label}`;
}

async function loadSettings() {
  const data = await api.getSettingsFresh();
  const signature = JSON.stringify(data);
  if (signature === state.signatures.settings) return;
  // Jangan timpa isian yang sedang diketik admin.
  if (state.signatures.settings && els.settingsForm.contains(document.activeElement)) return;
  state.signatures.settings = signature;
  renderSettingsForm(data);
}

function readSettingsForm() {
  const hours = {};
  $$('[data-day]', els.hoursEditor).forEach((row) => {
    const off = $('[data-off]', row).checked;
    const open = $('[data-open]', row).value;
    const close = $('[data-close]', row).value;
    hours[row.dataset.day] = off ? 'tutup' : open && close ? `${open}-${close}` : '';
  });
  return {
    mode: $('input[name="store-mode"]:checked', els.modeOptions)?.value ?? 'auto',
    hours,
    announcement: els.announcement.value.trim(),
    closedMessage: els.closedMessage.value.trim(),
  };
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  els.settingsSubmit.disabled = true;
  const result = await guarded(() => api.updateSettings(readSettingsForm()), { successMessage: 'Pengaturan disimpan' });
  els.settingsSubmit.disabled = false;
  if (result) {
    const data = await api.getSettingsFresh().catch(() => null);
    if (data) {
      state.signatures.settings = JSON.stringify(data);
      renderSettingsForm(data);
      applySettings(data); // tampilan pelanggan langsung ikut berubah di perangkat ini
    }
  }
}

function handleHoursToggle(event) {
  if (!event.target.matches('[data-off]')) return;
  const row = event.target.closest('[data-day]');
  const off = event.target.checked;
  $$('input[type="time"]', row).forEach((input) => {
    input.disabled = off;
    if (!off && !input.value) input.value = input.hasAttribute('data-open') ? '09:00' : '21:00';
  });
}

// ---------- Init ----------

export function initAdmin({ onMenuUpdated } = {}) {
  onMenuChanged = onMenuUpdated ?? onMenuChanged;

  els.openBtn.addEventListener('click', () => {
    openModal(els.modal);
    if (hasAdminToken()) showDashboard();
    else {
      showLogin();
      els.pin.focus();
    }
  });

  // Hentikan polling saat modal ditutup (tombol X, Escape, atau klik latar).
  new MutationObserver(() => els.modal.classList.contains('hidden') && stopPolling()).observe(els.modal, { attributes: true, attributeFilter: ['class'] });

  els.auth.addEventListener('submit', handleLogin);
  els.logout.addEventListener('click', logout);
  els.tabs.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.adminTab)));

  els.ordersBody.addEventListener('change', handleOrderChange);
  els.ordersBody.addEventListener('click', handleOrderClick);
  els.clearOrders.addEventListener('click', handleClearOrders);

  els.menuForm.addEventListener('submit', handleMenuSubmit);
  els.menuFormCancel.addEventListener('click', resetMenuForm);
  els.menuBody.addEventListener('click', handleMenuClick);

  els.couponForm.addEventListener('submit', handleCouponSubmit);
  els.couponFormCancel.addEventListener('click', resetCouponForm);
  els.couponBody.addEventListener('click', handleCouponClick);

  els.settingsForm.addEventListener('submit', handleSettingsSubmit);
  els.hoursEditor.addEventListener('change', handleHoursToggle);
}
