import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createProviderRunner } from '../packages/agent/provider-run.ts';
import { endpoint, wire } from './v2-provider-fixture.js';
import { reviewedEdit, expectedReview } from './v2-provider-contract.js';
import { edit, textEdit, target } from './v2-tool-fixture.js';
const exec = promisify(execFile);
export const turnInput = (env, changes = {}) => ({
  requestId: crypto.randomUUID(), projectRevision: env.doc.revision, scope: structuredClone(env.plan.scope),
  request: 'Review this slide wording and measured data.', reads: [{ tool: 'get_slide', args: { slideId: 's1' } }],
  deadlineAt: Date.now() + 60000, contextChars: 100000, maxOutputTokens: 2048, ...changes,
});
const respond = (res, data) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
async function fixture(t, setup, family, handler, backend) {
  const env = await setup(t);
  const http = await endpoint(t, family, handler ?? ((_req, res) => respond(res, wire(family, [reviewedEdit()]))));
  const runner = createProviderRunner(backend?.(env) ?? env.store, http.provider);
  return { ...env, ...http, runner, input: turnInput(env) };
}
async function runCount(env) {
  return env.store.withRuntimeTransaction(env.binding, async tx => Number((await tx.query(
    'SELECT count(*) AS n FROM v2_agent_runs WHERE project_id=?', [env.doc.id],
  ))[0].n));
}
async function unchanged(env) {
  assert.deepEqual((await env.store.getProject(env.binding)).doc, env.doc);
  assert.equal(await runCount(env), 1);
}
export function providerRunContract(backend, setup) {
  for (const family of ['openai-compatible', 'anthropic']) {
    const check = (name, body) => test(`${backend}/${family}: ${name}`, { timeout: 30000 }, t => body(t));
    check('previews one atomic batch, queues idempotently and executes after process restart', async t => {
      const env = await fixture(t, setup, family);
      const prepared = await env.runner.prepare(env.binding, env.input);
      assert.equal(prepared.outcome, 'edit-proposal'); assert.equal(prepared.editCount, 3);
      assert.deepEqual(prepared.edits, reviewedEdit().args.edits); await unchanged(env);
      assert.throws(() => { prepared.edits[0].text = 'Tampered'; }, TypeError);
      assert.throws(() => { prepared.summary.providerId = 'foreign'; }, TypeError);
      const queued = await env.runner.enqueue(prepared); assert.equal(queued.outcome, 'queued');
      assert.equal(queued.run.status, 'queued'); assert.equal(queued.run.stepCount, 1);
      const repeated = await Promise.all([env.runner.enqueue(prepared), env.runner.enqueue(prepared)]);
      assert.ok(repeated.every(r => r.run.id === queued.run.id)); assert.equal(await runCount(env), 2);
      assert.deepEqual((await env.store.getProject(env.binding)).doc, env.doc);
      await env.store.closeProjectStore();
      const worked = await exec(process.execPath, ['src/agent/cli.js', 'work', '--project', env.doc.id,
        '--owner', env.binding.owner, '--run', queued.run.id], { env: { ...process.env, ...env.env }, timeout: 30000 });
      assert.equal(JSON.parse(worked.stdout).run.status, 'succeeded');
      const after = (await env.store.getProject(env.binding)).doc;
      assert.equal(after.revision, 1); assert.deepEqual(after.scenes, expectedReview(env.doc));
      assert.equal((await env.runtime.inspect(env.binding, queued.run.id)).receipts.length, 1);
      assert.equal((await env.runner.enqueue(prepared)).run.id, queued.run.id);
      assert.equal((await env.store.getProject(env.binding)).doc.revision, 1);
      const stored = await env.store.withRuntimeTransaction(env.binding, tx => tx.query(
        'SELECT payload FROM v2_agent_runs WHERE id=?', [queued.run.id],
      ));
      assert.ok(!stored[0].payload.includes(env.input.request));
      assert.ok(!stored[0].payload.includes('fixture-private-key'));
      assert.ok(!stored[0].payload.includes('Unrelated private slide'));
      const restored = await env.store.restoreRevision({ ...env.binding, baseRevision: 1, targetRevision: 0 });
      assert.deepEqual(restored.doc.scenes, env.doc.scenes);
      const body = JSON.stringify(env.seen[0].body);
      for (const absent of ['Unrelated private slide', '112233', 'fixture-private-key', 'editableTargets']) assert.ok(!body.includes(absent), absent);
    });
    for (const outcome of ['text', 'refusal', 'read-results']) {
      check(`${outcome} returns bounded information without a queue or edit`, async t => {
        const env = await fixture(t, setup, family, (_req, res) => {
          const data = wire(family, outcome === 'read-results' ? [{ tool: 'get_selected_elements', args: {} }] : []);
          if (outcome !== 'read-results') {
            if (family === 'anthropic') { data.stop_reason = outcome === 'refusal' ? 'refusal' : 'end_turn'; data.content = [{ type: 'text', text: 'Bounded answer.' }]; }
            else { data.choices[0].finish_reason = 'stop'; data.choices[0].message = { role: 'assistant', content: 'Bounded answer.', ...(outcome === 'refusal' ? { refusal: 'Cannot comply.' } : {}) }; }
          }
          respond(res, data);
        });
        const result = await env.runner.prepare(env.binding, env.input);
        assert.equal(result.outcome, outcome); assert.equal(result.results.length, outcome === 'read-results' ? 1 : 0);
        if (outcome === 'read-results') {
          assert.equal(result.results[0].data.elements[0].element.paragraphs[0].runs[0].text, 'Measured ');
          assert.ok(!JSON.stringify(result.results).includes('112233'));
        }
        assert.equal((await env.runner.enqueue(result)).code, 'invalid-proposal'); await unchanged(env);
      });
    }
    check('coalesces distinct edit calls and refuses duplicate writes atomically', async t => {
      let duplicate = false;
      const env = await fixture(t, setup, family, (_req, res) => respond(res, wire(family,
        duplicate ? [edit([textEdit('First')]), edit([textEdit('Second')])] :
          [edit([textEdit('First')]), edit([textEdit('Second', 1)])])));
      const prepared = await env.runner.prepare(env.binding, env.input);
      assert.equal(prepared.editCount, 2); assert.deepEqual(prepared.edits.map(e => e.text), ['First', 'Second']);
      duplicate = true;
      assert.equal((await env.runner.prepare(env.binding, turnInput(env))).code, 'tool-refused'); await unchanged(env);
    });
    check('refuses mixed read/edit and oversized combined proposals before effects', async t => {
      let oversized = false;
      const env = await fixture(t, setup, family, (_req, res) => respond(res, wire(family,
        oversized ? Array.from({ length: 3 }, () => edit(Array.from({ length: 11 }, (_, i) => textEdit(String(i), i)))) :
          [{ tool: 'get_slide', args: { slideId: 's1' } }, reviewedEdit()])));
      assert.equal((await env.runner.prepare(env.binding, env.input)).code, 'invalid-response');
      oversized = true;
      assert.equal((await env.runner.prepare(env.binding, turnInput(env))).code, 'invalid-response'); await unchanged(env);
    });
    check('refuses protected batches without partial edits', async t => {
      const env = await fixture(t, setup, family);
      const scenes = structuredClone(env.doc.scenes); scenes[0].elements[1].locked = true;
      env.doc = (await env.store.saveProject({ ...env.binding, baseRevision: 0, scenes })).doc;
      assert.equal((await env.runner.prepare(env.binding, turnInput(env))).code, 'tool-refused'); await unchanged(env);
    });
    check('uses engine revision zero independently of an advanced durable revision', async t => {
      const env = await fixture(t, setup, family);
      const scenes = structuredClone(env.doc.scenes); scenes[1].elements[0].paragraphs[0].runs[0].text += ' human';
      env.doc = (await env.store.saveProject({ ...env.binding, baseRevision: 0, scenes })).doc;
      const proposal = await env.runner.prepare(env.binding, turnInput(env)); assert.equal(proposal.projectRevision, 1);
      const queued = await env.runner.enqueue(proposal); assert.equal(queued.run.projectRevision, 1);
      const claim = await env.runtime.claim(env.binding, queued.run.id, 'worker');
      const done = await env.runtime.advance(env.binding, queued.run.id, claim.lease);
      assert.equal(done.run.status, 'succeeded'); assert.equal(done.run.projectRevision, 2);
      assert.deepEqual((await env.store.getProject(env.binding)).doc.scenes, expectedReview(env.doc));
    });
    check('a human save while HTTP is pending invalidates preparation', async t => {
      let env, saved;
      env = await fixture(t, setup, family, async (_req, res) => {
        const scenes = structuredClone(env.doc.scenes); scenes[0].elements[0].paragraphs[0].runs[0].text = 'Human won';
        saved = (await env.store.saveProject({ ...env.binding, baseRevision: 0, scenes })).doc;
        respond(res, wire(family, [reviewedEdit()]));
      });
      assert.equal((await env.runner.prepare(env.binding, env.input)).code, 'stale-project');
      assert.deepEqual((await env.store.getProject(env.binding)).doc, saved); assert.equal(await runCount(env), 1);
    });
    check('a human save after preparation prevents queuing', async t => {
      const env = await fixture(t, setup, family); const prepared = await env.runner.prepare(env.binding, env.input);
      const scenes = structuredClone(env.doc.scenes); scenes[0].elements[0].paragraphs[0].runs[0].text = 'Human won';
      env.doc = (await env.store.saveProject({ ...env.binding, baseRevision: 0, scenes })).doc;
      assert.equal((await env.runner.enqueue(prepared)).code, 'stale-project'); await unchanged(env);
    });
    check('refuses foreign owners and invalid scopes before network', async t => {
      const env = await fixture(t, setup, family);
      assert.equal((await env.runner.prepare({ ...env.binding, owner: 'foreign' }, env.input)).code, 'not-found');
      assert.equal((await env.runner.prepare(env.binding, turnInput(env, { scope: { ...env.plan.scope, readableSlides: ['missing'] } }))).code, 'invalid-request');
      assert.equal(env.seen.length, 0); await unchanged(env);
    });
    check('cancellation covers both preparation and pending HTTP', async t => {
      const env = await fixture(t, setup, family, () => {});
      const controller = new AbortController(); controller.abort();
      assert.equal((await env.runner.prepare(env.binding, env.input, { signal: controller.signal })).code, 'cancelled');
      assert.equal(env.seen.length, 0);
      const pending = new AbortController(), result = env.runner.prepare(env.binding, env.input, { signal: pending.signal });
      await env.arrived; pending.abort(); assert.equal((await result).code, 'cancelled'); await unchanged(env);
    });
    check('an expired deadline refuses before HTTP', async t => {
      const env = await fixture(t, setup, family);
      assert.equal((await env.runner.prepare(env.binding, turnInput(env, { deadlineAt: Date.now() - 1 }))).code, 'deadline');
      assert.equal(env.seen.length, 0); await unchanged(env);
    });
    check('the absolute deadline also bounds pending provider HTTP', async t => {
      const env = await fixture(t, setup, family, () => {});
      const result = env.runner.prepare(env.binding, turnInput(env, { deadlineAt: Date.now() + 500 }));
      await env.arrived;
      assert.equal((await result).code, 'deadline'); await unchanged(env);
    });
    for (const boundary of ['cancelled', 'deadline']) {
      check(`${boundary} at final queue commit rolls back the run insert`, async t => {
        let queue = false, expire = false, deadline;
        const controller = new AbortController();
        const env = await fixture(t, setup, family, undefined, e => ({
          withRuntimeTransaction: (binding, job) => e.store.withRuntimeTransaction(binding, tx => job({ ...tx,
            now: () => expire ? Promise.resolve(deadline + 1) : tx.now(),
            beforeCommit: guard => tx.beforeCommit(async () => {
              if (queue) { if (boundary === 'cancelled') controller.abort(); else expire = true; }
              await guard();
            }),
          })),
        }));
        deadline = env.input.deadlineAt;
        const prepared = await env.runner.prepare(env.binding, env.input); assert.equal(prepared.outcome, 'edit-proposal');
        queue = true;
        assert.equal((await env.runner.enqueue(prepared, { signal: controller.signal })).code, boundary);
        await unchanged(env);
      });
    }
    check('only the original proposal instance can queue its private plan', async t => {
      const env = await fixture(t, setup, family); const prepared = await env.runner.prepare(env.binding, env.input);
      assert.equal((await env.runner.enqueue(structuredClone(prepared))).code, 'invalid-proposal');
      assert.equal((await createProviderRunner(env.store, env.provider).enqueue(prepared)).code, 'invalid-proposal');
      assert.equal((await env.runner.enqueue({ ...prepared, edits: [textEdit('Injected')] })).code, 'invalid-proposal');
      assert.equal((await env.runner.enqueue(prepared, { signal: new AbortController().signal, owner: 'foreign' })).code, 'invalid-request');
      await unchanged(env);
    });
    check('conflicting proposals cannot reuse a queued request identity', async t => {
      let second = false;
      const env = await fixture(t, setup, family, (_req, res) => respond(res, wire(family, [edit([textEdit(second ? 'Second' : 'First')])])));
      const first = await env.runner.prepare(env.binding, env.input); second = true;
      const next = await env.runner.prepare(env.binding, env.input);
      assert.equal((await env.runner.enqueue(first)).outcome, 'queued');
      assert.equal((await env.runner.enqueue(next)).code, 'queue-refused');
      assert.equal(await runCount(env), 2); assert.deepEqual((await env.store.getProject(env.binding)).doc, env.doc);
    });
    check('read-only grants cannot receive edit proposals', async t => {
      const env = await fixture(t, setup, family);
      const input = turnInput(env, { scope: { ...env.plan.scope, mode: 'inspect', editableTargets: [] } });
      assert.equal((await env.runner.prepare(env.binding, input)).providerCode, 'invalid-response'); await unchanged(env);
    });
    check('deleting a project invalidates its ephemeral proposals', async t => {
      const env = await fixture(t, setup, family);
      const proposal = await env.runner.prepare(env.binding, env.input);
      await env.store.deleteProject(env.binding);
      assert.equal((await env.runner.enqueue(proposal)).code, 'not-found');
      const sent = env.seen.length;
      assert.equal((await env.runner.prepare(env.binding, env.input)).code, 'not-found');
      assert.equal(env.seen.length, sent); assert.equal((await env.store.getProject(env.binding)).doc, null);
    });
    check('a foreign target in an otherwise valid edit batch preserves every scene', async t => {
      const env = await fixture(t, setup, family, (_req, res) => respond(res, wire(family,
        [edit([textEdit('Allowed'), { ...textEdit('Forbidden'), ...target('other', 's2') }])])));
      assert.equal((await env.runner.prepare(env.binding, env.input)).code, 'tool-refused'); await unchanged(env);
    });
  }
}
