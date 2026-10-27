import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDb, setDbPathForTest } from '../src/db.js';
import * as store from '../src/projects/store.js';
import { createTurnService } from '../packages/agent/turns.ts';
import { createAutoHostPolicy } from '../src/agent/auto-host-policy.js';
import { createAutoHostPickup } from '../src/agent/host-pickup.js';
import { caps, wire } from './v2-provider-fixture.js';
import { reviewedEdit } from './v2-provider-contract.js';
import { seed } from './v2-tool-fixture.js';
import { spec } from './v2-runtime-fixture.js';
import { submission } from './v2-turns-contract.js';

export const pickupInput = (extra = {}) => ({ cursor: null, maxScannedRows: 50, maxWorkItems: 5, maxElapsedMs: 5000, ...extra });
export async function hostScenario(t, { handler, profile = {} } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'forge-host-pickup-')), file = path.join(dir, 'forge.db');
  setDbPathForTest(file);
  t.after(async () => { await store.closeProjectStore(); await rm(dir, { recursive: true, force: true }); });
  const owner = 'owner@forge.invalid', db = getDb();
  db.prepare('INSERT INTO users(email,name,created_at,verified_at) VALUES(?,?,?,?)').run(owner, 'Fixture owner', new Date().toISOString(), new Date().toISOString());
  const userId = db.prepare('SELECT id FROM users WHERE email=?').get(owner).id;
  const { doc } = await store.createProject({ owner, title: 'Host pickup', scenes: seed() });
  const seen = []; let notify;
  const arrived = new Promise(resolve => { notify = resolve; });
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const bytes of req) raw += bytes;
    seen.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) }); notify();
    if (handler) return handler(req, res);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(wire('openai-compatible', [reviewedEdit()])));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  const http = { seen, arrived, baseURL };
  const policyOptions = { enabled: () => true,
    readConfiguration: async () => ({ id: 'auto', family: 'openai-compatible', model: 'operator-model', capabilities: caps(), baseURL, timeoutMs: 3000, sessionHeader: true, ...profile }),
    readSecret: async () => 'fixture-private-key',
  };
  const binding = { owner, id: doc.id }, service = createTurnService(store);
  const e = { store, dir, db, owner, userId, doc, binding, service, plan: spec(), ...http, policyOptions,
    env: { FORGE_DB_PATH: file, FORGE_CONFIG_DIR: dir, FORGE_PROJECTS_BACKEND: 'sqlite' } };
  e.pickup = options => createAutoHostPickup(store, createAutoHostPolicy({ ...policyOptions, ...options }));
  e.submit = async extra => service.submit(binding, submission(e, await service.read(binding), extra));
  e.events = () => getDb().prepare('SELECT user_id,provider,tokens FROM auto_events ORDER BY id').all();
  e.lifetime = () => getDb().prepare('SELECT lifetime_tokens FROM users WHERE id=?').get(userId).lifetime_tokens;
  return e;
}
