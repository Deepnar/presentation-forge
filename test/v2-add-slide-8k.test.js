// F3: the Assistant proposes a slide as content; the trusted host lays it out
// in the project's theme; nothing changes until the person approves; then
// one approval inserts it where it was asked for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostScenario, pickupInput } from './v2-host-pickup-fixture.js';
import { decision } from './v2-turns-contract.js';
import { wire } from './v2-provider-fixture.js';
import { createAccountHostPolicy } from '../src/agent/account-host-policy.js';
import { createAutoHostPickup } from '../src/agent/host-pickup.js';
import { validateScene } from '../packages/model/scene.ts';
import { semanticToolCatalog, CONTENT_TOOLS } from '../packages/tools/session.ts';

const check = (name, body) => test('Add slide: ' + name, { timeout: 30000 }, body);
const respond = (requests) => (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(wire('openai-compatible', requests)));
};
async function scenario(t, slideArgs) {
  let e;
  e = await hostScenario(t, { handler: (req, res) => respond([{ tool: 'add_slide', args: slideArgs(e) }])(req, res) });
  await e.submit();
  const policy = () => createAccountHostPolicy({ resolve: async () => ({ backend: { type: 'openai-compatible', baseURL: e.baseURL, apiKey: 'k', providerId: 'openai', billingOwner: 'user' }, model: 'm' }) });
  e.run = () => createAutoHostPickup(e.store, policy()).pickup({ owner: e.owner }, pickupInput());
  return e;
}
const next = (e) => ({ baseRevision: 0, afterSlideId: e.doc.scenes[0].id,
  slide: { title: 'Next steps', blocks: [{ kind: 'list', items: ['Measure the baseline', 'Run the pilot', 'Report back'] }] } });

check('a proposed slide is compiled by the host, shown, and inserted only on approval', async t => {
  const e = await scenario(t, next);
  const prepared = await e.run();
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.results[0].turnState, 'awaiting-decision');
  assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, e.doc.scenes, 'nothing changes before approval');
  const state = await e.service.read(e.binding);
  assert.deepEqual(state.turns[0].proposal.slides, [{ position: 2, title: 'Next steps' }]);
  assert.equal((await e.service.decide(e.binding, decision(state, state.turns[0]))).ok, true);
  const executed = await e.run();
  assert.equal(executed.results[0].runStatus, 'succeeded', JSON.stringify(executed));
  const after = (await e.store.getProject(e.binding)).doc;
  assert.equal(after.scenes.length, e.doc.scenes.length + 1);
  const added = after.scenes[1];
  assert.ok((await validateScene(added)).ok);
  const text = JSON.stringify(added.elements);
  for (const item of next(e).slide.blocks[0].items) assert.ok(text.includes(item), `${item} is on the slide`);
  assert.ok(text.includes('Next steps'));
  assert.equal(added.layoutState, 'managed', 'laid out by the compiler');
});

check('a slide after an unreadable or unknown slide is refused, nothing proposed', async t => {
  const e = await scenario(t, () => ({ ...next({ doc: { scenes: [{ id: 'x' }] } }), afterSlideId: 'no-such-slide' }));
  const prepared = await e.run();
  const state = await e.service.read(e.binding);
  assert.notEqual(state.turns[0].state, 'awaiting-decision', JSON.stringify(prepared));
  assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, e.doc.scenes);
});

check('the model is offered add_slide but never insert_slide', async t => {
  assert.ok(CONTENT_TOOLS.includes('add_slide'));
  assert.equal(CONTENT_TOOLS.includes('insert_slide'), false);
  assert.ok(semanticToolCatalog().some(tool => tool.name === 'insert_slide'), 'insert_slide exists for plans');
});
