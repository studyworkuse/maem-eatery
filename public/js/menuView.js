// Tampilan menu pelanggan. Data dari Google Sheets (tab "Kelola Menu"), disinkronkan berkala.
import { api } from './api.js';
import { CONFIG } from './config.js';
import { isOpen } from './storeView.js';
import { $, esc, formatRupiah, hide, imageTag, show, toast } from './utils.js';

const els = {
  grid: $('#menu-grid'),
  categories: $('#category-container'),
  search: $('#search-input'),
  empty: $('#empty-state'),
  loading: $('#menu-loading'),
  error: $('#menu-error'),
  retry: $('#menu-retry'),
};

const CACHE_KEY = 'maem_menu_cache_v1'; // hanya cache tampilan; sumber data tetap Google Sheets

let menu = [];
let activeCategory = 'Semua';
let lastSignature = '';
let reconciled = false; // keranjang disamakan dengan data Sheets minimal sekali per kunjungan
let failures = 0;
let nextPollAt = 0;
let handlers = { onSelect: () => {}, onQuickAdd: () => {}, onUpdate: () => {} };

export const getMenu = () => menu;
export const findMenuItem = (name) => menu.find((m) => m.name === name);

function renderCategories() {
  const names = ['Semua', ...new Set(menu.map((m) => m.category))];
  if (!names.includes(activeCategory)) activeCategory = 'Semua';
  els.categories.innerHTML = names
    .map(
      (name) => `
      <button type="button" role="tab" aria-selected="${name === activeCategory}" data-category="${esc(name)}"
        class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 ${
          name === activeCategory ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
        }">${esc(name)}</button>`,
    )
    .join('');
}

function cardHtml(item) {
  const soldOut = !item.available;
  const closed = !isOpen();
  return `
    <article class="menu-card ${soldOut ? 'is-soldout' : ''} bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between cursor-pointer"
             data-name="${esc(item.name)}" tabindex="0" role="button" aria-label="Lihat detail ${esc(item.name)}">
      <div>
        <div class="relative h-36 sm:h-48 overflow-hidden bg-gray-100">
          ${imageTag(item.image, item.name)}
          <span class="absolute top-2 left-2 sm:top-3 sm:left-3 bg-white/95 text-gray-800 text-[9px] sm:text-[10px] font-extrabold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full uppercase tracking-wider shadow-sm">${esc(item.category)}</span>
          ${soldOut ? '<span class="absolute bottom-2 left-2 bg-red-600 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase">Habis</span>' : ''}
        </div>
        <div class="p-3 sm:p-5">
          <h3 class="font-bold text-gray-900 text-xs sm:text-base mb-1 line-clamp-2">${esc(item.name)}</h3>
          <p class="text-gray-500 text-[11px] sm:text-xs line-clamp-2 leading-relaxed mb-2 sm:mb-3">${esc(item.description) || 'Ketuk untuk melihat detail.'}</p>
        </div>
      </div>
      <div class="px-3 pb-3 sm:px-5 sm:pb-5 pt-0 flex items-center justify-between">
        <span class="font-black text-gray-900 text-xs sm:text-base">${formatRupiah(item.price)}</span>
        <button type="button" data-quick-add="${esc(item.name)}" ${soldOut || closed ? 'disabled' : ''} ${closed ? 'title="Resto sedang tutup"' : ''} aria-label="Tambah ${esc(item.name)} ke keranjang"
          class="bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white p-2 sm:p-2.5 rounded-xl transition duration-200 shadow-md flex items-center justify-center">
          <i class="fa-solid fa-plus text-xs sm:text-sm"></i>
        </button>
      </div>
    </article>`;
}

export function renderMenu() {
  const term = els.search.value.toLowerCase().trim();
  const filtered = menu.filter((item) => {
    const inCategory = activeCategory === 'Semua' || item.category === activeCategory;
    const matches = !term || item.name.toLowerCase().includes(term) || item.description.toLowerCase().includes(term);
    return inCategory && matches;
  });

  els.grid.innerHTML = filtered.map(cardHtml).join('');
  els.empty.classList.toggle('hidden', filtered.length > 0 || menu.length === 0);
}

export async function loadMenu({ silent = false } = {}) {
  try {
    const { items } = await api.getMenu();
    failures = 0;
    hide(els.error);
    hide(els.loading);

    const signature = JSON.stringify(items);
    try {
      localStorage.setItem(CACHE_KEY, signature);
    } catch {
      /* penuh/diblokir: abaikan */
    }
    if (signature === lastSignature) {
      if (!reconciled) {
        reconciled = true;
        handlers.onUpdate(menu);
      }
      return;
    }
    reconciled = true;
    lastSignature = signature;
    menu = items;

    renderCategories();
    renderMenu();
    handlers.onUpdate(menu);
  } catch (error) {
    // Mundur bertahap (15s, 30s, 60s... maks. 2 menit) agar server yang bermasalah tidak dibanjiri.
    failures += 1;
    nextPollAt = Date.now() + Math.min(CONFIG.menuPollMs * 2 ** failures, 120_000);
    hide(els.loading);
    if (menu.length === 0) show(els.error);
    else if (!silent) toast(error.message, 'error');
  }
}

export function initMenuView(options) {
  handlers = { ...handlers, ...options };

  els.search.addEventListener('input', renderMenu);
  els.retry.addEventListener('click', () => {
    hide(els.error);
    show(els.loading);
    loadMenu();
  });

  els.categories.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category;
    renderCategories();
    renderMenu();
  });

  els.grid.addEventListener('click', (event) => {
    const quick = event.target.closest('[data-quick-add]');
    if (quick) {
      event.stopPropagation();
      const item = findMenuItem(quick.dataset.quickAdd);
      if (item) handlers.onQuickAdd(item);
      return;
    }
    const card = event.target.closest('[data-name]');
    const item = card && findMenuItem(card.dataset.name);
    if (item) handlers.onSelect(item);
  });

  els.grid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('[data-quick-add]')) return;
    const card = event.target.closest('[data-name]');
    const item = card && findMenuItem(card.dataset.name);
    if (item) {
      event.preventDefault();
      handlers.onSelect(item);
    }
  });

  // Sinkronisasi antar-perangkat: ambil ulang berkala dan saat tab kembali aktif.
  const poll = () => !document.hidden && Date.now() >= nextPollAt && loadMenu({ silent: true });
  setInterval(poll, CONFIG.menuPollMs);
  document.addEventListener('visibilitychange', poll);

  // Tampilkan menu terakhir yang tersimpan di perangkat ini (jika ada) agar halaman terasa instan,
  // lalu ambil data terbaru dari Sheets.
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (Array.isArray(cached) && cached.length) {
      lastSignature = JSON.stringify(cached);
      menu = cached;
      hide(els.loading);
      renderCategories();
      renderMenu();
    }
  } catch {
    /* cache rusak: abaikan */
  }

  return loadMenu();
}
