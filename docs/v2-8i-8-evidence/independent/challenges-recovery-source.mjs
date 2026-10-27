import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantController } from '../../../app/web/src/lib/assistantController.js';
import { assistantFailure } from '../../../app/web/src/lib/v2assistant.js';

const succeeded = { id: 'turn', state: 'approved', request: 'Edit this slide',
  run: { id: 'run', status: 'succeeded', projectRevision: 2 } };
function setup(t, code) {
  let blocked = true, loads = 0;
  const api = { token: 'same-session', check() {},
    availability: async () => ({ ok: true, enabled: true }),
    read: async () => ({ ok: true, generation: 'g', revision: 4, total: 1, turns: [succeeded] }) };
  const controller = createAssistantController({ api, bridge: {
    syncSaved: async () => { if (blocked) throw assistantFailure(code); loads++; return { loaded: true }; },
  }, onChange() {} });
  t.after(() => controller.dispose());
  return { controller, unblock: () => { blocked = false; }, loads: () => loads };
}

test('a draft-blocked succeeded revision retains explicit Load saved changes recovery', async t => {
  for (const code of ['pending-data', 'pending-title']) {
    const e = setup(t, code);
    await e.controller.start();
    assert.equal(e.controller.snapshot().error, code);
    assert.equal(e.controller.snapshot().pendingSaved, true, `${code} retains explicit saved-change loading`);
    e.unblock();
    await e.controller.reloadSaved();
    assert.equal(e.loads(), 1);
    assert.equal(e.controller.snapshot().pendingSaved, false);
    assert.equal(e.controller.snapshot().error, null);
    assert.match(e.controller.snapshot().notice, /Session undo was cleared/);
  }
});

test('a revoked owner during saved-revision loading clears private recovery state', async t => {
  const e = setup(t, 'unauthorized');
  await e.controller.start();
  assert.equal(e.controller.snapshot().status, 'expired');
  assert.equal(e.controller.snapshot().page, null);
  assert.equal(e.controller.snapshot().pendingSaved, false);
  assert.equal(e.controller.snapshot().available, false);
});
