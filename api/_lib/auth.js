import crypto from 'node:crypto';
import { env } from './env.js';
import { HttpError } from './errors.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 10 * 60 * 1000;

const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export function createToken(secret, now = Date.now()) {
  const expires = String(now + SESSION_TTL_MS);
  return `${expires}.${sign(expires, secret)}`;
}

export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature) return false;
  if (!safeEqual(signature, sign(expires, secret))) return false;
  return Number(expires) > now;
}

export const isPinValid = (input, expected) => safeEqual(input ?? '', expected);

/** Pastikan request membawa token admin yang valid (Authorization: Bearer ...). */
export function requireAdmin(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!verifyToken(token, env('SESSION_SECRET'))) {
    throw new HttpError(401, 'Sesi admin tidak valid atau sudah berakhir. Silakan login ulang.');
  }
}

// Pembatasan percobaan login (best-effort, per instance serverless).
const failures = new Map();

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

export function assertLoginAllowed(ip, now = Date.now()) {
  const entry = failures.get(ip);
  if (entry && now - entry.first < LOCK_WINDOW_MS && entry.count >= MAX_FAILED_ATTEMPTS) {
    throw new HttpError(429, 'Terlalu banyak percobaan PIN. Coba lagi dalam beberapa menit.');
  }
}

export function recordLoginFailure(ip, now = Date.now()) {
  const entry = failures.get(ip);
  if (!entry || now - entry.first >= LOCK_WINDOW_MS) failures.set(ip, { first: now, count: 1 });
  else entry.count += 1;
}

export const clearLoginFailures = (ip) => failures.delete(ip);
