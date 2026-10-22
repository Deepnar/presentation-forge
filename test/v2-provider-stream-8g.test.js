import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setImmediate as tick } from 'node:timers/promises';
import { createModelProvider } from '../src/agent/model-provider.js';
import { context, caps, wire } from './v2-provider-fixture.js';

function provider(family, fetch, overrides = {}) {
  assert.equal(typeof fetch, 'function');
  return createModelProvider({ family, id: 'stream-fixture', model: 'fixture-model',
    baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture-private-key', capabilities: caps(),
    timeoutMs: 1000, ...overrides }, { fetch });
}
function bytes(family) {
  const body = wire(family, []);
  if (family === 'anthropic') { body.stop_reason = 'end_turn'; body.content = [{ type: 'text', text: 'Café 🧪' }]; }
  else { body.choices[0].finish_reason = 'stop'; body.choices[0].message.content = 'Café 🧪'; }
  const text = JSON.stringify(body);
  return new TextEncoder().encode(text.padEnd(Math.max(256, new TextEncoder().encode(text).length), ' '));
}
const headers = () => new Headers({ 'content-type': 'application/json' });

for (const family of ['openai-compatible', 'anthropic']) {
  for (const cancel of [false, true]) test(`${family}: empty chunks cannot starve ${cancel ? 'caller cancellation' : 'deadline'}`, () => {
    const script = `import {createModelProvider} from './src/agent/model-provider.js';
      import {context,caps} from './test/v2-provider-fixture.js';
      const {context:ctx}=await context();
      const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(0));}});
      const provider=createModelProvider({family:${JSON.stringify(family)},id:'fixture',model:'fixture',
        baseURL:'https://fixture.invalid/v1',apiKey:'fixture-key',capabilities:caps(),timeoutMs:${cancel ? 300 : 20}},
        {fetch:async()=>new Response(stream,{headers:{'content-type':'application/json'}})});
      const controller=new AbortController();${cancel ? 'setTimeout(()=>controller.abort(),5);' : ''}
      console.log(JSON.stringify(await provider.exchange(ctx,{signal:controller.signal})));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 1500, killSignal: 'SIGKILL',
    });
    assert.equal(child.error, undefined, 'isolated stream must finish before its process watchdog');
    assert.equal(child.signal, null); assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).code, cancel ? 'cancelled' : 'timeout');
  });

  test(`${family}: monotonic expiry cancels before reader unlock`, async t => {
    const { context: ctx } = await context(); let now = 0, reads = 0, cancelled = 0, released = false;
    const events = []; t.mock.method(performance, 'now', () => now);
    const reader = {
      async read() { now = 100; return ++reads === 1 ? { done: false, value: bytes(family) } : { done: true }; },
      cancel() { if (released) return Promise.reject(new Error('released')); cancelled++; events.push('cancel'); return Promise.resolve(); },
      releaseLock() { released = true; events.push('release'); },
    };
    const p = provider(family, async () => ({ ok: true, headers: headers(), body: { getReader: () => reader } }), { timeoutMs: 20 });
    assert.equal((await p.exchange(ctx)).code, 'timeout');
    await tick(); assert.equal(cancelled, 1); assert.deepEqual(events, ['cancel', 'release']);
  });

  test(`${family}: elapsed header deadline cannot start a body reader`, async t => {
    const { context: ctx } = await context(); let now = 0, acquired = 0, cancelled = 0;
    t.mock.method(performance, 'now', () => now);
    const p = provider(family, async () => {
      now = 100;
      return { ok: true, headers: headers(), body: {
        cancel: async () => { cancelled++; }, getReader() { acquired++; throw new Error('late body'); },
      } };
    }, { timeoutMs: 20 });
    assert.equal((await p.exchange(ctx)).code, 'timeout');
    await tick(); assert.equal(acquired, 0); assert.equal(cancelled, 1);
  });

  test(`${family}: cancelled non-cooperating fetch fences its late body`, async () => {
    const { context: ctx } = await context(); let respond, acquired = 0, cancelled = 0;
    const controller = new AbortController();
    const p = provider(family, () => new Promise(resolve => { respond = resolve; }));
    const pending = p.exchange(ctx, { signal: controller.signal });
    controller.abort(); assert.equal((await pending).code, 'cancelled');
    respond({ ok: true, headers: headers(), body: {
      cancel: async () => { cancelled++; }, getReader() { acquired++; throw new Error('late body'); },
    } });
    await tick(); assert.equal(acquired, 0); assert.equal(cancelled, 1);
  });

  test(`${family}: timed-out non-cooperating read cannot continue consuming`, async () => {
    const { context: ctx } = await context(); let complete, reads = 0, released = 0, cancelled = 0;
    const reader = {
      read() { return ++reads === 1 ? new Promise(resolve => { complete = resolve; }) : Promise.resolve({ done: true }); },
      cancel: async () => { cancelled++; }, releaseLock() { released++; },
    };
    const p = provider(family, async () => ({ ok: true, headers: headers(), body: { getReader: () => reader } }), { timeoutMs: 20 });
    assert.equal((await p.exchange(ctx)).code, 'timeout');
    complete({ done: false, value: bytes(family) }); await tick();
    assert.equal(reads, 1); assert.equal(released, 1); assert.ok(cancelled >= 1);
  });

  test(`${family}: empty chunks and fragmented UTF8 fit the exact byte allowance`, async () => {
    const { context: ctx } = await context(); const encoded = bytes(family); let count = 0, offset = 0;
    const stream = new ReadableStream({ pull(c) {
      if (++count <= 5000) c.enqueue(new Uint8Array(0));
      else if (offset < encoded.length) c.enqueue(encoded.subarray(offset, ++offset));
      else c.close();
    } });
    const p = provider(family, async () => new Response(stream, { headers: headers() }), { maxResponseBytes: encoded.length, timeoutMs: 5000 });
    const result = await p.exchange(ctx);
    assert.equal(result.ok, true); assert.equal(result.text, 'Café 🧪'); assert.equal(result.outcome, 'text');
  });
}

for (const family of ['openai-compatible', 'anthropic']) {
  test(`${family}: caller cancellation fences a non-cooperating late read`, async () => {
    const { context: ctx } = await context(); let complete, reads = 0, released = 0, cancelled = 0;
    const controller = new AbortController();
    const reader = {
      read() { return ++reads === 1 ? new Promise(resolve => { complete = resolve; }) : Promise.resolve({ done: true }); },
      cancel: async () => { cancelled++; }, releaseLock() { released++; },
    };
    const p = provider(family, async () => ({ ok: true, headers: headers(), body: { getReader: () => reader } }));
    const pending = p.exchange(ctx, { signal: controller.signal }); await tick();
    controller.abort(); assert.equal((await pending).code, 'cancelled');
    complete({ done: false, value: bytes(family) }); await tick();
    assert.equal(reads, 1); assert.equal(released, 1); assert.ok(cancelled >= 1);
  });

  test(`${family}: response processing cannot publish success after its deadline`, async t => {
    const { context: ctx } = await context(); let now = 0;
    const encoded = bytes(family), parse = JSON.parse;
    t.mock.method(performance, 'now', () => now);
    t.mock.method(JSON, 'parse', function (text, ...args) {
      const value = Reflect.apply(parse, this, [text, ...args]);
      if (typeof text === 'string' && text.includes('Café 🧪')) now = 100;
      return value;
    });
    const p = provider(family, async () => new Response(encoded, { headers: headers() }), { timeoutMs: 20 });
    assert.equal((await p.exchange(ctx)).code, 'timeout');
  });
}
