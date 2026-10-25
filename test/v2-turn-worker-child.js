import { projectStore } from '../src/projects/backend.js';
import { createTurnWorker } from '../packages/agent/turn-worker.ts';
import { caps } from './v2-provider-fixture.js';
import { reviewedEdit } from './v2-provider-contract.js';

const store = await projectStore();
const command = new Promise(resolve => process.once('message', resolve));
process.send({ ready: true });
const { binding, input, fault, clockOffset = 0 } = await command;
process.channel.ref();
async function checkpoint(phase) {
  if (fault !== phase) return;
  process.send({ phase });
  await new Promise(() => {});
}
const backend = { withRuntimeTransaction: async (b, job) => {
  let after;
  const value = await store.withRuntimeTransaction(b, async tx => job({ ...tx,
    now: async () => await tx.now() + clockOffset,
    query: async (sql, args) => {
      const rows = await tx.query(sql, args);
      if (sql.startsWith('INSERT INTO v2_agent_attempts')) {
        const attempt = JSON.parse(args[2]);
        if (attempt.state === 'reserved') after = 'reserved';
        if (attempt.state === 'dispatched') after = 'dispatched';
        if (attempt.state === 'known') after = 'receipt';
      }
      if (sql.startsWith('INSERT INTO v2_agent_receipts')) after = 'run-committed';
      return rows;
    },
    saveScenes: async (...args) => {
      const result = await tx.saveScenes(...args);
      await checkpoint('run-uncommitted');
      return result;
    },
  }));
  if (after) await checkpoint(after);
  return value;
} };
const provider = { profile: { id: 'fixture-provider', family: 'openai-compatible', model: 'operator-model', capabilities: caps() },
  exchange: async () => ({ ok: true, providerId: 'fixture-provider', family: 'openai-compatible', model: 'operator-model',
    outcome: 'tool-calls', text: '', calls: [{ id: 'edit-1', request: reviewedEdit() }],
    usage: { inputTokens: 42, outputTokens: 20 } }) };
try {
  const result = await createTurnWorker(backend, provider).work(binding, input);
  process.send({ result });
} catch (error) {
  process.send({ error: { code: error.code, message: error.message } });
} finally {
  await store.closeProjectStore();
  process.disconnect();
}
