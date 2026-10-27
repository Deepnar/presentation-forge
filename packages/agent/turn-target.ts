import { cloneJson } from '../tools/json.ts';
import { discoveryRecord, discoveryIdentifier, discoveryProjectId } from './turn-discovery-input.ts';

export type TurnLookup = { generation: string; turnId: string };
export type TurnTarget = TurnLookup & { projectId: string };
export function parseTurnLookup(input: unknown): TurnLookup {
  const value = discoveryRecord(input, ['generation', 'turnId']);
  if (!discoveryIdentifier(value.generation) || !discoveryIdentifier(value.turnId))
    throw new Error('Invalid turn target.');
  return Object.freeze({ generation: value.generation, turnId: value.turnId });
}
export function parseTurnTarget(input: unknown): TurnTarget {
  const value = discoveryRecord(input, ['projectId', 'generation', 'turnId']);
  if (!discoveryProjectId(value.projectId)) throw new Error('Invalid target project.');
  return Object.freeze({ projectId: value.projectId, ...parseTurnLookup({ generation: value.generation, turnId: value.turnId }) });
}
export function sameTurnTarget(a?: TurnTarget, b?: TurnTarget) {
  return a === undefined || b === undefined ? a === b :
    a.projectId === b.projectId && a.generation === b.generation && a.turnId === b.turnId;
}
const states = new Set(['submitted', 'preparing', 'awaiting-decision', 'complete', 'refused',
  'needs-user-action', 'cancelled', 'expired', 'approved', 'rejected']);
const runStates = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']);
const stopped = new Set(['busy', 'lease-lost', 'aborted', 'step-limit']);
// The shared coordinator consumes completion metadata; a target has no scan cursor.
export function targetWakeResult(target: TurnTarget, input: unknown) {
  const result = cloneJson(input, 131072) as any;
  if (result?.ok !== true) return { ok: false, complete: false, stopReason: 'target-refused', nextCursor: null, results: [] };
  if (result.generation !== target.generation || result.turn?.id !== target.turnId || !states.has(result.turn?.state) || !['observe', 'prepare', 'execute'].includes(result.phase) ||
      !Number.isSafeInteger(result.advances) || result.advances < 0 || result.advances > 8 ||
      result.run !== null && !runStates.has(result.run?.status)) throw new Error('Invalid target work result.');
  const complete = !['submitted', 'preparing', 'approved'].includes(result.turn.state) ||
    result.turn.state === 'approved' && ['succeeded', 'failed', 'cancelled', 'expired'].includes(result.run?.status);
  const observed = result.phase === 'observe' && [result.turn.state, result.run?.status].includes(result.reason);
  const stopReason = stopped.has(result.reason) ? result.reason :
    complete && (result.reason === null || observed) ? null : 'unfinished';
  return { ok: true, complete, stopReason, nextCursor: null, results: [{ ...target,
    phase: result.phase, turnState: result.turn.state, runStatus: result.run?.status ?? null, advances: result.advances }] };
}
