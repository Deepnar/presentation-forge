import { open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { CONFIG } from '../paths.js';
import { getDb } from '../db.js';
import { isHosted, resolveSecret } from '../cloud.js';
import { verificationRequired } from '../auth.js';
import { reserveAuto, settleAuto } from '../limits.js';
import { AUTO_PROVIDER, AUTO_KEY_ENV, pickAutoProvider } from '../autoid.js';
import { cloneJson } from '../../packages/tools/json.ts';
import { parsePickupBinding } from '../../packages/agent/turn-pickup.ts';
import { providerProfile, prepareExchange, normalizedExchange, providerFailure } from '../../packages/agent/provider.ts';
import { createModelProvider } from './model-provider.js';

const fail = code => { throw Object.assign(new Error('Host pickup policy refused.'), { code }); };
export const autoHostEnabled = () => process.env.FORGE_AGENT_HOST_ENABLED === '1' && isHosted();
async function fileBytes(name, max) {
  const file = await open(path.join(CONFIG, name), 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > max) throw new Error();
    const bytes = Buffer.alloc(max + 1); let length = 0;
    while (length <= max) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > max) throw new Error();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  } finally { await file.close(); }
}
export function parseAutoHostConfiguration(host, models) {
  try {
    const value = cloneJson(host, 16384), config = cloneJson(models, 262144);
    if (!value || value.version !== 1 || Object.keys(value).some(k => !['version', 'model', 'capabilities', 'timeoutMs', 'maxResponseBytes', 'tokenParameter'].includes(k))) throw new Error();
    const selected = pickAutoProvider(config?.providers), spec = selected?.spec;
    if (!spec || spec.type !== 'openai-compatible' || !Array.isArray(spec.models) ||
        !spec.models.includes(value.model) || typeof spec.baseURL !== 'string' ||
        spec.session_header !== undefined && typeof spec.session_header !== 'boolean') throw new Error();
    const profile = providerProfile({ id: AUTO_PROVIDER, family: 'openai-compatible',
      model: value.model, capabilities: value.capabilities });
    if (!profile.capabilities.toolCalling) throw new Error();
    return { ...profile, baseURL: spec.baseURL, timeoutMs: value.timeoutMs ?? 30000,
      maxResponseBytes: value.maxResponseBytes ?? 262144,
      tokenParameter: value.tokenParameter ?? 'max_completion_tokens', sessionHeader: spec.session_header === true };
  } catch { return fail('host-misconfigured'); }
}
async function configuration() {
  try {
    const host = JSON.parse(await fileBytes('agent-host.json', 16384));
    const models = YAML.parse(await fileBytes('models.yaml', 262144));
    return parseAutoHostConfiguration(host, models);
  } catch { return fail('host-misconfigured'); }
}
function lookupAccount(owner) {
  const row = getDb().prepare('SELECT id,email,verified_at FROM users WHERE email=? COLLATE BINARY').get(owner);
  if (!row || verificationRequired() && !row.verified_at) return null;
  return { id: row.id, email: row.email };
}
function accountOf(value, owner) {
  const row = cloneJson(value, 2048);
  if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || row.email !== owner) return fail('owner-ineligible');
  return Object.freeze({ id: row.id, email: row.email });
}
function reserve(account, estimate) {
  return reserveAuto({ userId: account.id, provider: AUTO_PROVIDER, upcomingSlides: 0, upcomingTokens: estimate });
}
function settle(account, reservation, estimate, actual) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT user_id,provider,tokens FROM auto_events WHERE id=?').get(reservation.eventId);
    if (!row || row.user_id !== account.id || row.provider !== AUTO_PROVIDER || row.tokens !== estimate) throw new Error();
    if (!settleAuto({ eventId: reservation.eventId, tokens: actual })) throw new Error();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
