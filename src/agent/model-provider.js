import { providerProfile, prepareExchange, parseProviderExchange, providerFailure } from '../../packages/agent/provider.ts';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';

// Credentials live only in this operator-owned transport closure, outside context and trace.
export function createModelProvider(config, { fetch: request = globalThis.fetch } = {}) {
  let profile, endpoint, apiKey, timeoutMs, maxResponseBytes, tokenParameter;
  try {
    const { family, id, model, capabilities } = config;
    profile = providerProfile({ family, id, model, capabilities });
    const base = new URL(config.baseURL);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (base.username || base.password || base.search || base.hash || !['https:', 'http:'].includes(base.protocol) || base.protocol === 'http:' && !local) throw new Error();
    endpoint = base.href.replace(/\/$/, '') + (family === 'anthropic' ? '/messages' : '/chat/completions');
    apiKey = config.apiKey;
    if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 4096 || /[\x00-\x20\x7f]/u.test(apiKey)) throw new Error();
    timeoutMs = config.timeoutMs ?? 30000;
    maxResponseBytes = config.maxResponseBytes ?? 262144;
    tokenParameter = config.tokenParameter ?? 'max_completion_tokens';
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120000 ||
        !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 256 || maxResponseBytes > 262144 ||
        !['max_completion_tokens', 'max_tokens'].includes(tokenParameter) || typeof request !== 'function') throw new Error();
  } catch { throw new Error('Invalid provider transport configuration.'); }
  return Object.freeze({
    profile,
    async exchange(context, options = {}) {
      let signal, prepared;
      try {
        if (!options || typeof options !== 'object' || Array.isArray(options)) return providerFailure('invalid-request');
        if (![Object.prototype, null].includes(Object.getPrototypeOf(options))) return providerFailure('invalid-request');
        const rest = {};
        for (const key of Reflect.ownKeys(options)) {
          const d = Object.getOwnPropertyDescriptor(options, key);
          if (typeof key !== 'string' || !['signal', 'requires', 'maxOutputTokens', 'contextChars', 'history'].includes(key) || !d.enumerable || !('value' in d)) return providerFailure('invalid-request');
          if (key === 'signal') signal = d.value;
          else rest[key] = d.value;
        }
        if (signal !== undefined && !(signal instanceof AbortSignal)) return providerFailure('invalid-request');
        prepared = prepareExchange(profile, context, rest);
      } catch { return providerFailure('invalid-request'); }
      if (prepared.ok === false) return prepared;
      if (signal?.aborted) return providerFailure('cancelled');
      const controller = new AbortController(), deadline = performance.now() + timeoutMs;
      let code = 'timeout', timer, reader;
      let onAbort;
      const interrupted = () => {
        if (!controller.signal.aborted && performance.now() >= deadline) controller.abort();
        return controller.signal.aborted;
      };
      const aborted = new Promise(resolve => {
        onAbort = () => { code = 'cancelled'; controller.abort(); resolve(providerFailure(code)); };
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => { controller.abort(); resolve(providerFailure(code)); }, timeoutMs);
      });
      const operation = (async () => {
        try {
          const body = { ...prepared.wire };
          if (profile.family === 'openai-compatible' && tokenParameter === 'max_tokens') {
            delete body.max_completion_tokens; body.max_tokens = prepared.outputTokens;
          }
          const response = await request(endpoint, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...(profile.family === 'anthropic'
              ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
              : { Authorization: `Bearer ${apiKey}` }) }, body: JSON.stringify(body),
          });
          if (interrupted()) { void response.body?.cancel().catch(() => {}); return providerFailure(code); }
          if (!response.ok) {
            await response.body?.cancel();
            return providerFailure(response.status === 401 || response.status === 403 ? 'unauthorized' : response.status === 429 ? 'rate-limited' : 'provider-unavailable');
          }
          const length = response.headers.get('content-length');
          if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxResponseBytes)) { await response.body?.cancel(); return providerFailure('response-too-large'); }
          const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
          if (contentType !== 'application/json' || !response.body) { await response.body?.cancel(); return providerFailure('invalid-response'); }
          reader = response.body.getReader();
          const joined = new Uint8Array(maxResponseBytes); let bytes = 0, chunksRead = 0;
          while (true) {
            if (interrupted()) return providerFailure(code);
            // Immediate empty reads must not starve the caller's abort or timeout.
            if (++chunksRead % 64 === 0) { await yieldEventLoop(); if (interrupted()) return providerFailure(code); }
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxResponseBytes) { await reader.cancel(); return providerFailure('response-too-large'); }
            if (value.byteLength) joined.set(value, bytes - value.byteLength);
          }
          if (interrupted()) return providerFailure(code);
          let decoded;
          try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined.subarray(0, bytes))); }
          catch { return providerFailure('invalid-response'); }
          const normalized = parseProviderExchange(profile, prepared, decoded);
          return interrupted() ? providerFailure(code) : normalized;
        } catch { return providerFailure(controller.signal.aborted ? code : 'provider-unavailable'); }
        finally {
          if (controller.signal.aborted) void reader?.cancel().catch(() => {});
          reader?.releaseLock();
        }
      })();
      try { return await Promise.race([operation, aborted]); }
      finally {
        clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
        if (controller.signal.aborted) void reader?.cancel().catch(() => {});
      }
    },
  });
}
