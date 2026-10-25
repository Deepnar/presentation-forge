import express from 'express';
import { MIMEType } from 'node:util';
import { isUtf8 } from 'node:buffer';
import { validProjectId } from '../../packages/projects/document.js';
import { turnService } from '../../src/agent/index.js';
import { projectsAllowed, resolveProjectOwner } from './v2-projects-routes.js';

const PREFIX = '/api/v2/projects/:id/conversation';
const PRIVATE_PATH = /^\/api\/v2\/projects\/[^/]+\/conversation(?:\/|$)/i;
const BODY_BYTES = 8192;
const SUBMISSION_BYTES = 262144;
const STATUS = {
  'invalid-request': 400, 'invalid-id': 400, 'invalid-document': 422,
  'not-found': 404, 'stale-generation': 409, 'stale-conversation': 409,
  'stale-proposal': 409, 'stale-project': 409, 'proposal-unavailable': 409,
  'conflicting-decision': 409, 'approval-expired': 409, 'runtime-fenced': 409,
  'store-misconfigured': 503, 'storage-unavailable': 503,
  'conflicting-request': 409, busy: 409, 'storage-limit': 409,
};
const MESSAGES = {
  400: 'Invalid conversation request.', 401: 'Log in to access project conversations.',
  403: 'Project storage is disabled on this host.', 404: 'No such conversation.',
  409: 'Conversation or project state changed; reload before retrying.',
  413: 'Conversation request is too large.', 415: 'Use application/json.',
  422: 'Conversation request or stored state is invalid.',
  500: 'Conversation request failed.', 503: 'Project storage is unavailable.',
};
function failure(res, status, code) {
  return res.status(status).json({ ok: false, code, error: MESSAGES[status] });
}
function privateHeaders(_req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  next();
}
function parserFailure(error, _req, res, _next) {
  const oversized = error?.type === 'entity.too.large';
  return failure(res, oversized ? 413 : 400, oversized ? 'request-too-large' : 'invalid-request');
}

// Install before the shared parser so malformed private bodies never reach its
// default error formatter or its larger admission limit.
export function conversationBodyParser() {
  return [privateHeaders, express.json({ limit: BODY_BYTES }), parserFailure];
}

function submissionEncoding(req, res, next) {
  try {
    const raw = req.get('Content-Type') ?? '', type = new MIMEType(raw);
    const parameters = [...type.params];
    // Reject ignored/duplicate parameters too: the header parser and JSON decoder
    // must agree on UTF-8 before the larger admission budget can apply.
    if (type.essence !== 'application/json' || raw.split(';').length !== parameters.length + 1 ||
        parameters.some(([key, value]) => key !== 'charset' || value.toLowerCase() !== 'utf-8') ||
        (req.get('Content-Encoding') ?? 'identity').toLowerCase() !== 'identity')
      return failure(res, 415, 'unsupported-media-type');
    return next();
  } catch {
    return failure(res, 415, 'unsupported-media-type');
  }
}

function pagination(query) {
  if (Object.keys(query).some(key => !['offset', 'limit'].includes(key))) return null;
  const value = (key, fallback, maximum, minimum = 0) => {
    if (query[key] === undefined) return fallback;
    const raw = query[key];
    if (typeof raw !== 'string' || !/^(0|[1-9]\d{0,3})$/.test(raw)) return null;
    const number = Number(raw);
    return number >= minimum && number <= maximum ? number : null;
  };
  const offset = value('offset', 0, 128), limit = value('limit', 20, 20, 1);
  return offset === null || limit === null ? null : { offset, limit };
}

export function installConversationBodyParser(app) {
  // A parsed body skips later JSON parsers. Only this exact POST may consume
  // the larger budget; every other private route keeps the prefix admission cap.
  app.post(`${PREFIX}/turns`, privateHeaders, submissionEncoding,
    express.json({ limit: SUBMISSION_BYTES, inflate: false, verify: (_req, _res, body) => {
      if (!isUtf8(body)) throw new Error('Invalid conversation request.');
    } }), parserFailure);
  app.use(PREFIX, ...conversationBodyParser());
}

export function registerV2ConversationRoutes(app, { service = turnService } = {}) {
  function route(operation) {
    return async (req, res) => {
      privateHeaders(req, res, () => {});
      try {
        if (!projectsAllowed()) return failure(res, 403, 'projects-disabled');
        if (!validProjectId(req.params.id)) return failure(res, 400, 'invalid-id');
        const who = await resolveProjectOwner(req);
        if (who.denied) return failure(res, 401, 'unauthorized');
        // Private chat retains H's owner-only policy even when project CRUD grants
        // the authenticated administrator access to someone else's project.
        const binding = { owner: who.owner, id: req.params.id };
        let input;
        if (req.method === 'GET' || req.method === 'HEAD') {
          if (Number(req.get('Content-Length') ?? 0) > 0 || req.get('Transfer-Encoding'))
            return failure(res, 400, 'invalid-request');
          input = operation === 'read' ? pagination(req.query) : undefined;
          if (operation === 'read' ? input === null : Object.keys(req.query).length > 0)
            return failure(res, 400, 'invalid-request');
        } else {
          if (Object.keys(req.query).length) return failure(res, 400, 'invalid-request');
          if (!req.is('application/json')) return failure(res, 415, 'unsupported-media-type');
          input = req.body;
          if (!input || typeof input !== 'object' || Array.isArray(input))
            return failure(res, 400, 'invalid-request');
          const limit = operation === 'submit' ? SUBMISSION_BYTES : BODY_BYTES;
          if (Buffer.byteLength(JSON.stringify(input), 'utf8') > limit)
            return failure(res, 413, 'request-too-large');
        }
        const api = await service();
        const result = operation === 'export' ? await api.export(binding) : await api[operation](binding, input);
        if (!result.ok) {
          const status = STATUS[result.code];
          return failure(res, status ?? 500, status ? result.code : 'request-failed');
        }
        if (operation === 'export') res.attachment(`${binding.id}.conversation.json`);
        return res.json(result);
      } catch (error) {
        const code = error?.turnCode === 'approval-expired' ? 'approval-expired' : error?.code;
        const status = STATUS[code];
        return failure(res, status ?? 500, status ? code : 'request-failed');
      }
    };
  }
  app.get(PREFIX, route('read'));
  app.get(`${PREFIX}/export`, route('export'));
  app.post(`${PREFIX}/turns`, route('submit'));
  app.post(`${PREFIX}/decisions`, route('decide'));
  app.post(`${PREFIX}/cancel`, route('cancel'));
  app.post(`${PREFIX}/clear`, route('clear'));
  app.use((req, res, next) => {
    if (!PRIVATE_PATH.test(req.path)) return next();
    privateHeaders(req, res, () => {});
    return failure(res, 404, 'not-found');
  });
  // Parameter decoding can fail before the prefix parser or route runs. Match
  // the raw path here so private request bytes never reach Express's formatter.
  app.use((error, req, res, next) => {
    if (!PRIVATE_PATH.test(req.path)) return next(error);
    privateHeaders(req, res, () => {});
    const invalid = error instanceof URIError || error?.status === 400;
    return failure(res, invalid ? 400 : 500, invalid ? 'invalid-request' : 'request-failed');
  });
}
