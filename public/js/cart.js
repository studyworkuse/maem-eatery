// State keranjang menu. Keranjang bersifat per-perangkat (milik pelanggan), jadi disimpan
// di localStorage; data bersama (menu/kupon/pesanan) ada di Google Sheets.
import { calcDiscount } from './utils.js';

const STORAGE_KEY = 'maem_cart_v2';
const MAX_QTY = 99;

let items = load();
let coupon = null; // { code, percent, minPurchase, maxDiscount }
const listeners = new Set();

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter((i) => i && typeof i.name === 'string' && Number.isInteger(i.qty) && i.qty > 0)
          .map((i) => ({ name: i.name, price: Number(i.price) || 0, image: i.image || '', qty: Math.min(i.qty, MAX_QTY), note: String(i.note || '') }))
      : [];
  } catch {
    return [];
  }
}

function persist({ notify = true } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage penuh/diblokir: keranjang tetap jalan di memori */
  }
  if (notify) listeners.forEach((fn) => fn());
}

export const onCartChange = (fn) => listeners.add(fn);

export const getItems = () => items;
export const findItem = (name) => items.find((i) => i.name === name);
export const getCoupon = () => coupon;
export const count = () => items.reduce((sum, i) => sum + i.qty, 0);
export const subtotal = () => items.reduce((sum, i) => sum + i.price * i.qty, 0);
export const discount = () => calcDiscount(coupon, subtotal());
export const total = () => subtotal() - discount();

export function addItem(menuItem, qty = 1, note = '') {
  const existing = findItem(menuItem.name);
  const cleanNote = note.trim().slice(0, 150);
  if (existing) {
    existing.qty = Math.min(existing.qty + qty, MAX_QTY);
    existing.price = menuItem.price;
    if (cleanNote) existing.note = cleanNote;
  } else {
    items.push({ name: menuItem.name, price: menuItem.price, image: menuItem.image, qty: Math.min(qty, MAX_QTY), note: cleanNote });
  }
  persist();
}

export function changeQty(name, delta) {
  const item = findItem(name);
  if (!item) return;
  item.qty = Math.min(item.qty + delta, MAX_QTY);
  if (item.qty <= 0) items = items.filter((i) => i !== item);
  persist();
}

/** Simpan catatan tanpa render ulang (agar kursor di textarea tidak hilang). */
export function setNote(name, note) {
  const item = findItem(name);
  if (!item) return;
  item.note = note.slice(0, 150);
  persist({ notify: false });
}

export function removeItem(name) {
  items = items.filter((i) => i.name !== name);
  persist();
}

export function clearCart() {
  items = [];
  coupon = null;
  persist();
}

export function setCoupon(value) {
  coupon = value;
  listeners.forEach((fn) => fn());
}

/**
 * Sinkronkan keranjang dengan menu terbaru dari Sheets:
 * harga diperbarui, menu yang dihapus/habis dikeluarkan.
 * @returns {string[]} nama menu yang dikeluarkan
 */
export function reconcile(menu) {
  const byName = new Map(menu.map((m) => [m.name, m]));
  const removed = [];
  let changed = false;

  items = items.filter((item) => {
    const current = byName.get(item.name);
    if (!current || !current.available) {
      removed.push(item.name);
      changed = true;
      return false;
    }
    if (current.price !== item.price || current.image !== item.image) {
      item.price = current.price;
      item.image = current.image;
      changed = true;
    }
    return true;
  });

  if (changed) persist();
  return removed;
}
