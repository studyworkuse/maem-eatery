// Fungsi murni untuk membaca nilai sel Google Sheets (mudah dites).

const MONTHS = {
  januari: 1, jan: 1, january: 1,
  februari: 2, feb: 2, february: 2,
  maret: 3, mar: 3, march: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6, june: 6,
  juli: 7, jul: 7, july: 7,
  agustus: 8, agu: 8, agt: 8, aug: 8, august: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, oct: 10, october: 10,
  november: 11, nov: 11,
  desember: 12, des: 12, dec: 12, december: 12,
};

const pad = (n) => String(n).padStart(2, '0');

export const str = (value) => String(value ?? '').trim();

/** "Rp20.000" / 20000 / "20000" -> 20000 */
export function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const digits = str(value).replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/** 0.1 / "10%" / "10" / 10 -> 0.1 */
export function toPercentFraction(value) {
  let n;
  if (typeof value === 'number') {
    n = value;
  } else {
    const raw = str(value).replace(',', '.');
    n = parseFloat(raw);
    if (raw.includes('%') && Number.isFinite(n)) return n / 100;
  }
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

/**
 * Sel tanggal -> "YYYY-MM-DD" (atau "" jika tidak terbaca).
 * Mendukung serial date Sheets, "2026-11-12", dan "12 November 2026".
 */
export function parseSheetDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const text = str(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const id = text.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (id) {
    const month = MONTHS[id[2].toLowerCase()];
    if (month) return `${id[3]}-${pad(month)}-${pad(Number(id[1]))}`;
  }
  return '';
}

/**
 * Isi kolom "Telah dipakai oleh" -> array baris.
 * Baris contoh berbentuk "(nama - nomor pelanggan)" diabaikan.
 */
export function parseUsedBy(value) {
  return str(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\(.*\)$/.test(line));
}

/** Cegah formula injection saat nilai dikirim dengan USER_ENTERED. */
export function sanitizeCell(value) {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
