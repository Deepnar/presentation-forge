import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture, proposed, decision } from './v2-turns-contract.js';
import { rawQuery, seedMetadata, databaseSnapshot } from './v2-turn-discovery-fixture.js';

async function rig(t, e) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'forge-discovery-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return async (input, { owner = e.binding.owner, action = 'discover', extra = [], raw } = {}) => {
    const file = path.join(dir, crypto.randomUUID() + '.json');
    await writeFile(file, raw ?? JSON.stringify(input));
    const args = ['src/agent/turn-cli.js', action, '--input', file];
    if (owner !== null) args.push('--owner', owner);
    args.push(...extra);
    const child = spawn(process.execPath, args, { env: { ...process.env, ...e.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const collect = name => chunk => {
      if (name === 'stdout') stdout += chunk; else stderr += chunk;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 150000) child.kill('SIGKILL');
    };
    child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
    });
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; } });
    const result = await done;
    assert.equal(result.signal, null, JSON.stringify(result));
    assert.ok(Buffer.byteLength(result.stdout) <= 131073);
    return { ...result, value: result.stdout ? JSON.parse(result.stdout) : null };
  };
}

export function discoveryProcessContract(label, setup) {
  const check = (name, body) => test(`${label} discovery CLI: ${name}`, { timeout: 45000 }, body);
  check('separate processes resume filtered pagination without writes or hidden polling', async t => {
    const e = await setup(t), rows = await seedMetadata(e, ['cancelled', 'rejected', 'submitted']), cli = await rig(t, e);
    const before = await databaseSnapshot(e); let cursor = null; const hints = [];
    for (let index = 0; index < 3; index++) {
      const result = await cli({ limit: 1, cursor });
      assert.equal(result.code, 0, result.stderr); assert.equal(result.value.scannedRows, 1);
      assert.equal(result.value.hasMore, index < 2); assert.equal(result.stdout, JSON.stringify(result.value) + '\n');
      hints.push(...result.value.items); cursor = result.value.nextCursor;
    }
    assert.equal(cursor, null); assert.deepEqual(hints.map(x => x.turnId), [rows[2].turn_id]);
    const restarted = await cli({ limit: 50, cursor: null });
    assert.equal(restarted.code, 0); assert.deepEqual(restarted.value.items, hints);
    assert.equal(await databaseSnapshot(e), before);
  });
  check('omitting owner enumerates only explicit null-owner projects', async t => {
    const e = await setup(t); await seedMetadata(e, ['submitted']);
    const { doc } = await e.store.createProject({ owner: null, title: 'Local only', scenes: e.doc.scenes });
    const [row] = await seedMetadata({ ...e, doc, binding: { owner: null, id: doc.id } }, ['submitted']);
    const cli = await rig(t, e), result = await cli({ limit: 50, cursor: null }, { owner: null });
    assert.equal(result.code, 0); assert.deepEqual(result.value.items.map(x => x.turnId), [row.turn_id]);
    assert.equal((await cli({ limit: 50, cursor: null }, { owner: e.binding.owner.toUpperCase() })).value.items.length, 0);
  });
  check('invalid input and forbidden authority flags refuse privately before dispatch', async t => {
    const e = await fixture(t, setup), cli = await rig(t, e); await seedMetadata(e, ['submitted']);
    const before = await databaseSnapshot(e);
    for (const [input, options] of [
      [{ limit: 0, cursor: null }, {}], [{ limit: 51, cursor: null }, {}],
      [{ limit: 1, cursor: { projectId: e.doc.id, turnId: '\ud800' } }, {}],
      [{ limit: 1, cursor: { projectId: e.doc.id, turnId: '\0' } }, {}],
      [{ limit: 1, cursor: null, owner: 'PRIVATE_INPUT' }, {}],
      [{ limit: 1, cursor: null }, { extra: ['--project', e.doc.id] }],
      [{ limit: 1, cursor: null }, { extra: ['--provider', '/PRIVATE_INPUT/missing.json'] }],
      [{ limit: 1, cursor: null }, { owner: ' ' }],
      [{}, { raw: 'PRIVATE_INPUT'.repeat(1000) }], [{}, { raw: '{"PRIVATE_INPUT":' }],
    ]) {
      const result = await cli(input, options);
      assert.equal(result.code, 1); assert.equal(result.stdout, '');
      assert.equal(JSON.parse(result.stderr).ok, false); assert.equal(result.stderr.includes('PRIVATE_INPUT'), false);
    }
    assert.equal(e.seen.length, 0); assert.equal(await databaseSnapshot(e), before);
  });
  check('corrupt operational metadata produces no partial output or private echo', async t => {
    const e = await setup(t); await seedMetadata(e, ['submitted']); const cli = await rig(t, e);
    await rawQuery(e, 'UPDATE v2_agent_turns SET payload=? WHERE project_id=?', ['PRIVATE_BAD_METADATA', e.doc.id]);
    const before = await databaseSnapshot(e), result = await cli({ limit: 50, cursor: null });
    assert.equal(result.code, 1); assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).code, 'invalid-document');
    assert.equal(result.stderr.includes('PRIVATE_BAD_METADATA'), false); assert.equal(await databaseSnapshot(e), before);
  });
  check('malformed UTF-8 input is refused while a literal replacement character remains valid', async t => {
    const e = await setup(t), cli = await rig(t, e);
    const prefix = Buffer.from('{"limit":1,"cursor":{"projectId":"position","turnId":"');
    const suffix = Buffer.from('"}}');
    const malformed = await cli({}, { raw: Buffer.concat([prefix, Buffer.from([0xc3, 0x28]), suffix]) });
    assert.equal(malformed.code, 1); assert.equal(malformed.stdout, '');
    assert.equal(JSON.parse(malformed.stderr).code, 'invalid-input');
    const literal = await cli({ limit: 1, cursor: { projectId: 'position', turnId: '�(' } });
    assert.equal(literal.code, 0, literal.stderr); assert.equal(literal.value.ok, true);
  });
  check('approved hints require explicit canonical work and replays preserve one edit', async t => {
    const e = await fixture(t, setup), proposal = await proposed(e);
    const approved = await e.service.decide(e.binding, decision(proposal, proposal.turn)), cli = await rig(t, e);
    const before = await databaseSnapshot(e), discovery = await cli({ limit: 50, cursor: null });
    assert.equal(discovery.code, 0); assert.equal(await databaseSnapshot(e), before);
    const hint = discovery.value.items[0]; assert.equal(hint.state, 'approved'); assert.equal(e.seen.length, 1);
    const options = { action: 'work', extra: ['--project', e.doc.id, '--provider', '/PRIVATE_UNREAD/missing.json'] };
    const input = { generation: hint.generation, turnId: hint.turnId, workerId: 'cli-discovery-host' };
    const result = await cli(input, options);
    assert.equal(result.code, 0, result.stderr); assert.equal(result.value.run.id, approved.turn.run.id);
    assert.equal(result.value.run.status, 'succeeded'); assert.equal(result.value.advances, 1);
    const finished = await databaseSnapshot(e), again = await cli({ limit: 50, cursor: null });
    assert.equal(again.value.items[0].state, 'approved'); assert.equal(await databaseSnapshot(e), finished);
    const replay = await cli(input, options); assert.equal(replay.code, 0); assert.equal(replay.value.advances, 0);
    assert.equal(await databaseSnapshot(e), finished); assert.equal(e.seen.length, 1);
  });
}
