// The Assistant on whatever provider the account has — the Auto gateway, a
// key the account brought, or a local Ollama — resolved exactly as
// generation resolves a role (resolveRole("assistant")), inside the
// account's own context so a BYOK key is that account's and nobody else's.
// Same session contract as the Auto host policy: authorize() re-checks the
// account on every step, provider() hands the worker one transport. Calls
// billed to the operator (the Auto gateway) reserve and settle against the
// account's Auto allowance as before; BYOK and local calls cost the operator
// nothing and are not metered here.
import { parsePickupBinding } from '../../packages/agent/turn-pickup.ts';
import { providerProfile, prepareExchange, normalizedExchange, providerFailure } from '../../packages/agent/provider.ts';
import { createModelProvider } from './model-provider.js';
import { lookupAccount, accountOf, reserve, settle, exchangeOptions } from './auto-host-policy.js';
import { runAsAccount } from '../account.js';

const fail = (code) => { throw Object.assign(new Error('Assistant provider refused.'), { code }); };
const FAILURES = ['invalid-request', 'unsupported-capability', 'context-too-large', 'invalid-response', 'truncated', 'unauthorized', 'rate-limited', 'provider-unavailable', 'timeout', 'cancelled', 'response-too-large'];

// What a resolved role becomes as a transport: an OpenAI-compatible
// endpoint either way — Ollama answers on /v1 locally.
export function transportFor(resolved) {
  const b = resolved?.backend;
  if (!b || !resolved.model) return null;
  if (b.type === 'ollama') {
    const host = String(b.host ?? process.env.FORGE_OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/$/, '');
    return { id: 'local-ollama', family: 'openai-compatible', model: resolved.model, baseURL: `${host}/v1`, apiKey: 'ollama', billedToOperator: false, local: true };
  }
  if (b.type === 'openai-compatible' && b.baseURL && b.apiKey) {
    return { id: String(b.providerId ?? 'provider'), family: 'openai-compatible', model: resolved.model, baseURL: b.baseURL, apiKey: b.apiKey, billedToOperator: b.billingOwner === 'operator', local: false };
  }
  return null;
}

const CAPABILITIES = (local) => ({
  toolCalling: true, structuredOutput: false, vision: false, reasoning: false, files: false, streaming: false,
  // A local model's window is the one models.yaml gives it; a hosted one
  // takes the contract's ceiling.
  contextChars: local ? 48000 : 100000, maxOutputTokens: 4096,
});

export async function resolveAssistant(owner) {
  const { resolveRole } = await import('../ai/ollama.js');
  return runAsAccount({ userId: owner.id, email: owner.email }, () => resolveRole('assistant'));
}

export function createAccountHostPolicy({ account = lookupAccount, resolve = resolveAssistant,
  reserveCall = reserve, settleCall = settle, transportFactory = createModelProvider, fetch: request = globalThis.fetch } = {}) {
  return Object.freeze({ async open(input) {
    const binding = Object.freeze(parsePickupBinding(input));
    const owner = accountOf(await account(binding.owner), binding.owner);
    async function authorize() {
      const current = accountOf(await account(binding.owner), binding.owner);
      if (current.id !== owner.id) return fail('owner-ineligible');
    }
    let provider, closed = false;
    return Object.freeze({ authorize, async provider() {
      await authorize();
      if (closed) return fail('rate-limited');
      if (provider) return provider;
      let config;
      try { config = transportFor(await resolve(owner)); } catch { return fail('host-misconfigured'); }
      if (!config) return fail('host-misconfigured');
      const profile = providerProfile({ id: config.id, family: config.family, model: config.model, capabilities: CAPABILITIES(config.local) });
      let transport;
      try {
        transport = transportFactory({ ...profile, baseURL: config.baseURL, apiKey: config.apiKey, timeoutMs: config.local ? 120000 : 60000 }, { fetch: request });
      } catch { return fail('host-misconfigured'); }
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
        let reservation = null, estimate = 0;
        try {
          await authorize();
          if (config.billedToOperator) {
            estimate = Math.max(1, Buffer.byteLength(JSON.stringify(prepared.wire), 'utf8') + prepared.outputTokens);
            reservation = reserveCall(owner, estimate);
            if (!reservation || reservation.allowed !== true) return providerFailure('rate-limited');
          }
        } catch { closed = true; return providerFailure('provider-unavailable'); }
        let result;
        try { result = await exchange(prepared.context, { ...parsed.input, signal: parsed.signal }); }
        catch { return providerFailure('provider-unavailable'); }
        if (parsed.signal?.aborted) return providerFailure('cancelled');
        const normalized = normalizedExchange(profile, prepared.context, result, prepared.outputTokens);
        if (!normalized) return providerFailure(result?.ok === false && FAILURES.includes(result.code) ? result.code : 'invalid-response');
        if (reservation && normalized.usage !== null) {
          const actual = normalized.usage.inputTokens + normalized.usage.outputTokens;
          if (actual > estimate) closed = true;
          try { settleCall(owner, reservation, estimate, actual); } catch { closed = true; return providerFailure('provider-unavailable'); }
        }
        return normalized;
      } });
      return provider;
    } });
  } });
}
