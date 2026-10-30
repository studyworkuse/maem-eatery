// Klien tipis Google Sheets API v4 (service account, tanpa Apps Script).
import { env, privateKey } from './env.js';
import { HttpError } from './errors.js';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

let client;
async function getClient() {
  if (!client) {
    // Impor lazy: fungsi yang tidak menyentuh Sheets (mis. login) tidak menanggung biaya muat library.
    const { JWT } = await import('google-auth-library');
    client = new JWT({
      email: env('GOOGLE_SERVICE_ACCOUNT_EMAIL').trim(),
      key: privateKey(),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  return client;
}

async function call(path, { method = 'GET', params, data } = {}) {
  const res = await (await getClient()).request({
    url: `${API}/${env('SPREADSHEET_ID').trim()}${path}`,
    method,
    params,
    data,
  });
  return res.data;
}

const range = (sheet, a1) => encodeURIComponent(`'${sheet}'!${a1}`);

// Cache baca singkat (per instance) agar kuota Sheets API (60 baca/menit) aman.
// Setiap penulisan mengosongkan cache.
const readCache = new Map();

/**
 * @param {number} ttl milidetik; 0 = selalu baca langsung dari Sheets
 */
export async function getValues(sheet, a1, { ttl = 0 } = {}) {
  const key = `${sheet}!${a1}`;
  const hit = readCache.get(key);
  if (ttl > 0 && hit && Date.now() - hit.at < ttl) return hit.values;

  const data = await call(`/values/${range(sheet, a1)}`, { params: { valueRenderOption: 'UNFORMATTED_VALUE' } });
  const values = data.values ?? [];
  if (ttl > 0) readCache.set(key, { at: Date.now(), values });
  return values;
}

export async function updateValues(sheet, a1, values) {
  readCache.clear();
  return call(`/values/${range(sheet, a1)}`, {
    method: 'PUT',
    params: { valueInputOption: 'USER_ENTERED' },
    data: { values },
  });
}

export async function appendValues(sheet, a1, values) {
  readCache.clear();
  return call(`/values/${range(sheet, a1)}:append`, {
    method: 'POST',
    params: { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' },
    data: { values },
  });
}

export async function clearValues(sheet, a1) {
  readCache.clear();
  return call(`/values/${range(sheet, a1)}:clear`, { method: 'POST', data: {} });
}

const sheetIds = new Map();
async function findSheetId(title) {
  if (sheetIds.has(title)) return sheetIds.get(title);
  const meta = await call('', { params: { fields: 'sheets.properties(sheetId,title)' } });
  for (const s of meta.sheets ?? []) sheetIds.set(s.properties.title, s.properties.sheetId);
  return sheetIds.get(title);
}

async function getSheetId(title) {
  const id = await findSheetId(title);
  if (id === undefined) throw new HttpError(500, `Tab "${title}" tidak ditemukan di spreadsheet.`);
  return id;
}

/** Buat tab bila belum ada. @returns {Promise<boolean>} true bila baru dibuat. */
export async function ensureSheet(title) {
  if ((await findSheetId(title)) !== undefined) return false;
  readCache.clear();
  await call(':batchUpdate', { method: 'POST', data: { requests: [{ addSheet: { properties: { title } } }] } });
  sheetIds.delete(title);
  return true;
}

/** Perbarui beberapa sel/rentang sekaligus: updates = [{ a1: 'B2', values: [[...]] }]. */
export async function batchUpdateValues(sheet, updates) {
  if (updates.length === 0) return;
  readCache.clear();
  await call('/values:batchUpdate', {
    method: 'POST',
    data: {
      valueInputOption: 'USER_ENTERED',
      data: updates.map(({ a1, values }) => ({ range: `'${sheet}'!${a1}`, values })),
    },
  });
}

/** Hapus satu baris (nomor baris 1-based) dari sebuah tab. */
export async function deleteRow(sheet, row) {
  readCache.clear();
  const sheetId = await getSheetId(sheet);
  return call(':batchUpdate', {
    method: 'POST',
    data: {
      requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }],
    },
  });
}

/** Pastikan baris `row` masih berisi data yang diharapkan di kolom A (cegah salah edit/hapus). */
export async function assertRowMatches(sheet, row, expected, label = 'Data') {
  const rows = await getValues(sheet, `A${row}:A${row}`);
  const actual = String(rows[0]?.[0] ?? '').trim();
  if (actual !== String(expected ?? '').trim()) {
    throw new HttpError(409, `${label} sudah berubah di spreadsheet. Muat ulang daftar lalu coba lagi.`);
  }
}
