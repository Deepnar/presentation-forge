import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTurnWorker } from '../packages/agent/turn-worker.ts';
import { fixture, rows, clockBackend } from './v2-turns-contract.js';
import { wire, caps } from './v2-provider-fixture.js';
import { reviewedEdit, expectedReview } from './v2-provider-contract.js';
import { approved, submit, workInput, safeStatus } from './v2-turn-worker-contract.js';

async function child(t, e, overrides = {}) {
  const process = fork(new URL('./v2-turn-worker-child.js', import.meta.url), [], {
    env: { ...globalThis.process.env, ...e.env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const queue = [], waiters = []; let errors = '';
  process.stdout.resume(); process.stderr.on('data', chunk => { errors += chunk; });
  process.on('message', message => { const waiter = waiters.shift(); if (waiter) waiter(message); else queue.push(message); });
  async function next() {
    if (queue.length) return queue.shift();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`worker message timeout: ${errors.slice(-500)}`)), 20000);
      waiters.push(message => { clearTimeout(timer); resolve(message); });
    });
  }
  t.after(async () => { if (process.exitCode === null && process.signalCode === null) { const exit = once(process, 'exit'); process.kill('SIGKILL'); await exit; } });
  assert.deepEqual(await next(), { ready: true });
  const exit = once(process, 'exit');
  return { next, start: input => process.send({ binding: e.binding, input, ...overrides }),
    finish: async () => { const message = await next(); assert.deepEqual(await exit, [0, null]); assert.ok(message.result, JSON.stringify(message)); return message.result; },
    kill: async () => { process.kill('SIGKILL'); assert.deepEqual(await exit, [null, 'SIGKILL']); } };
}

export function turnWorkerProcessContract(label, setup) {
  const check = (name, fn) => test(`${label} turn worker process: ${name}`, { timeout: 45000 }, fn);
  check('two independent preparation consumers dispatch only once', async t => {
    const e = await fixture(t, setup), s = await submit(e), [a, b] = await Promise.all([child(t, e), child(t, e)]);
    a.start(workInput(s, { workerId: 'a' })); b.start(workInput(s, { workerId: 'b' }));
    const values = await Promise.all([a.finish(), b.finish()]);
    assert.equal(values.filter(x => x.phase === 'prepare').length, 1);
    assert.equal((await rows(e)).attempts.length, 1); assert.equal((await rows(e)).proposals.length, 1);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });
  check('two independent approved consumers commit one receipt and one saved revision', async t => {
    const e = await fixture(t, setup), q = await approved(e), [a, b] = await Promise.all([child(t, e), child(t, e)]);
    a.start(workInput(q, { workerId: 'a' })); b.start(workInput(q, { workerId: 'b' }));
    const values = await Promise.all([a.finish(), b.finish()]);
    assert.equal(values.reduce((n, x) => n + x.advances, 0), 1);
    assert.equal((await e.runtime.inspect(e.binding, q.turn.run.id)).receipts.length, 1);
    assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2);
  });
  for (const fault of ['reserved', 'dispatched', 'receipt']) check(`SIGKILL after ${fault} retains canonical preparation recovery`, async t => {
    const e = await fixture(t, setup), s = await submit(e), old = await child(t, e, { fault });
    old.start(workInput(s)); assert.deepEqual(await old.next(), { phase: fault }); await old.kill();
    const c = clockBackend(e.store); c.clock.offset = 31000;
    const recovered = await createTurnWorker(c.backend, e.provider).work(e.binding, workInput(s, { workerId: 'restart' }));
    assert.equal(recovered.turn.state, fault === 'reserved' ? 'awaiting-decision' : 'needs-user-action');
    assert.equal(e.seen.length, fault === 'reserved' ? 1 : 0);
    assert.equal((await rows(e)).attempts.length, fault === 'reserved' ? 2 : 1);
    assert.equal((await rows(e)).runs.length, 1);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc); safeStatus(recovered);
  });
  for (const fault of ['run-uncommitted', 'run-committed']) check(`SIGKILL ${fault} reopens without lost or repeated edits`, async t => {
    const e = await fixture(t, setup), q = await approved(e), old = await child(t, e, { fault });
    old.start(workInput(q)); assert.deepEqual(await old.next(), { phase: fault }); await old.kill();
    assert.equal((await e.store.getProject(e.binding)).doc.revision, fault === 'run-committed' ? 1 : 0);
    const c = clockBackend(e.store); c.clock.offset = 11000;
    const recovered = await createTurnWorker(c.backend).work(e.binding, workInput(q, { workerId: 'restart' }));
    assert.equal(recovered.run.status, 'succeeded'); assert.equal(recovered.advances, fault === 'run-committed' ? 0 : 1);
    assert.equal((await e.runtime.inspect(e.binding, q.turn.run.id)).receipts.length, 1);
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
    assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2);
  });
  workerCliContract(label, setup);
}

