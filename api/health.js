import { SHEETS } from './_lib/constants.js';
import { privateKey } from './_lib/env.js';
import { describeGoogleError } from './_lib/errors.js';
import { route } from './_lib/http.js';
import { getValues } from './_lib/sheets.js';

const REQUIRED_ENV = ['SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'ADMIN_PIN', 'SESSION_SECRET'];

/** Diagnostik setup: GET /api/health. Hanya menampilkan status (true/false/ok), tidak pernah nilai rahasia. */
export default route({
  GET: async () => {
    const env = Object.fromEntries(REQUIRED_ENV.map((name) => [name, Boolean(process.env[name])]));

    let privateKeyFormat = 'belum diisi';
    if (env.GOOGLE_PRIVATE_KEY) {
      const key = privateKey();
      privateKeyFormat = key.includes('BEGIN PRIVATE KEY') && key.includes('END PRIVATE KEY') && key.includes('\n')
        ? 'ok'
        : 'format salah: harus berisi BEGIN/END PRIVATE KEY';
    }

    const sheets = {};
    if (REQUIRED_ENV.slice(0, 3).every((name) => env[name])) {
      // Tab Pengaturan dibuat otomatis, jadi tidak diperiksa di sini.
      for (const tab of [SHEETS.orders, SHEETS.menu, SHEETS.coupons]) {
        try {
          await getValues(tab, 'A1:A1');
          sheets[tab] = 'ok';
        } catch (error) {
          console.error(`[health] ${tab}:`, error?.response?.data ?? error);
          sheets[tab] = describeGoogleError(error) ?? 'gagal dibaca (lihat Vercel > Logs)';
        }
      }
    }

    const healthy = Object.values(env).every(Boolean) && privateKeyFormat === 'ok' && Object.values(sheets).every((v) => v === 'ok') && Object.keys(sheets).length === 3;
    return { healthy, env, privateKeyFormat, sheets };
  },
});
