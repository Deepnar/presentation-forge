import * as store from '../src/projects/store.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importApiFixture } from './v2-import-fixture.js';
import { conversationHttpContract, conversationHttpFixture } from './v2-conversation-http-contract.js';
process.env.FORGE_HOSTED = '1';
conversationHttpContract('SQLite', t => conversationHttpFixture(t, store));

for (const [name, extra, status, code] of [
  ['disabled projects', { FORGE_V2_PROJECTS: '0' }, 403, 'projects-disabled'],
  ['misconfigured backend', { FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: '' }, 503, 'store-misconfigured'],
]) test(`production HTTP: ${name} is an honest sanitized refusal`, { timeout: 30000 }, async t => {
  const f = await importApiFixture(extra); t.after(() => f.stop());
  for (const suffix of ['', '/export', '/decisions', '/cancel', '/clear']) {
    const response = await f.request(`/api/v2/projects/p-0123456789abcdef01234567/conversation${suffix}`, {
      token: f.token, ...(suffix && suffix !== '/export' ? { method: 'POST', body: '{}' } : {}),
    });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const data = await response.json(); assert.equal(data.code, code);
    assert.equal(JSON.stringify(data).includes('FORGE_PROJECTS_DATABASE_URL'), false);
  }
});
