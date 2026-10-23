import { cloneJson } from '../tools/json.ts';
import { parseConversationRequest, invalidRun, loadTurnValidators } from './run-state.ts';
import type { TurnSubmission } from './turn-submission.generated.ts';
import type { TurnHeader } from './turn-header.generated.ts';
import type { TurnRecord } from './turn-record.generated.ts';
import type { TurnProposal } from './turn-proposal.generated.ts';
import type { TurnAttempt } from './turn-attempt.generated.ts';
export type { TurnSubmission, TurnHeader, TurnRecord, TurnProposal, TurnAttempt };
export const TURN_LIMITS = Object.freeze({ privateBytes: 4*1024*1024, metadataBytes: 4*1024*1024,
  headerBytes: 16384, recordBytes: 4096, attemptBytes: 2048, turns: 128, proposals: 128,
  attempts: 1024, settlements: 128, replyChars: 16000, planBytes: 131072,
  submissionBytes:262144, turnBodyBytes:262144+16000*6+128,
  finalPrivateReservation: 262144, finalMetadataReservation: 32768 });
const {submission,header,turn,proposal,attempt}=await loadTurnValidators();
export const characters = (value: string) => [...value].length;
export const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
function copy(input: unknown, limit: number): unknown {
  try {
    const result = JSON.parse(JSON.stringify(cloneJson(input, limit)));
    if (bytes(result) > limit) invalidRun();
    return result;
  } catch { return invalidRun(); }
}
export function parseTurnSubmission(input: unknown): TurnSubmission {
  const data = copy(input, TURN_LIMITS.submissionBytes);
  if (!submission(data)) return invalidRun();
  const { generation: _g, revision: _r, requestKey, ...base } = data;
  if (!parseConversationRequest({ ...base, requestId: requestKey, deadlineAt: 0 })) invalidRun();
  return data;
}
export function parseHeader(input: unknown): TurnHeader {
  const data = copy(input, TURN_LIMITS.headerBytes);
  if (!header(data)) return invalidRun();
  return data;
}
export function parseTurn(input: unknown): TurnRecord {
  const data = copy(input, TURN_LIMITS.recordBytes);
  if (!turn(data)) return invalidRun();
  if ((data.state === 'preparing') !== (data.lease !== null) ||
      data.prepDeadline > data.createdAt + 120000 || data.planDeadline > data.createdAt + 1200000 ||
      data.prepDeadline <= data.createdAt || data.planDeadline <= data.prepDeadline ||
      data.lease && data.lease.until > data.prepDeadline ||
      data.state === 'awaiting-decision' && data.proposalId === null ||
      data.state === 'approved' && data.runId === null ||
      data.proposalId !== null && !data.everDispatched ||
      ['submitted','preparing'].includes(data.state) && (data.reservedPrivateBytes!==TURN_LIMITS.finalPrivateReservation || data.reservedMetadataBytes!==TURN_LIMITS.finalMetadataReservation) ||
      !['submitted','preparing'].includes(data.state) && (data.reservedPrivateBytes!==0 || data.reservedMetadataBytes!==0)) invalidRun();
  return data;
}
export function parseProposal(input: unknown): TurnProposal {
  const data = copy(input, TURN_LIMITS.recordBytes);
  if (!proposal(data) || (data.decision === null) !== (data.decisionKey === null) ||
      (data.decision === null) !== (data.decisionDigest === null) ||
      (data.decision === 'approve') !== (data.runId !== null)) return invalidRun();
  return data;
}
export function parseAttempt(input: unknown): TurnAttempt {
  const data = copy(input, TURN_LIMITS.attemptBytes);
  if (!attempt(data) || (data.state === 'known') !== (data.usage !== null) ||
      data.settleBy > data.createdAt + 120000 || data.settleBy < data.createdAt ||
      data.usage && data.usage.outputTokens > data.reservedOutputTokens) return invalidRun();
  return data;
}
export async function identityDigest(value: unknown): Promise<string> {
  function stable(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
    return JSON.stringify(v);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
}
