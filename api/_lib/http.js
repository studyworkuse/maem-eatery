import { HttpError, describeGoogleError } from './errors.js';

/** Baca body JSON dari request (Vercel biasanya sudah mem-parse). */
export function readBody(req) {
  const { body } = req;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      throw new HttpError(400, 'Format data tidak valid.');
    }
  }
  return body;
}

/**
 * Bungkus handler per-method dengan penanganan error yang seragam.
 * Handler mengembalikan objek yang dikirim sebagai JSON.
 */
export function route(handlers) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const run = handlers[req.method];
      if (!run) {
        res.setHeader('Allow', Object.keys(handlers).join(', '));
        throw new HttpError(405, 'Method tidak diizinkan.');
      }
      const data = await run(req, res);
      if (!res.writableEnded) res.status(200).json(data ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error('[api] Unhandled error:', error?.response?.data ?? error);
      const hint = describeGoogleError(error);
      res.status(hint ? 502 : 500).json({ error: hint ?? 'Terjadi kesalahan pada server. Coba lagi sebentar lagi.' });
    }
  };
}
