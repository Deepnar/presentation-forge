import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hostScenario } from './v2-host-pickup-fixture.js';
import { createAutoHostPolicy } from '../src/agent/auto-host-policy.js';
import { createAutoHostWake } from '../src/agent/host-wake.js';
import { startSession } from '../src/auth.js';
import { caps } from './v2-provider-fixture.js';

export async function until(read, predicate, timeout = 5000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    const value = await read(); if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Fixture state did not complete.');
}
export async function wakeScenario(t, options = {}) {
  const baseCleanup = [], hosts = [], apiStops = [];
  const e = await hostScenario({ after: fn => baseCleanup.push(fn) }, options); let clock = performance.now();
  e.apiStops = apiStops;
  t.after(async () => {
    for (const stop of apiStops) await stop();
    for (const host of hosts) await host.close();
    for (const cleanup of baseCleanup) await cleanup();
  });
  e.identity = { owner: e.owner, userId: e.userId };
  e.token = await startSession({ email: e.owner });
  e.advance = () => { clock += 5000; };
  e.host = overrides => {
    const api = createAutoHostWake({ enabled: () => true, policy: createAutoHostPolicy(e.policyOptions), backend: async () => e.store, now: () => clock, ...overrides });
    hosts.push(api); return api;
  };
  e.api = e.host();
  e.turn = () => e.service.read(e.binding).then(s => s.turns[0]);
  return e;
}
export async function productionApi(t, e, extra = {}) {
  await writeFile(path.join(e.dir, 'agent-host.json'), JSON.stringify({ version: 1, model: 'operator-model', capabilities: caps(), timeoutMs: 3000 }));
  await writeFile(path.join(e.dir, 'models.yaml'), JSON.stringify({ providers: { auto: { type: 'openai-compatible', baseURL: e.baseURL, models: ['operator-model'] } } }));
  const child = spawn(process.execPath, ['app/server/index.js'], { env: { ...process.env, ...e.env,
    FORGE_HOSTED: '1', FORGE_AGENT_HOST_ENABLED: '1', FORGE_AGENT_WAKE_ENABLED: '1', FORGE_API_PORT: '0',
    FORGE_AUTO_API_KEY: 'fixture-private-key', FORGE_SMTP_HOST: '', FORGE_ADMIN_EMAIL: '', FORGE_ADMIN_PASSWORD: '',
    FORGE_DEV_LOCAL_FALLBACK: '0', FORGE_OLLAMA_HOST: 'http://127.0.0.1:1', ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', finished = false;
  const exited = new Promise(resolve => child.once('exit', (code, signal) => { finished = true; resolve({ code, signal }); }));
  const stop = async () => {
    if (!finished) {
      child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited; clearTimeout(timer);
    }
  };
  e.apiStops.push(stop);
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture API startup timeout.')), 15000);
    const collect = bytes => {
      output = (output + bytes).slice(-20000);
      const match = output.match(/api\s+http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    exited.then(() => { clearTimeout(timer); reject(new Error('Fixture API exited before startup.')); });
  });
  assert.ok(port > 0);
  const base = `http://127.0.0.1:${port}`;
  return { base, stop, child, request: (route, options = {}) => fetch(base + route, {
    ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.token}`, ...options.headers },
  }) };
}
