// Akses data tab "Kelola Menu": A Nama | B Kategori | C Harga | D URL Gambar | E Deskripsi | F Status
import { SHEETS, MENU_STATUS } from './constants.js';
import { assertRowMatches, appendValues, deleteRow, getValues, updateValues } from './sheets.js';
import { str, toNumber, sanitizeCell } from './parse.js';

export function parseMenuRows(rows) {
  return rows
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => str(r[0]))
    .map(({ r, row }) => ({
      row,
      name: str(r[0]),
      category: str(r[1]) || 'Lainnya',
      price: toNumber(r[2]),
      image: str(r[3]),
      description: str(r[4]),
      available: !/out|habis/i.test(str(r[5])),
    }));
}

const toRow = (item) => [
  sanitizeCell(item.name),
  sanitizeCell(item.category),
  item.price,
  item.image,
  sanitizeCell(item.description),
  item.status ?? MENU_STATUS.available,
];

export async function listMenu({ ttl = 0 } = {}) {
  return parseMenuRows(await getValues(SHEETS.menu, 'A2:F', { ttl }));
}

export async function createMenu(item) {
  await appendValues(SHEETS.menu, 'A:F', [toRow(item)]);
}

export async function updateMenu(row, expectedName, item) {
  await assertRowMatches(SHEETS.menu, row, expectedName, 'Menu');
  await updateValues(SHEETS.menu, `A${row}:F${row}`, [toRow(item)]);
}

export async function removeMenu(row, expectedName) {
  await assertRowMatches(SHEETS.menu, row, expectedName, 'Menu');
  await deleteRow(SHEETS.menu, row);
}
