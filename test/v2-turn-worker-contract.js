import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnWorker } from '../packages/agent/turn-worker.ts';
import { createRuntime } from '../packages/agent/runtime.ts';
import { advanceTurnRun } from '../packages/agent/turn-work-execution.ts';
import { createTurnService } from '../packages/agent/turns.ts';
import { parsePlan, planDigest } from '../packages/agent/run-state.ts';
import { fixture, proposed, submission, decision, rows, clockBackend } from './v2-turns-contract.js';
import { wire } from './v2-provider-fixture.js';
import { reviewedEdit, expectedReview } from './v2-provider-contract.js';

export const workInput = (state, extra = {}) => ({ generation: state.generation,
  turnId: state.turn.id, workerId: 'worker-1', ...extra });
export const submit = e => e.service.submit(e.binding, submission(e, e.state));
export async function approved(e) {
  const p = await proposed(e);
  return e.service.decide(e.binding, decision(p, p.turn));
}
export function safeStatus(value) {
  const text = JSON.stringify(value);
  for (const secret of ['Review this wording.', 'fixture-private-key', 'Reviewed score', 'Unrelated private slide',
    'paragraphs', 'proposal', 'instructions', 'receipts', 'private_payload', 'Authorization'])
    assert.equal(text.includes(secret), false, secret);
  assert.ok(text.length < 8192);
}

// A matching B digest cannot relax H's stricter one-batch proposal invariant.
async function expandedProposal(e, count = 9) {
  const p = await proposed(e);
  await e.store.withRuntimeTransaction(e.binding, async tx => {
    const [row] = await tx.query('SELECT payload,private_payload FROM v2_agent_proposals WHERE id=? AND project_id=?',
      [p.turn.proposal.id, e.binding.id]);
    const meta = JSON.parse(row.payload), original = JSON.parse(row.private_payload);
    assert.equal(original.steps.length, 1);
    const plan = parsePlan({ ...original, maxSteps: 16,
      steps: Array.from({ length: count }, () => structuredClone(original.steps[0])) });
    meta.digest = await planDigest(plan);
    await tx.query('UPDATE v2_agent_proposals SET payload=?,private_payload=? WHERE id=? AND project_id=?',
      [JSON.stringify(meta), JSON.stringify(plan), meta.id, e.binding.id]);
  });
  return p;
}

async function canonicalMultiStep(e) {
  return e.runtime.start(e.binding, parsePlan({ ...e.plan, requestId: crypto.randomUUID(), maxSteps: 16,
    steps: Array.from({ length: 9 }, () => structuredClone(e.plan.steps[0])) }));
}
function expectedCanonical(e) {
  const scenes = structuredClone(e.doc.scenes);
  scenes[0].elements[0].paragraphs[0].runs[0].text = 'Human-reviewed ';
  scenes[0].elements[0].provenance = 'human';
  scenes[0].elements[0].contentCustomized = true;
  return scenes;
}

