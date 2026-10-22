import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createModelProvider } from '../../src/agent/model-provider.js';
import { context, caps, wire } from '../../test/v2-provider-fixture.js';

const root = 'docs/v2-8g-evidence';
const sha = JSON.parse(await readFile(`${root}/validation-plan.json`, 'utf8')).implementationSha;
const [, , mode, family, count] = process.argv;

if (mode === '--sample') {
  assert.equal(typeof global.gc, 'function');
  const emptyChunks = Number(count), maxResponseBytes = 256 * 1024;
  assert.ok(['openai-compatible', 'anthropic'].includes(family));
  assert.ok([5000, 200000].includes(emptyChunks));
  const { context: ctx } = await context();
  const body = wire(family, []);
  if (family === 'anthropic') {
    body.stop_reason = 'end_turn'; body.content = [{ type: 'text', text: 'Bounded fixture' }];
  } else {
    body.choices[0].finish_reason = 'stop'; body.choices[0].message.content = 'Bounded fixture';
  }
  const encoded = new TextEncoder().encode(JSON.stringify(body));
  let reads = 0, sent = false, released = 0, fetches = 0;
  const samples = [];
  function observe(phase) {
    global.gc();
    samples.push({ phase, reads, ...process.memoryUsage() });
  }
  observe('before-exchange');
  const reader = {
    async read() {
      if (reads < emptyChunks) {
        reads++;
        if (reads === 1 || reads % 25000 === 0) observe('empty-read');
        return { done: false, value: new Uint8Array(0) };
      }
      if (!sent) { sent = true; observe('before-payload'); return { done: false, value: encoded }; }
      return { done: true };
    },
    async cancel() {},
    releaseLock() { released++; },
  };
  const provider = createModelProvider({ family, id: 'resource-fixture', model: 'fixture',
    baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture-private-key', capabilities: caps(),
    timeoutMs: 10000, maxResponseBytes }, { fetch: async () => {
    fetches++;
    return { ok: true, headers: new Headers({ 'content-type': 'application/json' }),
      body: { getReader: () => reader } };
  } });
  const at = performance.now(), result = await provider.exchange(ctx), durationMs = performance.now() - at;
  assert.equal(result.ok, true); assert.equal(result.text, 'Bounded fixture');
  assert.equal(reads, emptyChunks); assert.equal(fetches, 1); assert.equal(released, 1);
  observe('after-exchange');
  const before = samples[0];
  const maxima = Object.fromEntries(['rss', 'heapUsed', 'external', 'arrayBuffers'].map(key =>
    [key, Math.max(...samples.slice(1).map(sample => sample[key])) - before[key]]));
  console.log(JSON.stringify({ family, emptyChunks, maxResponseBytes, durationMs, fetches,
    result: { ok: result.ok, outcome: result.outcome }, observedMaximumDeltaBytes: maxima, samples }));
} else {
  assert.equal(mode, undefined);
  const records = [];
  for (const family of ['openai-compatible', 'anthropic']) for (const emptyChunks of [5000, 200000]) {
    const command = [process.execPath, '--expose-gc', import.meta.filename, '--sample', family, String(emptyChunks)];
    const child = spawnSync(command[0], command.slice(1), { encoding: 'utf8', timeout: 15000, killSignal: 'SIGKILL' });
    assert.equal(child.error, undefined); assert.equal(child.signal, null);
    assert.equal(child.status, 0, child.stderr);
    records.push({ command, exitCode: child.status, ...JSON.parse(child.stdout) });
  }
  const result = { implementationSha: sha, fixtureRuns: records.length, records,
    realModelApiCalls: 0, localInferenceCalls: 0,
    method: 'Fresh isolated Node process per scenario; accepted 256KiB response allowance; injected reader; full-GC memory observations before, during and after 5,000/200,000 empty chunks, followed by a valid response.',
    limitation: 'Observed sampled retained memory and RSS only; sampling/GC changes timing. These are not process peak RSS, allocator limits, production percentiles or live-model performance. Functional stream tests separately exercise deadlines and cancellation.' };
  await writeFile(`${root}/stream-resources.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ fixtureRuns: records.length, records: records.map(({ samples, command, ...record }) => record) }, null, 2));
}
