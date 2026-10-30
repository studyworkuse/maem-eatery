// Pengaturan toko: mode buka/tutup, jadwal per hari, dan pengumuman (fungsi murni, mudah dites).
import { TIME_ZONE } from './constants.js';
import { str } from './parse.js';

export const DAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
export const DAY_LABELS = {
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: 'Jumat',
  sabtu: 'Sabtu',
  minggu: 'Minggu',
};

export const MODES = ['auto', 'open', 'closed'];
/** Nilai yang boleh diketik manual di Sheets -> mode internal. */
const MODE_ALIASES = { auto: 'auto', otomatis: 'auto', open: 'open', buka: 'open', closed: 'closed', close: 'closed', tutup: 'closed' };
const MODE_TO_SHEET = { auto: 'auto', open: 'buka', closed: 'tutup' };

export const DEFAULT_HOURS = '09:00-21:00';
export const DEFAULT_CLOSED_MESSAGE = 'Maaf, kami sedang tutup. Silakan pesan kembali saat jam operasional.';

const CLOSED_WORDS = /^(tutup|libur|closed|off|-|)$/i;
const JS_DAY_INDEX = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };

const pad = (n) => String(n).padStart(2, '0');
export const formatMinutes = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * "09:00-21:00" -> {start, end} (menit). "tutup"/"libur"/kosong -> null.
 * Format tidak valid -> undefined.
 * Jika end < start, jadwal dianggap melewati tengah malam (mis. 18:00-02:00).
 */
export function parseRange(value) {
  const text = str(value);
  if (CLOSED_WORDS.test(text)) return null;
  const match = text.match(/^(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})$/);
  if (!match) return undefined;
  const [sh, sm, eh, em] = match.slice(1).map(Number);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return undefined;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return start === end ? undefined : { start, end };
}

/** Versi ketat untuk input admin: mengembalikan "HH:MM-HH:MM" atau "tutup"; format salah -> null. */
export function normalizeRange(value) {
  const range = parseRange(value);
  if (range === undefined) return null;
  return range ? `${formatMinutes(range.start)}-${formatMinutes(range.end)}` : 'tutup';
}

/** Baris tab "Pengaturan" ([[kunci, nilai], ...]) -> objek pengaturan. Kunci yang hilang memakai nilai bawaan. */
export function parseSettings(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = str(row?.[0]).toLowerCase();
    if (key) map.set(key, str(row[1]));
  }

  const hours = {};
  for (const day of DAYS) {
    const key = `jam_${day}`;
    const raw = map.has(key) ? map.get(key) : DEFAULT_HOURS;
    const range = parseRange(raw);
    // Format salah dianggap tutup agar tidak menerima pesanan di jam yang tidak jelas.
    hours[day] = range ? `${formatMinutes(range.start)}-${formatMinutes(range.end)}` : 'tutup';
  }

  return {
    mode: MODE_ALIASES[(map.get('mode') ?? '').toLowerCase()] ?? 'auto',
    hours,
    announcement: map.get('pengumuman') ?? '',
    closedMessage: map.get('pesan_tutup') || DEFAULT_CLOSED_MESSAGE,
  };
}

/** Objek pengaturan -> baris [kunci, nilai] untuk ditulis ke Sheets. */
export function settingsToRows(settings) {
  return [
    ['mode', MODE_TO_SHEET[settings.mode] ?? 'auto'],
    ...DAYS.map((day) => [`jam_${day}`, settings.hours[day]]),
    ['pengumuman', settings.announcement],
    ['pesan_tutup', settings.closedMessage],
  ];
}

const NOTES = {
  mode: 'auto = ikuti jadwal | buka = paksa buka | tutup = paksa tutup (libur/darurat)',
  pengumuman: 'Teks papan pengumuman di website. Kosongkan untuk menyembunyikan.',
  pesan_tutup: 'Pesan yang tampil saat resto tutup.',
};
export const noteFor = (key) => NOTES[key] ?? (key.startsWith('jam_') ? 'Format JJ:MM-JJ:MM (mis. 09:00-21:00) atau tulis "tutup" untuk libur.' : '');

/** Hari (0 = Senin) dan menit sejak 00:00 menurut waktu Jakarta. */
export function nowInJakarta(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    dayIndex: JS_DAY_INDEX[get('weekday').toLowerCase()],
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  };
}

/**
 * Status buka/tutup saat ini.
 * @returns {{open: boolean, source: 'manual'|'schedule', mode: string, closesAt: string|null,
 *            nextOpen: object|null, label: string}}
 */
export function computeStatus(settings, date = new Date()) {
  const { mode } = settings;
  if (mode === 'open') return { open: true, source: 'manual', mode, closesAt: null, nextOpen: null, label: 'Buka' };
  if (mode === 'closed') return { open: false, source: 'manual', mode, closesAt: null, nextOpen: null, label: 'Tutup sementara' };

  const { dayIndex, minutes } = nowInJakarta(date);
  const today = parseRange(settings.hours[DAYS[dayIndex]]) ?? null;
  const yesterday = parseRange(settings.hours[DAYS[(dayIndex + 6) % 7]]) ?? null;

  let openUntil = null;
  if (today) {
    const overnight = today.end < today.start;
    if (overnight ? minutes >= today.start : minutes >= today.start && minutes < today.end) openUntil = today.end;
  }
  // Sisa jadwal kemarin yang melewati tengah malam.
  if (openUntil === null && yesterday && yesterday.end < yesterday.start && minutes < yesterday.end) openUntil = yesterday.end;

  if (openUntil !== null) {
    const closesAt = formatMinutes(openUntil);
    return { open: true, source: 'schedule', mode, closesAt, nextOpen: null, label: `Buka · sampai ${closesAt}` };
  }

  let nextOpen = null;
  for (let offset = 0; offset <= 7 && !nextOpen; offset += 1) {
    const day = DAYS[(dayIndex + offset) % 7];
    const range = parseRange(settings.hours[day]);
    if (!range || (offset === 0 && range.start <= minutes)) continue;
    nextOpen = { day, dayLabel: DAY_LABELS[day], time: formatMinutes(range.start), today: offset === 0, tomorrow: offset === 1 };
  }

  let label = 'Tutup';
  if (nextOpen) {
    if (nextOpen.today) label = `Tutup · buka pukul ${nextOpen.time}`;
    else if (nextOpen.tomorrow) label = `Tutup · buka besok ${nextOpen.time}`;
    else label = `Tutup · buka ${nextOpen.dayLabel} ${nextOpen.time}`;
  }
  return { open: false, source: 'schedule', mode, closesAt: null, nextOpen, label };
}
