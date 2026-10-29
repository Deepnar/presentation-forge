import { bearerToken, cookieToken, SESSION_COOKIE } from '../../src/auth.js';
import { copyOwnerForToken } from '../../src/projects/copy-auth.js';
import { createProjectCopier } from '../../src/projects/copy.js';
import { projectStore } from '../../src/projects/backend.js';
import { wrap } from './http.js';

export function registerV2CopyRoute(app, { allowed }) {
  app.post('/api/v2/projects/:id/copy', wrap(async (req,res) => {
    res.set('Cache-Control','private, no-store');
    if (!allowed()) return res.status(403).json({ ok: false, code: 'disabled', error: 'Project storage is disabled.' });
    const authorization = req.headers.authorization, cookie = req.headers.cookie;
    const hasAuthorization = authorization !== undefined;
    const supplied = hasAuthorization || (typeof cookie === 'string' && cookie.split(';').some(s => s.trim().startsWith(SESSION_COOKIE + '=')));
    const token = hasAuthorization ? bearerToken(authorization) : cookieToken(cookie);
    try {
      const owner = await copyOwnerForToken(token,supplied);
      const result = await createProjectCopier(await projectStore()).copy({ id: req.params.id, owner },req.body);
      const status = result.ok ? 200 : ({ 'invalid-request': 422, 'not-found': 404, 'source-unavailable': 409,
        'stale-catalog': 409, 'invalid-state': 409, 'capacity-exceeded': 413 }[result.code] ?? 503);
      return res.status(status).json(result.ok ? result : { ok: false, code: result.code, error: result.message });
    } catch (error) {
      const status = error?.code === 'unauthorized' ? 401 : error?.code === 'email-unverified' ? 403 : 503;
      return res.status(status).json({ ok: false, code: status === 503 ? 'storage-unavailable' : error.code,
        error: status === 503 ? 'Copy is unavailable. Check the workspace before trying again.' : error.message });
    }
  }));
}
