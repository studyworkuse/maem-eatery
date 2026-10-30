import { requireAdmin } from './_lib/auth.js';
import { readBody, route } from './_lib/http.js';
import { readSettings, writeSettings } from './_lib/settingsRepo.js';
import { computeStatus } from './_lib/storeHours.js';
import { validateSettingsInput } from './_lib/validate.js';

export default route({
  // GET /api/settings -> { settings, status } (publik; status dihitung di server, zona waktu Jakarta)
  GET: async (req, res) => {
    const fresh = Boolean(req.query?._);
    if (!fresh) res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
    const settings = await readSettings({ ttl: fresh ? 0 : 5000 });
    return { settings, status: computeStatus(settings) };
  },

  // PUT /api/settings { mode, hours: { senin: '09:00-21:00', ... }, announcement, closedMessage }  (admin)
  PUT: async (req) => {
    requireAdmin(req);
    await writeSettings(validateSettingsInput(readBody(req)));
    return { ok: true };
  },
});