export function turnWorkerContract(label, setup) {
  const check = (name, fn) => test(`${label} turn worker: ${name}`, { timeout: 30000 }, fn);
  check('exact-turn lookup returns one owner and generation-bound turn', async t => {
    const e = await fixture(t, setup), s = await submit(e), input = workInput(s);
    const one = await e.service.inspect(e.binding, { generation: s.generation, turnId: s.turn.id });
    assert.equal(one.turn.id, s.turn.id);
    assert.equal((await e.service.inspect(e.binding, { generation: 'old', turnId: s.turn.id })).code, 'stale-generation');
    assert.equal((await e.service.inspect(e.binding, { generation: s.generation, turnId: 'missing' })).code, 'not-found');
    await assert.rejects(e.service.inspect({ ...e.binding, owner: 'foreign' }, input), { code: 'invalid-document' });
    await assert.rejects(e.service.inspect({ ...e.binding, owner: 'foreign' }, { generation: s.generation, turnId: s.turn.id }), { code: 'not-found' });
    await assert.rejects(e.service.inspect(e.binding, { generation: s.generation, turnId: s.turn.id, owner: 'foreign' }));
    assert.equal(e.seen.length, 0);
  });
  check('preparation returns private status and waits for a separate explicit decision', async t => {
    const e = await fixture(t, setup), s = await submit(e), w = createTurnWorker(e.store, e.provider);
    const result = await w.work(e.binding, workInput(s));
    assert.equal(result.ok, true); assert.equal(result.phase, 'prepare');
    assert.equal(result.turn.state, 'awaiting-decision'); assert.equal(result.run, null);
    assert.equal(result.advances, 0); safeStatus(result);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
    const again = await w.work(e.binding, workInput(s));
    assert.equal(again.phase, 'observe'); assert.equal(again.turn.state, 'awaiting-decision');
    assert.equal(e.seen.length, 1); assert.equal((await rows(e)).runs.length, 1);
  });
  check('provider-free approved execution reopens canonical history and cannot repeat an edit', async t => {
    const e = await fixture(t, setup), q = await approved(e), w = createTurnWorker(e.store);
    const result = await w.work(e.binding, workInput(q));
    assert.equal(result.ok, true); assert.equal(result.phase, 'execute');
    assert.equal(result.run.status, 'succeeded'); assert.equal(result.advances, 1); safeStatus(result);
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
    assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2);
    const reopened = createTurnWorker(e.store);
    const repeat = await reopened.work(e.binding, workInput(q));
    assert.equal(repeat.advances, 0); assert.equal(repeat.run.status, 'succeeded');
    assert.equal((await e.runtime.inspect(e.binding, q.turn.run.id)).receipts.length, 1);
    assert.equal(e.seen.length, 1);
  });
  check('missing provider refuses before dispatch and never selects a fallback', async t => {
    const e = await fixture(t, setup), s = await submit(e);
    assert.deepEqual(await createTurnWorker(e.store).work(e.binding, workInput(s)), { ok: false, code: 'provider-required' });
    assert.equal((await e.service.inspect(e.binding, { generation: s.generation, turnId: s.turn.id })).turn.state, 'submitted');
    assert.equal(e.seen.length, 0); assert.equal((await rows(e)).attempts.length, 0);
  });
  check('invalid input, authority, accessors and options cannot invoke work', async t => {
    const e = await fixture(t, setup), s = await submit(e), w = createTurnWorker(e.store, e.provider), input = workInput(s);
    for (const extra of [{ owner: 'foreign' }, { runId: e.run.id }, { plan: e.plan }, { provider: 'secret' }])
      await assert.rejects(w.work(e.binding, { ...input, ...extra }), { code: 'invalid-document' });
    let invoked = 0;
    const unsafe = { ...input }; Object.defineProperty(unsafe, 'workerId', { enumerable: true, get() { invoked++; return 'unsafe'; } });
    await assert.rejects(w.work(e.binding, unsafe));
    const binding = { ...e.binding }; Object.defineProperty(binding, 'owner', { enumerable: true, get() { invoked++; return 'owner'; } });
    await assert.rejects(w.work(binding, input));
    const options = {}; Object.defineProperty(options, 'signal', { enumerable: true, get() { invoked++; return undefined; } });
    await assert.rejects(w.work(e.binding, input, options));
    for (const options of [{ signal: 'bad' }, { owner: 'foreign' }, []]) await assert.rejects(w.work(e.binding, input, options));
    for (const value of ['', 'x'.repeat(129), 1]) await assert.rejects(w.work(e.binding, { ...input, workerId: value }));
    assert.equal(invoked, 0); assert.equal(e.seen.length, 0);
  });
  check('synchronous snapshots survive same-owner binding, input and option reuse', async t => {
    const e = await fixture(t, setup), s = await submit(e), other = await e.store.createProject({ owner: 'owner', title: 'Other', scenes: e.doc.scenes });
    const binding = { ...e.binding }, input = workInput(s), controller = new AbortController(), options = { signal: controller.signal };
    const pending = createTurnWorker(e.store, e.provider).work(binding, input, options);
    binding.id = other.doc.id; input.turnId = 'different'; input.generation = 'other'; options.signal = AbortSignal.abort();
    const value = await pending; assert.equal(value.turn.id, s.turn.id); assert.equal(value.turn.state, 'awaiting-decision');
    assert.deepEqual((await e.store.getProject({ owner: 'owner', id: other.doc.id })).doc, other.doc);
    const lookup = { generation: s.generation, turnId: s.turn.id }, reused = { ...e.binding };
    const inspected = e.service.inspect(reused, lookup); reused.id = other.doc.id; lookup.turnId = 'different';
    assert.equal((await inspected).turn.id, s.turn.id);
  });
  check('a busy preparation is observed without retrying or double dispatch', async t => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const e = await fixture(t, setup, { handler: async (_req, res) => {
      await held; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire('openai-compatible', [reviewedEdit()])));
    } });
    t.after(() => release()); const s = await submit(e), a = createTurnWorker(e.store, e.provider).work(e.binding, workInput(s));
    await e.arrived;
    const b = await createTurnWorker(e.store, e.provider).work(e.binding, workInput(s, { workerId: 'other' }));
    assert.equal(b.phase, 'observe'); assert.equal(b.turn.state, 'preparing');
    release(); assert.equal((await a).turn.state, 'awaiting-decision'); assert.equal(e.seen.length, 1);
  });
  check('competing approved workers execute exactly one saved batch', async t => {
    const e = await fixture(t, setup), q = await approved(e);
    const values = await Promise.all(['a', 'b'].map(workerId => createTurnWorker(e.store).work(e.binding, workInput(q, { workerId }))));
    assert.equal(values.reduce((n, x) => n + x.advances, 0), 1);
    assert.equal((await e.runtime.inspect(e.binding, q.turn.run.id)).receipts.length, 1);
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
  });
  check('pre-aborted preparation and approved work dispatch no new operations', async t => {
    const e = await fixture(t, setup), s = await submit(e), signal = AbortSignal.abort();
    const waiting = await createTurnWorker(e.store, e.provider).work(e.binding, workInput(s), { signal });
    assert.equal(waiting.reason, 'aborted'); assert.equal(waiting.turn.state, 'submitted'); assert.equal(e.seen.length, 0);
    const prepared = await e.service.prepare(e.binding, { generation: s.generation, turnId: s.turn.id, revision: s.turn.revision, workerId: 'prepare' }, e.provider);
    const q = await e.service.decide(e.binding, decision(prepared, prepared.turn));
    const untouched = await createTurnWorker(e.store).work(e.binding, workInput(q), { signal });
    assert.equal(untouched.run.status, 'queued'); assert.equal(untouched.advances, 0);
    assert.equal((await e.runtime.inspect(e.binding, q.turn.run.id)).receipts.length, 0);
  });
  check('aborting dispatched preparation cancels its visible turn without publishing edits', async t => {
    const e = await fixture(t, setup, { handler: () => {} }), s = await submit(e), controller = new AbortController();
    const pending = createTurnWorker(e.store, e.provider).work(e.binding, workInput(s), { signal: controller.signal });
    await e.arrived; controller.abort(); const value = await pending;
    assert.equal(value.turn.state, 'cancelled'); assert.equal(value.run, null); safeStatus(value);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
    await createTurnWorker(e.store, e.provider).work(e.binding, workInput(s)); assert.equal(e.seen.length, 1);
  });
  check('clear during provider work refuses late publication and preserves the deck', async t => {
    let release; const held = new Promise(resolve => { release = resolve; });
    const e = await fixture(t, setup, { handler: async (_req, res) => { await held; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire('openai-compatible', [reviewedEdit()]))); } });
    t.after(() => release()); const s = await submit(e), pending = createTurnWorker(e.store, e.provider).work(e.binding, workInput(s));
    await e.arrived; const now = await e.service.read(e.binding);
    await e.service.clear(e.binding, { generation: now.generation, revision: now.revision }); release();
    assert.equal((await pending).ok, false); assert.equal((await e.service.read(e.binding)).turns.length, 0);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
    assert.equal((await createTurnWorker(e.store).work(e.binding, workInput(s))).code, 'stale-generation');
  });
  check('cancelled, rejected and cleared approval cannot execute', async t => {
    for (const action of ['cancel', 'reject', 'clear']) {
      const e = await fixture(t, setup), p = await proposed(e); let state = p;
      if (action !== 'reject') state = await e.service.decide(e.binding, decision(p, p.turn));
      if (action === 'cancel') await e.service.cancel(e.binding, { generation: state.generation, revision: state.revision, turnId: state.turn.id });
      if (action === 'reject') await e.service.decide(e.binding, decision(p, p.turn, { decision: 'reject' }));
      if (action === 'clear') await e.service.clear(e.binding, { generation: state.generation, revision: state.revision });
      const value = await createTurnWorker(e.store).work(e.binding, workInput(state));
      if (action === 'clear') assert.equal(value.code, 'stale-generation');
      else { assert.equal(value.advances, 0); assert.equal(value.turn.state, action === 'reject' ? 'rejected' : 'cancelled'); }
      assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
    }
  });
  check('owner revocation and deletion deny work without provider dispatch', async t => {
    for (const action of ['owner', 'delete']) {
      const e = await fixture(t, setup), s = await submit(e);
      if (action === 'owner') await e.store.withRuntimeTransaction(e.binding, tx => tx.query('UPDATE v2_projects SET owner=? WHERE id=?', ['other', e.binding.id]));
      else await e.store.deleteProject(e.binding);
      await assert.rejects(createTurnWorker(e.store, e.provider).work(e.binding, workInput(s)), { code: 'not-found' });
      assert.equal(e.seen.length, 0);
    }
  });
  check('a human save after approval wins over queued execution', async t => {
    const e = await fixture(t, setup), q = await approved(e), scenes = structuredClone(e.doc.scenes);
    scenes[0].elements[0].paragraphs[0].runs[0].text = 'Human won';
    const saved = await e.store.saveProject({ ...e.binding, baseRevision: 0, scenes });
    const value = await createTurnWorker(e.store).work(e.binding, workInput(q));
    assert.equal(value.run.status, 'failed'); assert.equal(value.run.code, 'stale-project'); assert.equal(value.advances, 0);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, saved.doc);
  });
  check('provider refusal settles once without fallback, private result or automatic retry', async t => {
    const e = await fixture(t, setup, { handler: (_req, res) => { res.writeHead(503); res.end('fixture-private-key'); } }), s = await submit(e);
    const w = createTurnWorker(e.store, e.provider), value = await w.work(e.binding, workInput(s));
    assert.equal(value.turn.state, 'refused'); safeStatus(value); assert.equal(value.run, null);
    assert.equal((await w.work(e.binding, workInput(s))).advances, 0); assert.equal(e.seen.length, 1);
  });
  check('unexpected backend errors are fixed even on the final status read', async t => {
    const e = await fixture(t, setup), s = await submit(e);
    let calls = 0;
    const backend = { withRuntimeTransaction: async (...args) => {
      if (++calls === 2) throw Object.assign(new Error('fixture-private-key database URI'), { code: 'fixture-private-key' });
      return e.store.withRuntimeTransaction(...args);
    } };
    await assert.rejects(createTurnWorker(backend).work(e.binding, workInput(s), { signal: AbortSignal.abort() }), error => {
      assert.equal(error.code, 'worker-failed'); assert.equal(error.message, 'Turn worker operation failed.');
      assert.equal(error.stack.includes('fixture-private-key'), false); return true;
    });
  });
  check('approval before the final read returns current persisted status without executing', async t => {
    const e = await fixture(t, setup), s = await submit(e); let decided = false;
    const backend = { withRuntimeTransaction: async (...args) => {
      const value = await e.store.withRuntimeTransaction(...args);
      if (!decided && value?.turn?.state === 'awaiting-decision') {
        decided = true; await e.service.decide(e.binding, decision(value, value.turn));
      }
      return value;
    } };
    const value = await createTurnWorker(backend, e.provider).work(e.binding, workInput(s));
    assert.equal(value.phase, 'prepare'); assert.equal(value.turn.state, 'approved');
    assert.equal(value.run.status, 'queued'); assert.equal(value.advances, 0); safeStatus(value);
  });
  check('clear after lookup fences the cached approval and suppresses cached status', async t => {
    const e = await fixture(t, setup), q = await approved(e); let cleared = false;
    const backend = { withRuntimeTransaction: async (...args) => {
      const value = await e.store.withRuntimeTransaction(...args);
      if (!cleared && value?.turn?.state === 'approved') {
        cleared = true; await e.service.clear(e.binding, { generation: value.generation, revision: value.revision });
      }
      return value;
    } };
    assert.deepEqual(await createTurnWorker(backend).work(e.binding, workInput(q)), { ok: false, code: 'stale-generation' });
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });
  check('revocation after publication is enforced by the final status read', async t => {
    const e = await fixture(t, setup), s = await submit(e); let revoked = false;
    const backend = { withRuntimeTransaction: async (...args) => {
      const value = await e.store.withRuntimeTransaction(...args);
      if (!revoked && value?.turn?.state === 'awaiting-decision') {
        revoked = true;
        await e.store.withRuntimeTransaction(e.binding, tx => tx.query('UPDATE v2_projects SET owner=? WHERE id=?', ['other', e.binding.id]));
      }
      return value;
    } };
    await assert.rejects(createTurnWorker(backend, e.provider).work(e.binding, workInput(s)), error => {
      assert.equal(error.code, 'not-found'); assert.equal(error.message, 'Turn worker operation failed.'); return true;
    });
    assert.equal(e.seen.length, 1);
  });
  check('an expanded B-valid plan cannot bypass the single-batch H proposal contract', async t => {
    const e = await fixture(t, setup), p = await expandedProposal(e);
    await assert.rejects(e.service.decide(e.binding, decision(p, p.turn)), { code: 'invalid-document' });
    await assert.rejects(createTurnWorker(e.store).work(e.binding, workInput(p)), { code: 'invalid-document' });
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });
  check('the internal execution loop caps actual B steps without widening H proposals', async t => {
    const e = await fixture(t, setup), run = await canonicalMultiStep(e), c = clockBackend(e.store), runtime = createRuntime(c.backend);
    const a = await advanceTurnRun(runtime, e.binding, run.id, 'first');
    assert.deepEqual(a, { advances: 8, reason: 'step-limit' });
    const saved = await runtime.inspect(e.binding, run.id);
    assert.equal(saved.run.status, 'running'); assert.equal(saved.run.cursor, 8); assert.equal(saved.receipts.length, 8);
    assert.deepEqual(await advanceTurnRun(runtime, e.binding, run.id, 'busy'), { advances: 0, reason: 'busy' });
    c.clock.offset = 11000;
    assert.deepEqual(await advanceTurnRun(runtime, e.binding, run.id, 'restarted'), { advances: 1, reason: null });
    assert.equal((await runtime.inspect(e.binding, run.id)).run.status, 'succeeded');
    assert.equal((await runtime.inspect(e.binding, run.id)).receipts.length, 9);
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedCanonical(e));
    assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2);
  });
  check('shutdown after an entered B step yields without inventing user cancellation', async t => {
    const e = await fixture(t, setup), run = await canonicalMultiStep(e), controller = new AbortController(), c = clockBackend(e.store);
    const backend = { withRuntimeTransaction: (binding, job) => c.backend.withRuntimeTransaction(binding, tx => job({ ...tx,
      saveScenes: async (...args) => { const value = await tx.saveScenes(...args); controller.abort(); return value; } })) };
    assert.deepEqual(await advanceTurnRun(createRuntime(backend), e.binding, run.id, 'first', controller.signal), { advances: 1, reason: 'aborted' });
    assert.equal((await e.runtime.inspect(e.binding, run.id)).run.status, 'running'); c.clock.offset = 11000;
    assert.deepEqual(await advanceTurnRun(createRuntime(c.backend), e.binding, run.id, 'restart'), { advances: 8, reason: null });
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedCanonical(e));
  });
  check('an entered single-batch H commit reports persisted success despite shutdown', async t => {
    const e = await fixture(t, setup), q = await approved(e), controller = new AbortController();
    const backend = { withRuntimeTransaction: (binding, job) => e.store.withRuntimeTransaction(binding, tx => job({ ...tx,
      saveScenes: async (...args) => { const value = await tx.saveScenes(...args); controller.abort(); return value; } })) };
    const result = await createTurnWorker(backend).work(e.binding, workInput(q), { signal: controller.signal });
    assert.equal(controller.signal.aborted, true); assert.equal(result.run.status, 'succeeded'); assert.equal(result.advances, 1);
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
  });
  check('a lease lost after claim yields fixed status and no edit, then recovers canonically', async t => {
    const e = await fixture(t, setup), q = await approved(e), c = clockBackend(e.store); let expired = false;
    const backend = { withRuntimeTransaction: async (...args) => {
      const value = await c.backend.withRuntimeTransaction(...args);
      if (!expired && value?.ok && value.lease && value.run?.status === 'running') { expired = true; c.clock.offset = 11000; }
      return value;
    } };
    const value = await createTurnWorker(backend).work(e.binding, workInput(q));
    assert.equal(value.reason, 'lease-lost'); assert.equal(value.advances, 0); assert.equal(value.run.status, 'running'); safeStatus(value);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
    const recovered = await createTurnWorker(c.backend).work(e.binding, workInput(q, { workerId: 'restart' }));
    assert.equal(recovered.run.status, 'succeeded'); assert.equal(recovered.advances, 1);
  });
  check('the internal loop stops on actual renewal lease loss after one receipt', async t => {
    const e = await fixture(t, setup), run = await canonicalMultiStep(e), c = clockBackend(e.store); let expired = false;
    const backend = { withRuntimeTransaction: async (...args) => {
      const value = await c.backend.withRuntimeTransaction(...args);
      if (!expired && value?.receipt) { expired = true; c.clock.offset = 11000; }
      return value;
    } };
    assert.deepEqual(await advanceTurnRun(createRuntime(backend), e.binding, run.id, 'first'), { advances: 1, reason: 'lease-lost' });
    assert.equal((await e.runtime.inspect(e.binding, run.id)).receipts.length, 1);
    assert.deepEqual(await advanceTurnRun(createRuntime(c.backend), e.binding, run.id, 'restart'), { advances: 8, reason: null });
  });
}
