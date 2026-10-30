import { assertLoginAllowed, clearLoginFailures, clientIp, createToken, isPinValid, recordLoginFailure } from './_lib/auth.js';
import { env } from './_lib/env.js';
import { HttpError } from './_lib/errors.js';
import { readBody, route } from './_lib/http.js';

export default route({
  // POST /api/login  { pin } -> { token }
  POST: async (req) => {
    const ip = clientIp(req);
    assertLoginAllowed(ip);

    const { pin } = readBody(req);
    if (!isPinValid(pin, env('ADMIN_PIN'))) {
      recordLoginFailure(ip);
      throw new HttpError(401, 'PIN salah! Coba lagi.');
    }
    clearLoginFailures(ip);
    return { token: createToken(env('SESSION_SECRET')) };
  },
});