async function cliRig(t, e, handler) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'forge-turn-worker-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let notify; const arrived = new Promise(resolve => { notify = resolve; }); let calls = 0;
  const server = createServer(async (req, res) => { for await (const _ of req) {} calls++; notify();
    if (handler) return handler(req, res);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire('openai-compatible', [reviewedEdit()])));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const providerFile = path.join(dir, 'provider.json');
  await writeFile(providerFile, JSON.stringify({ id: 'fixture-provider', family: 'openai-compatible', model: 'operator-model',
    capabilities: caps(), apiKey: 'fixture-private-key', baseURL: `http://127.0.0.1:${server.address().port}/v1` }));
  async function start(input, { provider = providerFile } = {}) {
    const file = path.join(dir, crypto.randomUUID() + '.json'); await writeFile(file, JSON.stringify(input));
    const args = ['src/agent/turn-cli.js', 'work', '--project', e.binding.id, '--owner', e.binding.owner, '--input', file];
    if (provider) args.push('--provider', provider);
    const process = spawn(globalThis.process.execPath, args, { env: { ...globalThis.process.env, ...e.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; process.stdout.on('data', chunk => { stdout += chunk; }); process.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => process.kill('SIGKILL'), 20000);
    const done = new Promise((resolve, reject) => {
      process.on('error', reject); process.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr,
        value: stdout.trim() ? JSON.parse(stdout) : null }); });
    });
    t.after(async () => { if (process.exitCode === null && process.signalCode === null) { process.kill('SIGKILL'); await done; } });
    return { done, process };
  }
  return { start, arrived, calls: () => calls };
}
export function workerCliContract(label, setup) {
  const check = (name, fn) => test(`${label} turn worker CLI: ${name}`, { timeout: 30000 }, fn);
  check('explicit provider preparation and provider-free approved work share stored authority', async t => {
    const e = await fixture(t, setup), s = await submit(e), cli = await cliRig(t, e);
    const prepared = await (await cli.start(workInput(s))).done;
    assert.equal(prepared.code, 0); assert.equal(prepared.value.turn.state, 'awaiting-decision'); safeStatus(prepared.value);
    const p = await e.service.inspect(e.binding, { generation: s.generation, turnId: s.turn.id });
    const { decision } = await import('./v2-turns-contract.js');
    const q = await e.service.decide(e.binding, decision(p, p.turn));
    const executed = await (await cli.start(workInput(q), { provider: '/unread-fixture-private-key/no-such-file' })).done;
    assert.equal(executed.code, 0); assert.equal(executed.value.run.status, 'succeeded'); assert.equal(executed.value.advances, 1);
    assert.equal(cli.calls(), 1); safeStatus(executed.value);
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
    const repeated = await (await cli.start(workInput(q), { provider: '/unread-fixture-private-key/no-such-file' })).done;
    assert.equal(repeated.code, 0); assert.equal(repeated.value.advances, 0);
  });
  check('unknown work authority and malformed provider inputs produce fixed private errors', async t => {
    const e = await fixture(t, setup), s = await submit(e), cli = await cliRig(t, e);
    const bad = await (await cli.start({ ...workInput(s), owner: 'fixture-private-key' })).done;
    assert.equal(bad.code, 1); assert.equal(bad.value, null); assert.equal(bad.stderr.includes('fixture-private-key'), false);
    const missing = await (await cli.start(workInput(s), { provider: '/fixture-private-key/missing' })).done;
    assert.equal(missing.code, 1); assert.equal(missing.stderr.includes('fixture-private-key'), false);
    assert.equal(cli.calls(), 0); assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });
  check('a held execution lease exits nonzero without an edit or provider access', async t => {
    const e = await fixture(t, setup), q = await approved(e), cli = await cliRig(t, e);
    assert.equal((await e.runtime.claim(e.binding, q.turn.run.id, 'other-host', 30000)).ok, true);
    const value = await (await cli.start(workInput(q), { provider: '/unread-fixture-private-key/missing' })).done;
    assert.equal(value.code, 1); assert.equal(value.value.reason, 'busy'); assert.equal(value.value.advances, 0);
    assert.equal(value.value.run.status, 'running'); assert.equal(cli.calls(), 0); safeStatus(value.value);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
    assert.equal((await e.runtime.inspect(e.binding, q.turn.run.id)).receipts.length, 0);
  });
  check('preparation already held by another host exits nonzero without dispatch', async t => {
    let notify; const arrived = new Promise(resolve => { notify = resolve; });
    const e = await fixture(t, setup, { handler: () => { notify(); } }), s = await submit(e), cli = await cliRig(t, e);
    const controller = new AbortController();
    const pending = createTurnWorker(e.store, e.provider).work(e.binding, workInput(s), { signal: controller.signal });
    t.after(async () => { controller.abort(); await pending; });
    await arrived;
    const value = await (await cli.start(workInput(s, { workerId: 'other-host' }), { provider: '/unread-fixture-private-key/missing' })).done;
    assert.equal(value.code, 1); assert.equal(value.value.turn.state, 'preparing'); assert.equal(value.value.advances, 0);
    assert.equal(cli.calls(), 0); assert.equal(e.seen.length, 1); safeStatus(value.value);
    controller.abort(); assert.equal((await pending).turn.state, 'cancelled');
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });
  check('a provider refusal exits nonzero and retains only fixed private status', async t => {
    const e = await fixture(t, setup), s = await submit(e), cli = await cliRig(t, e, (_req, res) => {
      res.writeHead(503); res.end('fixture-private-key');
    });
    const value = await (await cli.start(workInput(s))).done;
    assert.equal(value.code, 1); assert.equal(value.value.turn.state, 'refused'); assert.equal(cli.calls(), 1);
    assert.equal(value.stderr.includes('fixture-private-key'), false); safeStatus(value.value);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });
  for (const signal of ['SIGTERM', 'SIGINT']) check(`${signal} during preparation closes the CLI without publishing`, async t => {
    const e = await fixture(t, setup), s = await submit(e), cli = await cliRig(t, e, () => {});
    const child = await cli.start(workInput(s)); await cli.arrived; child.process.kill(signal);
    const result = await child.done; assert.equal(result.signal, null); assert.equal(result.code, 1);
    assert.equal(result.value.turn.state, 'cancelled'); safeStatus(result.value);
    assert.equal(result.stderr.includes('fixture-private-key'), false); assert.equal(cli.calls(), 1);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });
}
