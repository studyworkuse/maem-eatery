import { requireAdmin } from './_lib/auth.js';
import { HttpError } from './_lib/errors.js';
import { readBody, route } from './_lib/http.js';
import { createMenu, listMenu, removeMenu, updateMenu } from './_lib/menuRepo.js';
import { validateMenuInput, validateRow } from './_lib/validate.js';

const categoriesOf = (items) => [...new Set(items.map((i) => i.category))];

export default route({
  // GET /api/menu -> { items } (publik; di-cache CDN beberapa detik)
  GET: async (req, res) => {
    const fresh = Boolean(req.query?._);
    if (!fresh) res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
    return { items: await listMenu({ ttl: fresh ? 0 : 5000 }) };
  },

  // POST /api/menu  { name, category, price, image, description, available }
  POST: async (req) => {
    requireAdmin(req);
    const existing = await listMenu();
    const item = validateMenuInput(readBody(req), categoriesOf(existing));
    if (existing.some((m) => m.name.toLowerCase() === item.name.toLowerCase())) {
      throw new HttpError(409, `Menu "${item.name}" sudah ada.`);
    }
    await createMenu(item);
    return { ok: true };
  },

  // PUT /api/menu  { row, expectedName, ...fields }
  PUT: async (req) => {
    requireAdmin(req);
    const body = readBody(req);
    const existing = await listMenu();
    const item = validateMenuInput(body, categoriesOf(existing));
    const duplicate = existing.find((m) => m.name.toLowerCase() === item.name.toLowerCase());
    if (duplicate && duplicate.row !== Number(body.row)) {
      throw new HttpError(409, `Menu "${item.name}" sudah ada.`);
    }
    await updateMenu(validateRow(body.row), body.expectedName, item);
    return { ok: true };
  },

  // DELETE /api/menu?row=5&name=NASI%20GULTIK
  DELETE: async (req) => {
    requireAdmin(req);
    await removeMenu(validateRow(req.query?.row), req.query?.name);
    return { ok: true };
  },
});
