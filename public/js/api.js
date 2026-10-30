// Klien API: seluruh data berasal dari Google Sheets melalui /api/*.

const TOKEN_KEY = 'maem_admin_token'; // sessionStorage: hilang saat tab ditutup

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const hasAdminToken = () => Boolean(readToken());

export function setAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage diblokir: abaikan */
  }
}

async function request(path, { method = 'GET', body, admin = false, query } = {}) {
  const url = new URL(path, window.location.origin);
  if (query) Object.entries(query).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (admin) headers.Authorization = `Bearer ${readToken() ?? ''}`;

  let response;
  try {
    response = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet.', 0);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* body kosong / bukan JSON */
  }
  if (!response.ok) {
    if (response.status === 401 && admin) setAdminToken(null);
    throw new ApiError(data?.error || `Permintaan gagal (${response.status}).`, response.status);
  }
  return data;
}

const fresh = () => ({ _: Date.now() }); // lewati cache CDN

export const api = {
  // Publik
  getMenu: () => request('/api/menu'),
  getSettings: () => request('/api/settings'), // publik, boleh lewat cache CDN 5 detik
  getSettingsFresh: () => request('/api/settings', { query: fresh() }), // admin: selalu terbaru
  validateCoupon: (payload) => request('/api/coupons', { method: 'POST', body: { action: 'validate', ...payload } }),
  createOrder: (payload) => request('/api/orders', { method: 'POST', body: payload }),

  // Admin
  login: (pin) => request('/api/login', { method: 'POST', body: { pin } }),

  getAdminMenu: () => request('/api/menu', { query: fresh() }),
  createMenu: (item) => request('/api/menu', { method: 'POST', body: item, admin: true }),
  updateMenu: (item) => request('/api/menu', { method: 'PUT', body: item, admin: true }),
  deleteMenu: (row, name) => request('/api/menu', { method: 'DELETE', query: { row, name }, admin: true }),

  updateSettings: (settings) => request('/api/settings', { method: 'PUT', body: settings, admin: true }),

  getCoupons: () => request('/api/coupons', { admin: true }),
  createCoupon: (coupon) => request('/api/coupons', { method: 'POST', body: { action: 'create', ...coupon }, admin: true }),
  updateCoupon: (coupon) => request('/api/coupons', { method: 'PUT', body: coupon, admin: true }),
  resetCouponUsage: (row, expectedCode) =>
    request('/api/coupons', { method: 'POST', body: { action: 'reset', row, expectedCode }, admin: true }),
  deleteCoupon: (row, code) => request('/api/coupons', { method: 'DELETE', query: { row, code }, admin: true }),

  getOrders: () => request('/api/orders', { admin: true }),
  updateOrderStatus: (row, id, status) => request('/api/orders', { method: 'PATCH', body: { row, id, status }, admin: true }),
  deleteOrder: (row, id) => request('/api/orders', { method: 'DELETE', query: { row, id }, admin: true }),
  clearOrders: () => request('/api/orders', { method: 'DELETE', query: { all: 1 }, admin: true }),
};
