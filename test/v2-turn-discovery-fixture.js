import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDb, setDbPathForTest } from '../src/db.js';
import * as sqlite from '../src/projects/store.js';
import { seed } from './v2-tool-fixture.js';
import { spec } from './v2-runtime-fixture.js';
import { createRuntime } from '../packages/agent/runtime.ts';
import { createTurnService } from '../packages/agent/turns.ts';
import { identityDigest, parseTurn } from '../packages/agent/turn-state.ts';
import { submission } from './v2-turns-contract.js';
import { metadataRow } from './v2-turn-discovery-data.js';

export async function discoveryScenario(t, store = sqlite) {
  let env;
  if (store === sqlite) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'forge-discovery-'));
    const file = path.join(dir, 'forge.db'); setDbPathForTest(file);
    t.after(async () => { store.closeProjectStore(); await rm(dir, { recursive: true, force: true }); });
    env = { FORGE_DB_PATH: file, FORGE_CONFIG_DIR: dir, FORGE_PROJECTS_BACKEND: 'sqlite' };
  } else env = { FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: process.env.FORGE_PROJECTS_DATABASE_URL };
  const owner = `discovery-${crypto.randomUUID()}`;
  const { doc } = await store.createProject({ owner, title: 'Work discovery', scenes: seed() });
  return { store, env, doc, binding: { owner, id: doc.id }, plan: spec(),
    service: createTurnService(store), runtime: createRuntime(store) };
}
export async function rawQuery(e, sql, params = []) {
  if (e.store === sqlite) {
    const statement = getDb().prepare(sql);
    return statement.columns().length ? statement.all(...params) : (statement.run(...params), []);
  }
  let index = 0;
  return (await e.store.__testQuery(sql.replaceAll('?', () => `$${++index}`), params)).rows;
}
export async function seedMetadata(e, states, ids) {
  const state = await e.service.read(e.binding), now = Date.now(), records = [];
  for (const [index, status] of states.entries()) {
    const id = ids?.[index] ?? `${e.doc.id}-${String(index).padStart(3, '0')}`;
    const input = submission(e, state);
    const { generation, revision, ...identity } = input;
    const row = metadataRow({ projectId: e.doc.id, owner: e.binding.owner, id, generation,
      state: status, requestKey: input.requestKey, identity: await identityDigest(identity),
      createdAt: now, updatedAt: now, prepDeadline: now + 120000, planDeadline: now + 1200000,
      lease: status === 'preparing' ? { workerId: 'fixture-worker', until: now + 30000 } : null });
    parseTurn(JSON.parse(row.turn_payload));
    records.push({ ...row, request_key: input.requestKey, private_payload: JSON.stringify({ input, reply: null }) });
  }
  await e.store.withRuntimeTransaction(e.binding, async tx => {
    for (const row of records) await tx.query('INSERT INTO v2_agent_turns (id,project_id,generation,request_key,payload,private_payload) VALUES (?,?,?,?,?,?)',
      [row.turn_id, e.doc.id, row.generation, row.request_key, row.turn_payload, row.private_payload]);
  });
  return records;
}
export async function databaseSnapshot(e) {
  const result = {};
  for (const [table, order] of [['v2_projects', 'id'], ['v2_project_revisions', 'project_id,revision'],
    ['v2_agent_conversations', 'project_id'], ['v2_agent_turns', 'id'], ['v2_agent_proposals', 'id'],
    ['v2_agent_attempts', 'id'], ['v2_agent_runs', 'id'], ['v2_agent_receipts', 'run_id,step']])
    result[table] = await rawQuery(e, `SELECT * FROM ${table} ORDER BY ${order}`);
  return JSON.stringify(result);
}
export function byteOrder(a, b) { return Buffer.compare(Buffer.from(a), Buffer.from(b)); }