function exchangeOptions(options) {
  if (options === undefined) return { input: {}, signal: undefined };
  if (!options || typeof options !== 'object' || Array.isArray(options) || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw new Error();
  const input = {}; let signal;
  for (const key of Reflect.ownKeys(options)) {
    const d = Object.getOwnPropertyDescriptor(options, key);
    if (typeof key !== 'string' || !d.enumerable || !('value' in d)) throw new Error();
    if (key === 'signal') { signal = d.value; if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error(); }
    else input[key] = d.value;
  }
  return { input: cloneJson(input, 262144), signal };
}

// An invocation owns fresh reservation closures; no event identity can be replayed.
export function createAutoHostPolicy({ enabled = autoHostEnabled, readConfiguration = configuration,
  account = lookupAccount, readSecret = () => resolveSecret(AUTO_KEY_ENV),
  reserveCall = reserve, settleCall = settle, transportFactory = createModelProvider,
  fetch: request = globalThis.fetch } = {}) {
  return Object.freeze({ async open(input) {
    const binding = Object.freeze(parsePickupBinding(input));
    if (enabled() !== true) return fail('host-disabled');
    const owner = accountOf(await account(binding.owner), binding.owner);
    async function authorize() {
      if (enabled() !== true) return fail('host-disabled');
      const current = accountOf(await account(binding.owner), binding.owner);
      if (current.id !== owner.id) return fail('owner-ineligible');
    }
    let provider, closed = false;
    return Object.freeze({ authorize, async provider() {
      await authorize();
      if (closed) return fail('rate-limited');
      if (provider) return provider;
      try {
        const config = cloneJson(await readConfiguration(), 16384);
        const profile = providerProfile({ id: config.id, family: config.family, model: config.model, capabilities: config.capabilities });
        if (profile.id !== AUTO_PROVIDER || profile.family !== 'openai-compatible' || !profile.capabilities.toolCalling) throw new Error();
        const apiKey = await readSecret();
        await authorize();
        const transport = transportFactory({ ...config, apiKey }, { fetch: (url, options) => request(url, {
          ...options, headers: { ...options.headers,
            ...(config.sessionHeader ? { 'x-opencode-session': randomUUID() } : {}) },
        }) });
        const exchange = transport.exchange.bind(transport);
        provider = Object.freeze({ profile, async exchange(context, options) {
          let prepared, parsed;
          try {
            parsed = exchangeOptions(options);
            prepared = prepareExchange(profile, context, parsed.input);
            if (prepared.ok === false) return prepared;
          } catch { return providerFailure('invalid-request'); }
          if (parsed.signal?.aborted) return providerFailure('cancelled');
          if (closed) return providerFailure('rate-limited');
          let reservation, estimate;
          try {
            await authorize();
            if (parsed.signal?.aborted) return providerFailure('cancelled');
            estimate = Math.max(1, Buffer.byteLength(JSON.stringify(prepared.wire), 'utf8') + prepared.outputTokens);
            reservation = reserveCall(owner, estimate);
            if (!reservation || reservation.allowed !== true) return providerFailure('rate-limited');
            if (!Number.isSafeInteger(reservation.eventId) || reservation.eventId < 1) throw new Error();
          } catch { closed = true; return providerFailure('provider-unavailable'); }
          let settlementUsed = false;
          const settleReservation = actual => {
            if (settlementUsed) throw new Error();
            settlementUsed = true;
            settleCall(owner, reservation, estimate, actual);
          };
          let result;
          try { result = await exchange(prepared.context, { ...parsed.input, signal: parsed.signal }); }
          catch { return providerFailure('provider-unavailable'); }
          if (parsed.signal?.aborted) return providerFailure('cancelled');
          const normalized = normalizedExchange(profile, prepared.context, result, prepared.outputTokens);
          if (!normalized) return result?.ok === false ? providerFailure(
            ['invalid-request', 'unsupported-capability', 'context-too-large', 'invalid-response', 'truncated', 'unauthorized', 'rate-limited', 'provider-unavailable', 'timeout', 'cancelled', 'response-too-large'].includes(result.code)
              ? result.code : 'invalid-response') : providerFailure('invalid-response');
          if (normalized.usage !== null) {
            const actual = normalized.usage.inputTokens + normalized.usage.outputTokens;
            if (actual > estimate) closed = true;
            // Both event and lifetime counters commit together or retain the estimate.
            try { settleReservation(actual); } catch { closed = true; return providerFailure('provider-unavailable'); }
          }
          return normalized;
        } });
        return provider;
      } catch { return fail('host-misconfigured'); }
    } });
  } });
}
