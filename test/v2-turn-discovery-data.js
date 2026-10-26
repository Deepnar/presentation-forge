import { TURN_LIMITS } from '../packages/agent/turn-limits.ts';

export function metadataRow({ projectId = 'project-1', owner = 'owner', id = 'turn-1',
  generation = 'generation-1', state = 'submitted', ...extra } = {}) {
  const active = ['submitted', 'preparing'].includes(state), prepared = state === 'approved';
  const header = { version: 1, generation, revision: 0, createdAt: 1, updatedAt: 1,
    accounting: { reservedOutputTokens: 0, knownInputTokens: 0, knownOutputTokens: 0,
      knownCacheReadTokens: 0, knownCacheWriteTokens: 0, knownAttempts: 0, unknownAttempts: 0 } };
  const turn = { version: 1, id, generation, requestKey: 'metadata-request', identity: '0'.repeat(64),
    projectRevision: 0, state, code: null, revision: 0, fence: state === 'preparing' ? 1 : 0,
    lease: state === 'preparing' ? { workerId: 'worker', until: 30001 } : null,
    everDispatched: prepared, createdAt: 1, updatedAt: 1, prepDeadline: 120001,
    planDeadline: 1200001, proposalId: prepared ? 'proposal' : null, runId: prepared ? 'run' : null,
    reservedPrivateBytes: active ? TURN_LIMITS.finalPrivateReservation : 0,
    reservedMetadataBytes: active ? TURN_LIMITS.finalMetadataReservation : 0, ...extra };
  return { project_id: projectId, owner, turn_id: id, generation,
    header_payload: JSON.stringify(header), turn_payload: JSON.stringify(turn) };
}
