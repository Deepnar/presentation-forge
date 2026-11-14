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
  assert.deepEqual(state.turns[0].proposal.slides, [{ position: 2, title: 'Next steps', replaces: false }]);
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

check('a rewrite replaces a slide in place, keeping what the person added, on approval', async t => {
  let e;
  e = await hostScenario(t, { handler: (req, res) => respond([{ tool: 'rewrite_slide', args: { baseRevision: 0, slideId: e.doc.scenes[0].id,
    slide: { title: 'A sharper title', blocks: [{ kind: 'text', text: 'One clear point.' }] } } }])(req, res) });
  // The person added a note of their own to that slide first.
  const { createDocument } = await import('../packages/model/engine.ts');
  const doc = await createDocument(structuredClone(e.doc.scenes));
  const target = { id: 'h-0000000000aa', kind: 'text', x: 9, y: 6, w: 3, h: 0.5, z: 0, provenance: 'human', paragraphs: [{ runs: [{ text: 'My own note', size: 14, color: '111111' }] }] };
  await doc.apply({ id: 'add-1', slideId: e.doc.scenes[0].id, op: { type: 'element.add', element: target }, baseRevision: 0, actor: 'human' });
  const moved = await e.store.saveProject({ owner: e.owner, id: e.doc.id, baseRevision: 0, title: e.doc.title, scenes: doc.snapshot().scenes });
  assert.equal(moved.status, 'saved');
  e.doc = moved.doc;
  await e.submit();
  const policy = createAccountHostPolicy({ resolve: async () => ({ backend: { type: 'openai-compatible', baseURL: e.baseURL, apiKey: 'k', providerId: 'openai', billingOwner: 'user' }, model: 'm' }) });
  const run = () => createAutoHostPickup(e.store, policy).pickup({ owner: e.owner }, pickupInput());
  const prepared = await run();
  assert.equal(prepared.results[0].turnState, 'awaiting-decision', JSON.stringify(prepared));
  const state = await e.service.read(e.binding);
  assert.deepEqual(state.turns[0].proposal.slides.map(s => s.replaces), [true]);
  assert.equal((await e.service.decide(e.binding, decision(state, state.turns[0]))).ok, true);
  assert.equal((await run()).results[0].runStatus, 'succeeded');
  const after = (await e.store.getProject(e.binding)).doc;
  assert.equal(after.scenes.length, e.doc.scenes.length, 'replaced, not added');
  assert.equal(after.scenes[0].id, e.doc.scenes[0].id, 'same slide, same place');
  assert.ok(JSON.stringify(after.scenes[0].elements).includes('One clear point.'));
  assert.ok((await validateScene(after.scenes[0])).ok);
  const kept = after.scenes[0].elements.find(el => el.id === target.id);
  assert.ok(kept, 'their note is still on the slide');
  assert.deepEqual([kept.x, kept.y], [9, 6], 'where they put it');
});

test('Project files: the Assistant can list and read them, a page at a time, only when the host grants it', async () => {
  const { createToolSession } = await import('../packages/tools/session.ts');
  const { createDocument } = await import('../packages/model/engine.ts');
  const { blankSlide } = await import('../packages/editor/scene-text.js');
  const scene = blankSlide();
  const base = { document: await createDocument([scene]), projectId: 'p1', ownerId: 'o', actorId: 'o', agentId: 'a', mode: 'inspect', readableSlides: [scene.id], editableTargets: [], selection: [] };
  const text = 'x'.repeat(30000);
  const files = {
    list: async () => [{ id: 'file_1', name: 'Report.docx', kind: 'docx', role: 'source-of-truth', chars: text.length }],
    read: async (fileId, offset, limit) => fileId === 'file_1' ? { id: 'file_1', name: 'Report.docx', role: 'source-of-truth', text: text.slice(offset, offset + limit), offset, nextOffset: offset + limit < text.length ? offset + limit : null } : null,
  };
  const without = createToolSession(base);
  assert.equal(without.catalog().some(t => t.name === 'list_files'), false, 'not offered without a grant');
  assert.equal((await without.execute({ tool: 'list_files', args: {} })).code, 'forbidden');
  const withFiles = createToolSession({ ...base, files });
  assert.ok(withFiles.catalog().some(t => t.name === 'read_file'));
  const listed = await withFiles.execute({ tool: 'list_files', args: {} });
  assert.deepEqual(listed.data.files, [{ fileId: 'file_1', name: 'Report.docx', kind: 'docx', role: 'source-of-truth', chars: 30000 }]);
  const page = await withFiles.execute({ tool: 'read_file', args: { fileId: 'file_1' } });
  assert.equal(page.ok, true);
  assert.ok(page.data.text.length <= 16000 && page.data.nextOffset === page.data.text.length, 'a page that fits the result budget, and where to go next');
  assert.equal((await withFiles.execute({ tool: 'read_file', args: { fileId: 'nope' } })).ok, false);
});

check('a turn offers the project\'s file tools to the model', async t => {
  const e = await scenario(t, next);
  await e.run();
  const names = e.seen[0].body.tools.map(x => x.function.name);
  assert.ok(names.includes('list_files') && names.includes('read_file'), names.join(','));
});

check('a layout change the project cannot lay out is refused, nothing proposed', async t => {
  let e;
  // These slides were not compiled from a stored intent, so no layout applies.
  e = await hostScenario(t, { handler: (req, res) => respond([{ tool: 'change_layout', args: { baseRevision: 0, slideId: e.doc.scenes[0].id, layout: 'hub' } }])(req, res) });
  await e.submit();
  const policy = createAccountHostPolicy({ resolve: async () => ({ backend: { type: 'openai-compatible', baseURL: e.baseURL, apiKey: 'k', providerId: 'openai', billingOwner: 'user' }, model: 'm' }) });
  await createAutoHostPickup(e.store, policy).pickup({ owner: e.owner }, pickupInput());
  const state = await e.service.read(e.binding);
  assert.notEqual(state.turns[0].state, 'awaiting-decision');
  assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, e.doc.scenes);
  assert.ok(e.seen[0].body.tools.some(x => x.function.name === 'change_layout'), 'offered to the model');
});
