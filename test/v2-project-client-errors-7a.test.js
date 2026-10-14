import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiList } from '../app/web/src/lib/v2project.js';

for (const [status, code] of [[401, 'auth-required'], [403, 'projects-disabled'], [503, 'store-misconfigured']]) {
  test(`project listing retains ${status} metadata for dashboard recovery`, async () => {
    await assert.rejects(apiList(async () => ({ ok: false, status, json: async () => ({ ok: false, error: 'Unavailable', code }) })),
      error => error.status === status && error.code === code && error.message === 'Unavailable');
  });
}
test('non-JSON project failure retains status and a useful fallback message', async () => {
  await assert.rejects(apiList(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('not JSON'); } })),
    error => error.status === 502 && error.code === null && error.message.includes('502'));
});
test('successful project listing returns summaries without changing the contract', async () => {
  const projects = [{ id: 'p-test', title: 'A' }];
  assert.equal(await apiList(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, projects }) })), projects);
});
