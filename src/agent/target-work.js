import { createTurnService } from '../../packages/agent/turns.ts';
import { createTurnWorker } from '../../packages/agent/turn-worker.ts';
import { parseTurnTarget } from '../../packages/agent/turn-target.ts';
import { parseWakeIdentity } from '../../packages/agent/host-wake.ts';
import { autoHostEnabled, createAutoHostPolicy } from './auto-host-policy.js';
import { projectStore } from '../projects/backend.js';
import { getDb } from '../db.js';
import { withoutAccount } from '../account.js';
import { withoutMeter } from '../usage.js';

const fail = code => { throw Object.assign(new Error('Target work refused.'), { code }); };
export function assertHostAccount(identity) {
  const row = getDb().prepare('SELECT id FROM users WHERE email=? COLLATE BINARY').get(identity.owner);
  if (row?.id !== identity.userId) fail('owner-ineligible');
}
export function operatorHostIdentity(owner) {
  const row = getDb().prepare('SELECT id FROM users WHERE email=? COLLATE BINARY').get(owner);
  if (!row) fail('owner-ineligible');
  return parseWakeIdentity({ owner, userId: row.id });
}
const emptyContext = fn => withoutAccount(() => withoutMeter(fn));
// Admission inspects one target inside its caller's slot and deadline. Each work
// call re-enters H/I2; neither an earlier read nor a wake receipt grants authority.
export async function openAutoTargetWork(identityInput, targetInput, { signal,
  enabled = autoHostEnabled, policy = createAutoHostPolicy(), backend = projectStore,
  accountCheck = assertHostAccount } = {}) {
  const identity = parseWakeIdentity(identityInput), target = parseTurnTarget(targetInput);
  return emptyContext(async () => {
    const check = () => {
      if (signal?.aborted) fail('wake-expired');
      if (enabled() !== true) fail('host-disabled');
      accountCheck(identity);
    };
    check();
    const session = await policy.open({ owner: identity.owner }); check();
    const store = await backend(); check();
    const service = createTurnService(store), binding = Object.freeze({ owner: identity.owner, id: target.projectId });
    const lookup = Object.freeze({ generation: target.generation, turnId: target.turnId });
    const preflight = await service.inspect(binding, lookup); check();
    if (!preflight.ok) fail(preflight.code);
    await session.authorize(); check();
    return Object.freeze({ work: () => emptyContext(async () => {
      check(); await session.authorize(); check();
      const current = await service.inspect(binding, lookup); check();
      if (!current.ok) return current;
      const provider = current.turn.state === 'submitted' ? await session.provider() : undefined;
      check(); await session.authorize(); check();
      return createTurnWorker(store, provider).work(binding, { ...lookup,
        workerId: 'target-' + crypto.randomUUID() }, { signal });
    }) });
  });
}
