import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createProviderRunner } from '../packages/agent/provider-run.ts';
import { endpoint, wire } from './v2-provider-fixture.js';
import { reviewedEdit, expectedReview } from './v2-provider-contract.js';
import { turnInput } from './v2-provider-run-contract.js';
const exec = promisify(execFile);
export const conversationInput = (env, changes = {}) => ({ ...turnInput(env),
  reads: [{ tool: 'get_project', args: {} }], limits: { maxExchanges: 4, maxToolCalls: 16, maxOutputTokensTotal: 8192 }, ...changes });
export const respond = (res, data) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
export function calls(family, round, requests) {
  const data = wire(family, requests);
  const rows = family === 'anthropic' ? data.content : data.choices[0].message.tool_calls;
  rows.forEach((r, i) => { r.id = `round-${round}-call-${i}`; });
  return data;
}
export function answer(family, refusal = false) {
  return family === 'anthropic'
    ? { type: 'message', role: 'assistant', model: 'fixture-resolved-model', stop_reason: refusal ? 'refusal' : 'end_turn', content: [{ type: 'text', text: 'Bounded answer.' }] }
    : { model: 'fixture-resolved-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Bounded answer.', ...(refusal ? { refusal: 'Cannot comply.' } : {}) } }] };
}
export async function fixture(t, setup, family, handler, backend) {
  const env = await setup(t); let count = 0;
  const http = await endpoint(t, family, (req, res, seen) => {
    const round = ++count;
    if (handler) return handler({ env, req, res, seen, round });
    respond(res, calls(family, round, round === 1 ? [{ tool: 'get_slide', args: { slideId: 's1' } }]
      : round === 2 ? [{ tool: 'get_selected_elements', args: {} }] : [reviewedEdit()]));
  });
  return { ...env, ...http, runner: createProviderRunner(backend?.(env) ?? env.store, http.provider), input: conversationInput(env) };
}
async function unchanged(env, doc = env.doc) {
  assert.deepEqual((await env.store.getProject(env.binding)).doc, doc);
  assert.equal(await env.store.withRuntimeTransaction(env.binding, async tx => Number((await tx.query('SELECT count(*) AS n FROM v2_agent_runs WHERE project_id=?', [env.doc.id]))[0].n)), 1);
}
export function conversationContract(backend, setup) {
 for (const family of ['openai-compatible', 'anthropic']) {
  const check = (name, body) => test(`${backend}/${family}: ${name}`, { timeout: 30000 }, body);
  check('multiple read rounds produce a preserved explicit proposal with durable restart/history', async t => {
    const env = await fixture(t, setup, family);
    const proposal = await env.runner.converse(env.binding, env.input);
    assert.equal(proposal.outcome, 'edit-proposal'); assert.equal(proposal.conversation.exchanges, 3);
    assert.equal(proposal.conversation.toolCalls, 3); assert.equal(proposal.conversation.reservedOutputTokens, 6144);
    assert.deepEqual(proposal.edits, reviewedEdit().args.edits); await unchanged(env);
    assert.throws(() => { proposal.conversation.steps[0].toolNames.push('edit_content'); }, TypeError);
    const metadata = JSON.stringify(proposal.conversation);
    for (const text of [env.input.request, 'Measured ', '112233', 'fixture-private-key', 'round-1-call-0']) assert.ok(!metadata.includes(text));
    for (const { body } of env.seen) for (const secret of ['Unrelated private slide', '112233', 'editableTargets', 'fixture-private-key']) assert.ok(!JSON.stringify(body).includes(secret));
    const queued = await env.runner.enqueue(proposal); assert.equal(queued.outcome, 'queued');
    assert.equal((await env.runner.enqueue(proposal)).run.id, queued.run.id);
    await env.store.closeProjectStore();
    const worked = await exec(process.execPath, ['src/agent/cli.js', 'work', '--project', env.doc.id, '--owner', env.binding.owner, '--run', queued.run.id], { env: { ...process.env, ...env.env }, timeout: 30000 });
    assert.equal(JSON.parse(worked.stdout).run.status, 'succeeded');
    const after = (await env.store.getProject(env.binding)).doc;
    assert.deepEqual(after.scenes, expectedReview(env.doc)); assert.equal(after.revision, 1);
    assert.equal((await env.runner.enqueue(proposal)).run.id, queued.run.id);
    const stored = await env.store.withRuntimeTransaction(env.binding, tx => tx.query('SELECT payload FROM v2_agent_runs WHERE id=?', [queued.run.id]));
    for (const absent of [env.input.request, 'fixture-private-key', 'conversation', 'round-1-call-0']) assert.ok(!stored[0].payload.includes(absent));
    assert.deepEqual((await env.store.restoreRevision({ ...env.binding, baseRevision: 1, targetRevision: 0 })).doc.scenes, env.doc.scenes);
  });
  for (const refusal of [false, true]) check(`read-to-${refusal ? 'refusal' : 'answer'} never creates an edit run`, async t => {
    const env = await fixture(t, setup, family, ({ res, round }) => respond(res, round === 1
      ? calls(family, round, [{ tool: 'get_selected_elements', args: {} }]) : answer(family, refusal)));
    const result = await env.runner.converse(env.binding, env.input);
    assert.equal(result.outcome, refusal ? 'refusal' : 'text'); assert.equal(result.conversation.exchanges, 2);
    assert.equal(result.conversation.reportedOutputTokens, null);
    assert.equal((await env.runner.enqueue(result)).code, 'invalid-proposal'); await unchanged(env);
  });
  check('32 model reads retain their allowance in addition to four initial context reads', async t => {
    const env = await fixture(t, setup, family, ({ res, round }) => respond(res, round <= 4
      ? calls(family, round, Array.from({ length: 8 }, () => ({ tool: 'get_project', args: {} }))) : answer(family)));
    const input = conversationInput(env, { reads: Array.from({ length: 4 }, () => ({ tool: 'get_project', args: {} })), maxOutputTokens: 64,
      limits: { maxExchanges: 5, maxToolCalls: 32, maxOutputTokensTotal: 320 } });
    const result = await env.runner.converse(env.binding, input);
    assert.equal(result.outcome, 'text'); assert.equal(result.conversation.toolCalls, 32); assert.equal(env.seen.length, 5); await unchanged(env);
  });
  for (const budget of ['exchange', 'output', 'tools']) check(`${budget} exhaustion refuses without effects or refunds`, async t => {
    const env = await fixture(t, setup, family, ({ res, round }) => respond(res, calls(family, round,
      Array.from({ length: budget === 'tools' ? 2 : 1 }, () => ({ tool: 'get_project', args: {} })))));
    const input = conversationInput(env, { maxOutputTokens: 64, limits: { maxExchanges: budget === 'exchange' ? 1 : 4,
      maxToolCalls: budget === 'tools' ? 1 : 16, maxOutputTokensTotal: budget === 'output' ? 64 : 256 } });
    const result = await env.runner.converse(env.binding, input);
    assert.equal(result.code, 'budget-exhausted'); assert.equal(env.seen.length, 1);
    assert.equal(result.conversation.reservedOutputTokens, 64); assert.equal(result.conversation.reportedOutputTokens, 20); await unchanged(env);
  });
  check('a repeated call ID across exchanges refuses before another read', async t => {
    const env = await fixture(t, setup, family, ({ res }) => respond(res, calls(family, 1, [{ tool: 'get_project', args: {} }])));
    const result = await env.runner.converse(env.binding, env.input);
    assert.equal(result.code, 'invalid-response'); assert.equal(env.seen.length, 2); await unchanged(env);
  });
  check('mixed reads and edits cannot partially execute', async t => {
    const env = await fixture(t, setup, family, ({ res, round }) => respond(res, calls(family, round, [{ tool: 'get_project', args: {} }, reviewedEdit()])));
    assert.equal((await env.runner.converse(env.binding, env.input)).code, 'invalid-response'); await unchanged(env);
  });
  check('an out-of-scope model read stops before another exchange', async t => {
    const env = await fixture(t, setup, family, ({ res, round }) => respond(res, calls(family, round, [{ tool: 'get_slide', args: { slideId: 's2' } }])));
    assert.equal((await env.runner.converse(env.binding, env.input)).code, 'tool-refused'); assert.equal(env.seen.length, 1); await unchanged(env);
  });
  for (const roundToSave of [1, 3]) check(`human save during exchange ${roundToSave} invalidates the invocation`, async t => {
    let saved;
    const env = await fixture(t, setup, family, async ({ env, res, round }) => {
      if (round === roundToSave) {
        const scenes = structuredClone(env.doc.scenes); scenes[0].elements[0].paragraphs[0].runs[0].text = 'Human won';
        saved = (await env.store.saveProject({ ...env.binding, baseRevision: 0, scenes })).doc;
      }
      respond(res, calls(family, round, round < 3 ? [{ tool: 'get_project', args: {} }] : [reviewedEdit()]));
    });
    assert.equal((await env.runner.converse(env.binding, env.input)).code, 'stale-project');
    assert.equal(env.seen.length, roundToSave); await unchanged(env, saved);
  });
  check('cancellation during the second provider request aborts the entire invocation', async t => {
    let reached; const second = new Promise(r => { reached = r; });
    const env = await fixture(t, setup, family, ({ res, round }) => {
      if (round === 1) respond(res, calls(family, round, [{ tool: 'get_project', args: {} }])); else reached();
    });
    const controller = new AbortController(), result = env.runner.converse(env.binding, env.input, { signal: controller.signal });
    await second; controller.abort(); assert.equal((await result).code, 'cancelled'); await unchanged(env);
  });
  check('proposal lifetime retains its trusted deadline and copied authority is refused', async t => {
    const env = await fixture(t, setup, family); env.input.deadlineAt = Date.now() + 300000;
    const result = await env.runner.converse(env.binding, env.input);
    assert.equal(result.expiresAt, env.input.deadlineAt);
    assert.equal((await env.runner.enqueue(structuredClone(result))).code, 'invalid-proposal');
    assert.equal((await createProviderRunner(env.store, env.provider).enqueue(result)).code, 'invalid-proposal');
    assert.equal((await env.runner.enqueue(result)).outcome, 'queued');
  });
  check('foreign ownership refuses before any provider call', async t => {
    const env = await fixture(t, setup, family);
    assert.equal((await env.runner.converse({ ...env.binding, owner: 'foreign' }, env.input)).code, 'not-found');
    assert.equal(env.seen.length, 0); await unchanged(env);
  });
  check('protected edits refuse the entire terminal batch after investigation', async t => {
    const env = await fixture(t, setup, family);
    const scenes = structuredClone(env.doc.scenes); scenes[0].elements[1].locked = true;
    env.doc = (await env.store.saveProject({ ...env.binding, baseRevision: 0, scenes })).doc;
    assert.equal((await env.runner.converse(env.binding, conversationInput(env))).code, 'tool-refused');
    await unchanged(env);
  });
  check('deletion while a provider response is pending stops further exchanges', async t => {
    const env = await fixture(t, setup, family, async ({ env, res, round }) => {
      await env.store.deleteProject(env.binding);
      respond(res, calls(family, round, [{ tool: 'get_project', args: {} }]));
    });
    assert.equal((await env.runner.converse(env.binding, env.input)).code, 'not-found');
    assert.equal(env.seen.length, 1);
  });
  for (const boundary of ['cancelled', 'deadline']) check(`${boundary} at queue commit rolls back a traced proposal`, async t => {
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
    const proposal = await env.runner.converse(env.binding, env.input); assert.equal(proposal.outcome, 'edit-proposal');
    queue = true;
    assert.equal((await env.runner.enqueue(proposal, { signal: controller.signal })).code, boundary);
    await unchanged(env);
  });
 }
}
