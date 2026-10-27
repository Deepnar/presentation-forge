import { parseWakeIdentity } from '../../packages/agent/host-wake.ts';
import { validProjectId } from '../../packages/projects/document.js';
import { hostWakeEnabled } from './host-wake.js';
import { assertHostAccount } from './target-work.js';
import { verificationRequired } from '../auth.js';
import { getDb } from '../db.js';
import { projectStore } from '../projects/backend.js';

const refuse = code => { throw Object.assign(new Error('Assistant availability refused.'), { code }); };
export async function assistantAvailability(input, projectId, { backend = projectStore,
  enabled = hostWakeEnabled, projectsEnabled = () => process.env.FORGE_V2_PROJECTS !== '0' } = {}) {
  const identity = parseWakeIdentity(input);
  if (!validProjectId(projectId)) refuse('invalid-id');
  const check = () => {
    assertHostAccount(identity);
    const row = getDb().prepare('SELECT verified_at FROM users WHERE id=?').get(identity.userId);
    if (verificationRequired() && !row?.verified_at) refuse('owner-ineligible');
    if (!projectsEnabled()) refuse('host-disabled');
  };
  check(); const store = await backend(); check();
  const result = await store.getProject({ owner: identity.owner, id: projectId }); check();
  if (!result.doc) refuse('not-found');
  return { ok: true, version: 1, enabled: enabled() === true };
}
