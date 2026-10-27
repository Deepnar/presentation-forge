import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { hostScenario, pickupInput } from './v2-host-pickup-fixture.js';
import { caps } from './v2-provider-fixture.js';
import { decision } from './v2-turns-contract.js';

async function cli(t, e, { enabled = true, owner = e.owner, extra = [], raw, input = pickupInput() } = {}) {
  const file = path.join(e.dir, crypto.randomUUID() + '.json');
  await writeFile(file, raw ?? JSON.stringify(input));
  const args = ['src/agent/turn-cli.js', 'pickup', '--input', file];
  if (owner !== null) args.push('--owner', owner);
  args.push(...extra);
  const child = spawn(process.execPath, args, { env: { ...process.env, ...e.env,
    FORGE_HOSTED: '1', FORGE_AGENT_HOST_ENABLED: enabled ? '1' : '0',
    FORGE_AUTO_API_KEY: 'fixture-private-key', FORGE_OLLAMA_HOST: 'http://127.0.0.1:1/private' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const collect = target => bytes => {
    if (target === 'stdout') stdout += bytes; else stderr += bytes;
    if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 145000) child.kill('SIGKILL');
  };
  child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); }); });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; } });
  const result = await done; assert.equal(result.signal, null, JSON.stringify(result));
  assert.ok(Buffer.byteLength(stdout) <= 131073);
  return { ...result, value: stdout ? JSON.parse(stdout) : null };
}
async function configuration(e) {
  await writeFile(path.join(e.dir, 'agent-host.json'), JSON.stringify({ version: 1, model: 'operator-model', capabilities: caps(), timeoutMs: 3000 }));
  await writeFile(path.join(e.dir, 'models.yaml'), JSON.stringify({ providers: { auto: { type: 'openai-compatible', baseURL: e.baseURL, models: ['operator-model'], session_header: true } } }));
}

test('pickup CLI defaults off before any provider/configuration work', { timeout: 20000 }, async t => {
  const e = await hostScenario(t); await e.submit();
  const r = await cli(t, e, { enabled: false });
  assert.equal(r.code, 1); assert.equal(r.stdout, ''); assert.equal(JSON.parse(r.stderr).code, 'host-disabled');
  assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0); assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
});
test('pickup CLI rejects authority overrides and malformed bytes privately', { timeout: 45000 }, async t => {
  const e = await hostScenario(t); await e.submit();
  for (const options of [{ owner: null }, { extra: ['--provider', '/PRIVATE_KEY'] }, { extra: ['--project', e.doc.id] }, { input: pickupInput({ owner: 'PRIVATE_OWNER' }) }, { raw: Buffer.from([0xff, 0xfe]) }]) {
    const r = await cli(t, e, options); assert.equal(r.code, 1); assert.equal(r.stdout, ''); assert.equal(JSON.parse(r.stderr).ok, false); assert.equal(r.stderr.includes('PRIVATE'), false);
  }
  assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
test('pickup CLI pins local Auto configuration and fails closed without it', { timeout: 20000 }, async t => {
  const e = await hostScenario(t); await e.submit();
  const r = await cli(t, e); assert.equal(r.code, 1); assert.equal(r.value.stopReason, 'host-misconfigured');
  assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
test('pickup CLI loopback prepare and approved execution persist without probes or redispatch', { timeout: 30000 }, async t => {
  const e = await hostScenario(t); await configuration(e); await e.submit();
  const prepared = await cli(t, e); assert.equal(prepared.code, 0, prepared.stderr); assert.equal(prepared.value.results[0].turnState, 'awaiting-decision');
  assert.equal(e.seen.length, 1); assert.equal(e.seen[0].url, '/v1/chat/completions'); assert.equal(e.seen[0].headers.authorization, 'Bearer fixture-private-key'); assert.ok(e.seen[0].headers['x-opencode-session']);
  assert.equal(e.events().length, 1); assert.equal(e.lifetime(), 62);
  const state = await e.service.read(e.binding); assert.equal((await e.service.decide(e.binding, decision(state, state.turns[0]))).ok, true);
  await rm(path.join(e.dir, 'agent-host.json'));
  const executed = await cli(t, e); assert.equal(executed.code, 0, JSON.stringify(executed)); assert.equal(executed.value.results[0].runStatus, 'succeeded');
  const replay = await cli(t, e); assert.equal(replay.code, 0); assert.equal(e.seen.length, 1); assert.equal(e.events().length, 1);
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 1);
  assert.equal(JSON.stringify(executed.value).includes('fixture-private-key'), false);
});
test('pickup CLI reports account refusal as failure even after a completed scan', { timeout: 20000 }, async t => {
  const e = await hostScenario(t); await configuration(e); await e.submit();
  e.db.prepare('UPDATE users SET lifetime_tokens=999999999 WHERE id=?').run(e.userId);
  const r = await cli(t, e); assert.equal(r.code, 1); assert.equal(r.value.complete, true);
  assert.equal(r.value.results[0].turnState, 'refused'); assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
