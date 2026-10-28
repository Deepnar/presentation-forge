import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceRegistry } from '../src/projects/sources.js';
import { parsedWebSource, canonicalWebSource, sameWebMeaning } from '../packages/tools/web-source.ts';
import { webSourceId } from '../packages/model/source-identity.ts';
import { source } from './v2-source-registry-fixture.js';
test('Registry validation: canonical web identity and optional publication preserve accepted meaning', () => {
  const s = source(), empty = { ...s, publishedAt: '', searchProvider: 'later', retrievedAt: '2026-10-29' };
  assert.ok(parsedWebSource(s,'project')); assert.ok(parsedWebSource(empty,'project')); assert.ok(sameWebMeaning(s,empty));
  assert.equal(webSourceId(s), webSourceId(empty));
  const label = source('project',0,{ publishedAt: 'Volume IV, spring edition' }); assert.ok(parsedWebSource(label,'project'));
  assert.notEqual(label.id,s.id); assert.equal(sameWebMeaning(label,s),false);
});
test('Registry validation: strict schema, hash, project, URL and retrieval checks reject forged fields', () => {
  const s = source();
  for (const changed of [{ ...s, kind: 'paper' },{ ...s, locator: 'p.1' },{ ...s, title: 'Other title' },
    { ...s, retrievedAt: 'invalid' },source('project',0,{ url: 'https://user:pass@example.org/a' }),
    source('project',0,{ url: 'https://example.org/a#part' }),source('project',0,{ url: 'javascript:alert(1)' })]) assert.equal(parsedWebSource(changed,'project'),null);
  assert.equal(parsedWebSource(s,'foreign'),null);
});
test('Registry validation: invalid DTOs never enter storage or invoke accessors', async () => {
  let transactions = 0, getters = 0;
  const registry = createSourceRegistry({ withSourceTransaction() { transactions++; throw new Error('private'); } });
  const b = { owner: 'owner', id: 'project' }, r = { projectRevision: 0, generation: 0, revision: 0, sources: [source()] };
  for (const input of [{ ...r, query: 'x'.repeat(400000) },{ ...r, sources: [source(),source()] },{ ...r, sources: [] },
    { ...r, sources: Array.from({length:25},(_,i)=>source('project',i)) },{ ...r, generation: -1 },{ ...r, revision: 2**53 },
    { ...r, get sources() { getters++; return [source()]; } }]) assert.equal((await registry.register(b,input)).code,'invalid-request');
  assert.equal((await registry.inspect({ ...b, admin: true })).code,'invalid-request');
  assert.equal((await registry.inspect({ ...b, id: {} })).code,'invalid-request');
  assert.equal((await registry.list(b,{generation:0,revision:0,cursor:{projectId:'foreign',generation:0,revision:0,afterSourceId:source().id}})).code,'invalid-request');
  assert.equal(transactions,0); assert.equal(getters,0);
});
test('Registry validation: storage failures are sanitized and requests captured before the first await', async () => {
  let release, captured; const wait = new Promise(r=>{release=r;});
  const registry = createSourceRegistry({ async withSourceTransaction(binding) { captured=binding; await wait; throw new Error('private database endpoint and payload'); } });
  const b = { owner:'owner',id:'project' }, pending = registry.inspect(b); b.id='other'; release();
  const result=await pending; assert.equal(captured.id,'project'); assert.ok(Object.isFrozen(captured));
  assert.equal(result.code,'storage-unavailable'); assert.equal(JSON.stringify(result).includes('private'),false);
});
