import { createHostWake } from '../../packages/agent/host-wake.ts';
import { createAutoHostPolicy, autoHostEnabled } from './auto-host-policy.js';
import { createAccountHostPolicy } from './account-host-policy.js';
import { createAutoHostPickup } from './host-pickup.js';
import { projectStore } from '../projects/backend.js';
import { assertHostAccount, openAutoTargetWork } from './target-work.js';
import { targetWakeResult } from '../../packages/agent/turn-target.ts';
import { withoutAccount } from '../account.js';
import { withoutMeter } from '../usage.js';

// The Assistant runs for every account on its own provider (F2), unless the
// operator turns it off (FORGE_AGENT_WAKE_ENABLED=0) or turns on the
// dedicated Auto host — an explicitly configured gateway, agent-host.json —
// which then serves every turn as before.
export const hostWakeEnabled = () => process.env.FORGE_AGENT_WAKE_ENABLED !== '0' && process.env.FORGE_V2_PROJECTS !== '0';
export const defaultHostPolicy = () => (autoHostEnabled() ? createAutoHostPolicy() : createAccountHostPolicy());
export function createAutoHostWake({ enabled = hostWakeEnabled, policy = defaultHostPolicy(),
  backend = projectStore, accountCheck = assertHostAccount, now } = {}) {
  const core = createHostWake({ enabled, async open(identity, signal) {
    if (identity.target) {
      const session = await openAutoTargetWork({ owner: identity.owner, userId: identity.userId },
        identity.target, { signal, enabled, policy, backend, accountCheck });
      return { pickup: async () => targetWakeResult(identity.target, await session.work()) };
    }
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
