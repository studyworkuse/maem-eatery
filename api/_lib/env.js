import { HttpError } from './errors.js';

/** Ambil environment variable wajib; lempar error 500 yang jelas jika belum diisi. */
export function env(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Environment variable ${name} belum diisi.`);
    throw new HttpError(500, 'Konfigurasi server belum lengkap. Hubungi pengelola.');
  }
  return value;
}

/** Private key service account; toleran terhadap tanda kutip, "\\n" literal, dan CRLF hasil copy-paste. */
export function privateKey() {
  let key = env('GOOGLE_PRIVATE_KEY').trim();
  const quoted = (key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"));
  if (quoted) key = key.slice(1, -1);
  return key.replace(/\\n/g, '\n').replace(/\r/g, '');
}
