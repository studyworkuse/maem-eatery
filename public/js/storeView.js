// Status buka/tutup, papan pengumuman, jam operasional, dan tautan sosial di header.
// Sumber data: tab "Pengaturan" di Google Sheets lewat /api/settings. Server tetap penentu akhir
// (pesanan ditolak saat tutup); tampilan ini hanya memberi tahu pelanggan lebih awal.
import { api } from './api.js';
import { CONFIG } from './config.js';
import { $, esc, openModal } from './utils.js';

const DAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
const DAY_LABELS = { senin: 'Senin', selasa: 'Selasa', rabu: 'Rabu', kamis: 'Kamis', jumat: 'Jumat', sabtu: 'Sabtu', minggu: 'Minggu' };

const els = {
  pill: $('#store-pill'),
  dot: $('#store-dot'),
  pillText: $('#store-pill-text'),
  board: $('#notice-board'),
  closedBanner: $('#closed-banner'),
  closedMessage: $('#closed-message'),
  closedNext: $('#closed-next'),
  announcement: $('#announcement-board'),
  announcementText: $('#announcement-text'),
  hoursModal: $('#hours-modal'),
  hoursStatus: $('#hours-status'),
  hoursList: $('#hours-list'),
  ig: $('#social-ig'),
  wa: $('#social-wa'),
};

let settings = null;
let status = null;
let signature = '';
const listeners = new Set();

/** Selama status belum diketahui (loading / gagal), pesan tetap dicoba; server yang menolak jika tutup. */
export const isOpen = () => status?.open !== false;
export const getSettings = () => settings;
export const getStatus = () => status;
export const closedMessage = () => settings?.closedMessage || 'Maaf, kami sedang tutup.';
export const onStoreChange = (fn) => listeners.add(fn);

function nextOpenText() {
  const next = status?.nextOpen;
  if (!next) return status?.source === 'manual' ? '' : 'Jadwal buka berikutnya belum diatur.';
  if (next.today) return `Buka kembali hari ini pukul ${next.time} WIB.`;
  if (next.tomorrow) return `Buka kembali besok pukul ${next.time} WIB.`;
  return `Buka kembali ${next.dayLabel} pukul ${next.time} WIB.`;
}

function renderStatus() {
  if (!status) return;
  const open = status.open;
  els.pillText.textContent = status.label;
  els.pill.className = `inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold transition ${
    open ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
  }`;
  els.dot.className = `w-2 h-2 rounded-full ${open ? 'bg-green-500' : 'bg-red-500'}`;

  const hasAnnouncement = Boolean(settings.announcement);
  els.closedBanner.classList.toggle('hidden', open);
  els.announcement.classList.toggle('hidden', !hasAnnouncement);
  els.board.classList.toggle('hidden', open && !hasAnnouncement);

  if (!open) {
    els.closedMessage.textContent = settings.closedMessage;
    els.closedNext.textContent = nextOpenText();
  }
  if (hasAnnouncement) els.announcementText.textContent = settings.announcement;
}

function renderHours() {
  if (!settings || !status) return;
  els.hoursStatus.textContent = status.label;
  els.hoursStatus.className = `text-sm font-bold mt-3 ${status.open ? 'text-green-600' : 'text-red-600'}`;
  const todayIndex = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(new Date()).toLowerCase();
  const map = { monday: 'senin', tuesday: 'selasa', wednesday: 'rabu', thursday: 'kamis', friday: 'jumat', saturday: 'sabtu', sunday: 'minggu' };
  const today = map[todayIndex];
  els.hoursList.innerHTML = DAYS.map((day) => {
    const value = settings.hours[day];
    const isToday = day === today;
    return `<li class="flex justify-between py-2 ${isToday ? 'font-extrabold text-gray-900' : 'text-gray-600'}">
      <span>${DAY_LABELS[day]}${isToday ? ' <span class="text-[10px] font-bold bg-gray-900 text-white rounded-full px-1.5 py-0.5 ml-1 align-middle">Hari ini</span>' : ''}</span>
      <span class="${value === 'tutup' ? 'text-red-500' : ''}">${value === 'tutup' ? 'Tutup' : esc(value.replace('-', ' – '))}</span>
    </li>`;
  }).join('');
}

/** Terapkan data dari server. Mengembalikan true jika ada yang berubah. */
export function applySettings(data) {
  const next = JSON.stringify(data);
  if (next === signature) return false;
  signature = next;
  settings = data.settings;
  status = data.status;
  renderStatus();
  renderHours();
  listeners.forEach((fn) => fn());
  return true;
}

export async function loadSettings() {
  try {
    applySettings(await api.getSettings());
  } catch {
    /* gagal sementara: pertahankan tampilan terakhir */
  }
}

export function initStoreView() {
  els.ig.href = `https://instagram.com/${encodeURIComponent(CONFIG.instagramUsername)}`;
  els.wa.href = `https://wa.me/${CONFIG.whatsappNumber}`;
  els.pill.addEventListener('click', () => {
    renderHours();
    openModal(els.hoursModal);
  });

  const poll = () => !document.hidden && loadSettings();
  setInterval(poll, CONFIG.settingsPollMs);
  document.addEventListener('visibilitychange', poll);
  return loadSettings();
}
