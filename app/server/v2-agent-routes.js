import express from 'express';
import { MIMEType } from 'node:util';
import { isUtf8 } from 'node:buffer';
import { bearerToken, accountForBearerToken, verificationRequired } from '../../src/auth.js';
import { agentHostWake, hostWakeEnabled } from '../../src/agent/host-wake.js';
import { validProjectId } from '../../packages/projects/document.js';
import { parseTurnLookup } from '../../packages/agent/turn-target.ts';
import { projectsAllowed } from './v2-projects-routes.js';

const PREFIX = '/api/v2/agent';
const PRIVATE = /^\/api\/v2\/agent(?:\/|$)/i;
const statuses = { 'invalid-input': 400, 'host-disabled': 503, 'host-closed': 503,
  'host-busy': 503, 'wake-capacity': 503, 'wake-cooldown': 429, 'wake-expired': 503,
  'owner-ineligible': 403, 'host-misconfigured': 503, 'host-unavailable': 503,
  'store-misconfigured': 503, 'storage-unavailable': 503 };
function privateHeaders(_req, res, next) { res.set('Cache-Control', 'private, no-store'); next(); }
function refuse(res, status, code) { return res.status(status).json({ ok: false, code, error: 'Host wake request refused.' }); }
function encoding(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  try {
    const raw = req.get('Content-Type') ?? '', type = new MIMEType(raw), params = [...type.params];
    if (type.essence !== 'application/json' || raw.split(';').length !== params.length + 1 ||
        params.some(([k, v]) => k !== 'charset' || v.toLowerCase() !== 'utf-8') ||
        (req.get('Content-Encoding') ?? 'identity').toLowerCase() !== 'identity') throw new Error();
    next();
  } catch { return refuse(res, 415, 'unsupported-media-type'); }
}
export function installAgentBodyParser(app) {
  app.use(PREFIX, privateHeaders, encoding, express.json({ limit: 1024, inflate: false,
    verify: (_req, _res, bytes) => { if (!isUtf8(bytes)) throw new Error(); } }),
  (error, _req, res, _next) => refuse(res, error?.type === 'entity.too.large' ? 413 : 400,
    error?.type === 'entity.too.large' ? 'request-too-large' : 'invalid-request'));
}
export function registerV2AgentRoutes(app, { service = agentHostWake, authenticate = accountForBearerToken } = {}) {
  app.post(`${PREFIX}/wake`, async (req, res) => {
    privateHeaders(req, res, () => {});
    try {
      const identity = authenticate(bearerToken(req.headers.authorization));
      if (!identity) return refuse(res, 401, 'unauthorized');
      if (verificationRequired() && !identity.verified) return refuse(res, 403, 'owner-ineligible');
      if (!projectsAllowed() || !hostWakeEnabled()) return refuse(res, 503, 'host-disabled');
      if (Object.keys(req.query).length || !req.body || Array.isArray(req.body) ||
          typeof req.body !== 'object' || Object.keys(req.body).length) return refuse(res, 400, 'invalid-request');
      const result = await service().wake({ owner: identity.owner, userId: identity.userId });
      if (result.ok === true && ['accepted', 'coalesced'].includes(result.status))
        return res.status(202).json({ ok: true, status: result.status });
      const status = statuses[result.code] ?? 503;
      if (Number.isSafeInteger(result.retryAfter) && result.retryAfter >= 1 && result.retryAfter <= 5)
        res.set('Retry-After', String(result.retryAfter));
      return refuse(res, status, statuses[result.code] ? result.code : 'host-unavailable');
    } catch { return refuse(res, 503, 'host-unavailable'); }
  });
  app.use((req, res, next) => {
    if (!PRIVATE.test(req.path)) return next();
    privateHeaders(req, res, () => {}); return refuse(res, 404, 'not-found');
  });
  app.use((error, req, res, next) => {
    if (!PRIVATE.test(req.path)) return next(error);
    privateHeaders(req, res, () => {});
    return refuse(res, error instanceof URIError || error?.status === 400 ? 400 : 503, 'invalid-request');
  });
}

const TARGET = '/api/v2/projects/:id/conversation/wake';
const targetStatuses = { ...statuses, 'not-found': 404, 'stale-generation': 409,
  'stale-conversation': 409, 'stale-project': 409, 'runtime-fenced': 409,
  'invalid-id': 400, 'invalid-document': 422 };
export function installTargetWakeBodyParser(app) {
  app.post(TARGET, privateHeaders, encoding, express.json({ limit: 2048, inflate: false,
    verify: (_req, _res, bytes) => { if (!isUtf8(bytes)) throw new Error(); } }),
  (error, _req, res, _next) => refuse(res, error?.type === 'entity.too.large' ? 413 : 400,
    error?.type === 'entity.too.large' ? 'request-too-large' : 'invalid-request'));
}
export function registerV2TargetWakeRoute(app, { service = agentHostWake, authenticate = accountForBearerToken } = {}) {
  app.post(TARGET, async (req, res) => {
    privateHeaders(req, res, () => {});
    try {
      const identity = authenticate(bearerToken(req.headers.authorization));
      if (!identity) return refuse(res, 401, 'unauthorized');
      if (verificationRequired() && !identity.verified) return refuse(res, 403, 'owner-ineligible');
      if (!projectsAllowed() || !hostWakeEnabled()) return refuse(res, 503, 'host-disabled');
      if (!validProjectId(req.params.id) || Object.keys(req.query).length) return refuse(res, 400, 'invalid-request');
      let lookup;
      try { lookup = parseTurnLookup(req.body); } catch { return refuse(res, 400, 'invalid-request'); }
      const result = await service().wake({ owner: identity.owner, userId: identity.userId,
        target: { projectId: req.params.id, ...lookup } });
      if (result.ok === true && ['accepted', 'coalesced'].includes(result.status))
        return res.status(202).json({ ok: true, status: result.status });
      if (Number.isSafeInteger(result.retryAfter) && result.retryAfter >= 1 && result.retryAfter <= 5)
        res.set('Retry-After', String(result.retryAfter));
      return refuse(res, targetStatuses[result.code] ?? 503, targetStatuses[result.code] ? result.code : 'host-unavailable');
    } catch { return refuse(res, 503, 'host-unavailable'); }
  });
}
