import { cloneJson } from '../../packages/tools/json.ts';
import { searchBinding, searchRequest, normalizeWebResults, searchFailure } from '../../packages/agent/search.ts';

export function createSearxngSearchProvider(config = {}, { fetch: request = globalThis.fetch } = {}) {
  let id, endpoint, timeoutMs, maxResponseBytes, maxOutputChars;
  try {
    const copied = cloneJson(config, 4096);
    if (!copied || Array.isArray(copied) || Object.keys(copied).some(k => !['id','baseURL','timeoutMs','maxResponseBytes','maxOutputChars'].includes(k))) throw new Error();
    id = copied.id ?? 'searxng';
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(id)) throw new Error();
    const base = new URL(copied.baseURL ?? 'http://localhost:8888');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (base.username || base.password || base.search || base.hash || !['https:', ...(local ? ['http:'] : [])].includes(base.protocol)) throw new Error();
    base.pathname = base.pathname.replace(/\/$/u, '') + '/search'; endpoint = base.href;
    timeoutMs = copied.timeoutMs ?? 20000; maxResponseBytes = copied.maxResponseBytes ?? 262144; maxOutputChars = copied.maxOutputChars ?? 32000;
    for (const [value,min,max] of [[timeoutMs,1,120000],[maxResponseBytes,256,1048576],[maxOutputChars,1024,65536]])
      if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error();
    if (typeof request !== 'function') throw new Error();
  } catch { throw new Error('Invalid search backend configuration.'); }
  return Object.freeze({ id,
    async search(binding, input, options = {}) {
      const bound = searchBinding(binding), query = searchRequest(input);
      let signal;
      try {
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error();
        for (const key of Reflect.ownKeys(options)) {
          const desc = Object.getOwnPropertyDescriptor(options, key);
          if (key !== 'signal' || !desc.enumerable || !('value' in desc)) throw new Error();
          signal = desc.value;
        }
        if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error();
      } catch { return searchFailure('invalid-request'); }
      if (!bound || !query) return searchFailure('invalid-request');
      if (signal?.aborted) return searchFailure('cancelled');
      const controller = new AbortController();
      let code = 'timeout', timer, reader, onAbort;
      const aborted = new Promise(resolve => {
        onAbort = () => { code = 'cancelled'; controller.abort(); resolve(searchFailure(code)); };
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => { controller.abort(); resolve(searchFailure(code)); }, timeoutMs);
      });
      const operation = (async () => {
        try {
          const body = new URLSearchParams({ q: query.query, format: 'json', categories: 'general', language: query.language ?? 'en' });
          if (query.timeRange) body.set('time_range', query.timeRange);
          // Only the query reaches the configured backend; project identity stays local.
          const response = await request(endpoint, { method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PresentationForge/2' }, body: body.toString() });
          if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return searchFailure(code); }
          if (!response.ok) {
            await response.body?.cancel();
            return searchFailure([401,403].includes(response.status) ? 'search-denied' : response.status === 429 ? 'rate-limited' : 'search-unavailable');
          }
          const length = response.headers.get('content-length');
          if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxResponseBytes)) { await response.body?.cancel(); return searchFailure('response-too-large'); }
          if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !response.body) {
            await response.body?.cancel(); return searchFailure('invalid-response');
          }
          reader = response.body.getReader();
          const chunks = []; let bytes = 0;
          while (true) {
            if (controller.signal.aborted) return searchFailure(code);
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxResponseBytes) { await reader.cancel(); return searchFailure('response-too-large'); }
            chunks.push(value);
          }
          if (controller.signal.aborted) return searchFailure(code);
          const joined = new Uint8Array(bytes); let offset = 0;
          for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
          let decoded;
          try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); }
          catch { return searchFailure('invalid-response'); }
          return normalizeWebResults(id, bound, query, decoded, { maxOutputChars });
        } catch { return searchFailure(controller.signal.aborted ? code : 'search-unavailable'); }
        finally { reader?.releaseLock(); }
      })();
      try { return await Promise.race([operation, aborted]); }
      finally {
        clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
        if (controller.signal.aborted) void reader?.cancel().catch(() => {});
      }
    },
  });
}
