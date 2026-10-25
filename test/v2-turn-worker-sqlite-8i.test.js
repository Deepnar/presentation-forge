import { scenario } from './v2-runtime-fixture.js';
import { turnWorkerContract } from './v2-turn-worker-contract.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workExitCode } from '../src/agent/turn-work-status.js';
turnWorkerContract('SQLite', scenario);
test('work exit table distinguishes unfinished work and final persisted success', () => {
  const status = (state, run, reason = null) => ({ ok: true, turn: { state }, run: run ? { status: run } : null, reason });
  assert.equal(workExitCode({ ok: false, code: 'busy' }), 1);
  for (const reason of ['busy', 'lease-lost', 'aborted', 'step-limit']) {
    assert.equal(workExitCode(status('approved', 'running', reason)), 1);
    assert.equal(workExitCode(status('approved', 'succeeded', reason)), 0);
  }
  for (const run of ['failed', 'expired', 'cancelled']) assert.equal(workExitCode(status('approved', run)), 1);
  for (const state of ['preparing', 'refused', 'expired', 'needs-user-action', 'cancelled'])
    assert.equal(workExitCode(status(state)), 1);
  for (const state of ['submitted', 'awaiting-decision', 'rejected', 'completed'])
    assert.equal(workExitCode(status(state)), 0);
});
