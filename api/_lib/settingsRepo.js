// Tab "Pengaturan" (dibuat otomatis): A Kunci | B Nilai | C Keterangan
import { SHEETS } from './constants.js';
import { appendValues, batchUpdateValues, ensureSheet, getValues, updateValues } from './sheets.js';
import { sanitizeCell } from './parse.js';
import { noteFor, parseSettings, settingsToRows } from './storeHours.js';

let ready = false;

async function ensureReady() {
  if (ready) return;
  const created = await ensureSheet(SHEETS.settings);
  const existing = created ? [] : await getValues(SHEETS.settings, 'A1:B');
  if (existing.length === 0) {
    const rows = settingsToRows(parseSettings([])).map(([key, value]) => [key, value, noteFor(key)]);
    await updateValues(SHEETS.settings, `A1:C${rows.length + 1}`, [['Kunci', 'Nilai', 'Keterangan'], ...rows]);
  }
  ready = true;
}

export async function readSettings({ ttl = 0 } = {}) {
  // Jalur cepat: 1 panggilan ke Sheets. Cek/pembuatan tab hanya bila pembacaan gagal (tab belum ada).
  try {
    const rows = await getValues(SHEETS.settings, 'A2:B', { ttl });
    if (rows.length > 0) return parseSettings(rows);
  } catch (error) {
    if (ready) throw error;
  }
  ready = false;
  await ensureReady();
  return parseSettings(await getValues(SHEETS.settings, 'A2:B', { ttl }));
}

/** Tulis nilai ke baris yang sudah ada (urutan baris buatan admin tetap aman); kunci baru ditambahkan di bawah. */
export async function writeSettings(settings) {
  await ensureReady();
  const current = await getValues(SHEETS.settings, 'A2:B');
  const rowOf = new Map(current.map((row, i) => [String(row[0] ?? '').trim().toLowerCase(), i + 2]));

  const updates = [];
  const appends = [];
  for (const [key, value] of settingsToRows(settings)) {
    const cell = sanitizeCell(value);
    if (rowOf.has(key)) updates.push({ a1: `B${rowOf.get(key)}`, values: [[cell]] });
    else appends.push([key, cell, noteFor(key)]);
  }
  await batchUpdateValues(SHEETS.settings, updates);
  if (appends.length) await appendValues(SHEETS.settings, 'A:C', appends);
}
