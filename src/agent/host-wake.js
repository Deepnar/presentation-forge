import { createHostWake } from '../../packages/agent/host-wake.ts';
import { createAutoHostPolicy, autoHostEnabled } from './auto-host-policy.js';
import { createAutoHostPickup } from './host-pickup.js';
import { projectStore } from '../projects/backend.js';
import { getDb } from '../db.js';
import { withoutAccount } from '../account.js';
import { withoutMeter } from '../usage.js';

export const hostWakeEnabled = () => autoHostEnabled() && process.env.FORGE_AGENT_WAKE_ENABLED === '1';
function sameAccount(identity) {
  const row = getDb().prepare('SELECT id FROM users WHERE email=? COLLATE BINARY').get(identity.owner);
  if (row?.id !== identity.userId) throw Object.assign(new Error('Wake owner changed.'), { code: 'owner-ineligible' });
}
export function createAutoHostWake({ enabled = hostWakeEnabled, policy = createAutoHostPolicy(),
  backend = projectStore, accountCheck = sameAccount, now } = {}) {
  const core = createHostWake({ enabled, async open(identity, signal) {
    accountCheck(identity);
    const session = await policy.open({ owner: identity.owner });
    accountCheck(identity);
    if (signal.aborted) throw Object.assign(new Error('Wake stopped.'), { code: 'wake-expired' });
    const pickup = createAutoHostPickup(await backend(), { open: () => session });
    accountCheck(identity);
    return { pickup: (input, options) => pickup.pickup({ owner: identity.owner }, input, options) };
  } }, { now });
  return Object.freeze({ wake: identity => withoutAccount(() => withoutMeter(() => core.wake(identity))),
    close: () => withoutAccount(() => withoutMeter(() => core.close())) });
}
let singleton;
export function agentHostWake() { return singleton ??= createAutoHostWake(); }
export async function closeAgentHostWake() { return singleton ? singleton.close() : { drained: true }; }
