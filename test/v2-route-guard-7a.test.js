import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuardedHashRouter } from '../app/web/src/lib/guarded-hash-router.js';

function browser() {
  const win = new EventTarget(); win.document = new EventTarget();
  let entries = [{ hash: '#/projects', state: null }], at = 0;
  win.location = { get hash() { return entries[at].hash; }, get href() { return `http://forge.test/${entries[at].hash}`; } };
  win.history = {
    get state() { return entries[at].state; },
    get length() { return entries.length; },
    pushState(state, _, hash) { entries.splice(at + 1); entries.push({ state, hash }); at++; },
    replaceState(state, _, hash) { entries[at] = { state, hash }; },
    go(delta) {
      const next = at + delta;
      if (next < 0 || next >= entries.length) return;
      setTimeout(() => { at = next; win.dispatchEvent(new Event('popstate')); win.dispatchEvent(new Event('hashchange')); });
    },
    back() { this.go(-1); }, forward() { this.go(1); },
  };
  return win;
}
const settle = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  const deadline=Date.now()+2000;
  while(!predicate()) { if(Date.now()>deadline)assert.fail('history condition did not settle'); await new Promise(resolve=>setTimeout(resolve,1)); }
}
function setup(t) {
  const win = browser(), applied = [];
  let dirty = false, answer;
  const router = createGuardedHashRouter({ window: win, apply: hash => applied.push(hash),
    getGuard: () => ({ isDirty: () => dirty, confirm: () => new Promise(resolve => { answer = resolve; }) }) });
  t.after(() => router.dispose());
  return { win, router, applied, dirty: value => { dirty = value; }, hasChoice: () => typeof answer === 'function', answer: value => answer(value) };
}
test('clean navigation and history traversal apply once per destination', async t => {
  const f = setup(t); await f.router.navigate('#/project/a'); f.win.history.back(); await until(()=>f.applied.at(-1)==='#/projects');
  assert.equal(f.applied.at(-1), '#/projects');
  f.win.history.forward(); await until(()=>f.applied.at(-1)==='#/project/a'); assert.equal(f.applied.at(-1), '#/project/a');
  assert.deepEqual(f.applied, ['#/projects', '#/project/a', '#/projects', '#/project/a']);
});
test('cancelled explicit navigation does not change the URL or history', async t => {
  const f = setup(t); await f.router.navigate('#/project/a'); f.dirty(true);
  const pending = f.router.navigate('#/themes'); await until(f.hasChoice);
  assert.equal(f.win.location.hash, '#/project/a'); f.answer(false);
  assert.equal(await pending, false); assert.equal(f.win.history.length, 2);
});
test('Back restores the exact original entry while choice is pending and after cancellation', async t => {
  const f = setup(t); await f.router.navigate('#/project/a'); f.dirty(true); f.win.history.back(); await until(f.hasChoice);
  assert.equal(f.win.location.hash, '#/project/a'); assert.equal(f.applied.at(-1), '#/project/a');
  f.answer(false); await settle(); assert.equal(f.win.location.hash, '#/project/a');
  f.dirty(false); f.win.history.back(); await until(()=>f.applied.at(-1)==='#/projects'); assert.equal(f.win.location.hash, '#/projects');
  assert.equal(f.win.history.length, 2);
});
test('approved Back traverses the existing entry without creating duplicates', async t => {
  const f = setup(t); await f.router.navigate('#/project/a'); f.dirty(true); f.win.history.back(); await until(f.hasChoice);
  f.answer(true); await until(()=>f.applied.at(-1)==='#/projects'); assert.equal(f.win.location.hash, '#/projects');
  assert.equal(f.applied.at(-1), '#/projects'); assert.equal(f.win.history.length, 2);
});
test('direct native fragment changes are adopted and guarded', async t => {
  const f = setup(t); await f.router.navigate('#/project/a'); f.dirty(true);
  f.win.history.pushState(null, '', '#/themes'); f.win.dispatchEvent(new Event('hashchange')); await until(f.hasChoice);
  assert.equal(f.win.location.hash, '#/project/a'); f.answer(true); await until(()=>f.applied.at(-1)==='#/themes');
  assert.equal(f.win.location.hash, '#/themes'); assert.equal(f.applied.at(-1), '#/themes');
});
test('disposal prevents an outstanding choice from applying a route', async t => {
  const f = setup(t); await f.router.navigate('#/project/a'); f.dirty(true);
  const pending = f.router.navigate('#/themes'); await until(f.hasChoice); f.router.dispose(); f.answer(true);
  assert.equal(await pending, false); assert.equal(f.win.location.hash, '#/project/a');
});

test('approving explicit navigation waits for a racing Back restoration', async t => {
  const f = setup(t); await f.router.navigate('#/project/a'); f.dirty(true);
  const pending = f.router.navigate('#/themes'); await until(f.hasChoice);
  f.win.history.back();
  await new Promise(resolve => setTimeout(resolve, 1));
  f.answer(true); await pending; await settle();
  assert.equal(f.win.location.hash, '#/themes'); assert.equal(f.win.history.length, 3);
  f.dirty(false); f.win.history.back(); await until(()=>f.applied.at(-1)==='#/project/a');
  assert.equal(f.win.location.hash, '#/project/a');
});
