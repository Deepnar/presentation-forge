import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hostScenario, pickupInput } from '../../../test/v2-host-pickup-fixture.js';
import { caps } from '../../../test/v2-provider-fixture.js';

test('pickup CLI SIGTERM during preparation exits1 and conservatively persists cancellation', { timeout: 10000 }, async t => {
  const e = await hostScenario(t, { handler() {} });
  await e.submit();
  await writeFile(path.join(e.dir, 'agent-host.json'), JSON.stringify({ version: 1,
    model: 'operator-model', capabilities: caps(), timeoutMs: 3000 }));
  await writeFile(path.join(e.dir, 'models.yaml'), JSON.stringify({ providers: { auto: {
    type: 'openai-compatible', baseURL: e.baseURL, models: ['operator-model'],
  } } }));
  const input = path.join(e.dir, 'pickup.json');
  await writeFile(input, JSON.stringify(pickupInput()));
  const child = spawn(process.execPath, ['src/agent/turn-cli.js', 'pickup', '--owner', e.owner,
    '--input', input], { env: { ...process.env, ...e.env, FORGE_HOSTED: '1',
    FORGE_AGENT_HOST_ENABLED: '1', FORGE_AUTO_API_KEY: 'fixture-private-key' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; if (stdout.length > 140000) child.kill('SIGKILL'); });
  child.stderr.on('data', bytes => { stderr += bytes; if (stderr.length > 140000) child.kill('SIGKILL'); });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; }
  });
  await Promise.race([e.arrived, done.then(result => { throw new Error(JSON.stringify({ result, stderr })); })]);
  assert.equal(child.kill('SIGTERM'), true);
  const result = await done;
  assert.equal(result.signal, null);
  assert.equal(result.code, 1, stdout + stderr);
  const output = JSON.parse(stdout);
  assert.equal(output.results[0].turnState, 'cancelled');
  assert.equal(stdout.includes('fixture-private-key'), false);
  assert.equal(stderr, '');
  assert.equal((await e.service.read(e.binding)).turns[0].state, 'cancelled');
  assert.equal(e.events().length, 1);
  assert.ok(e.events()[0].tokens > 2048);
  assert.equal(e.lifetime(), e.events()[0].tokens);
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
});
