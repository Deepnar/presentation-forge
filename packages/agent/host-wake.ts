import { parseTurnTarget, sameTurnTarget, type TurnTarget } from './turn-target.ts';
import { cloneJson } from '../tools/json.ts';
import { parsePickupBinding } from './turn-pickup.ts';
import { parseTurnDiscoveryInput, type DiscoveryCursor } from './turn-discovery-input.ts';

export type WakeIdentity = { owner: string; userId: number };
export type WakeRequest = WakeIdentity & { target?: TurnTarget };
type Admission = { ok: true; status: 'accepted' | 'coalesced' } |
  { ok: false; code: string; retryAfter?: number };
type Session = { pickup(input: { cursor: DiscoveryCursor | null; maxScannedRows: number;
  maxWorkItems: number; maxElapsedMs: number }, options: { signal: AbortSignal }): Promise<unknown> };
export type WakeServices = {
  enabled(): boolean;
  open(identity: WakeRequest, signal: AbortSignal): Promise<Session>;
};
export const WAKE_LIMITS = Object.freeze({ owners: 2, records: 128, cycles: 2,
  elapsedMs: 110000, cooldownMs: 5000, drainMs: 5000 });
const allowed = new Set(['host-disabled', 'owner-ineligible', 'host-misconfigured',
  'store-misconfigured', 'storage-unavailable', 'host-closed', 'wake-expired', 'not-found', 'stale-generation',
  'stale-conversation', 'stale-project', 'invalid-document', 'invalid-id', 'runtime-fenced']);
const failure = (code: string, retryAfter?: number): Admission =>
  ({ ok: false, code, ...(retryAfter === undefined ? {} : { retryAfter }) });
export function parseWakeIdentity(input: unknown): WakeIdentity {
  const value = cloneJson(input, 2048) as WakeIdentity;
  if (!value || Object.keys(value).sort().join(',') !== 'owner,userId' ||
      !Number.isSafeInteger(value.userId) || value.userId < 1) throw new Error('Invalid wake identity.');
  const { owner } = parsePickupBinding({ owner: value.owner });
  return Object.freeze({ owner, userId: value.userId });
}
function parseWakeRequest(input: unknown): WakeRequest {
  const value = cloneJson(input, 4096) as WakeRequest;
  if (value && Object.keys(value).sort().join(',') === 'owner,target,userId')
    return Object.freeze({ ...parseWakeIdentity({ owner: value.owner, userId: value.userId }),
      target: parseTurnTarget(value.target) });
  return parseWakeIdentity(value);
}
function continuation(input: unknown, dirty: boolean): { cursor: DiscoveryCursor | null } | null {
  const result = cloneJson(input, 131072) as any;
  if (!result || result.ok !== true || typeof result.complete !== 'boolean' || !Array.isArray(result.results) ||
      result.results.some((r: any) => ['refused', 'expired', 'needs-user-action', 'cancelled'].includes(r.turnState) ||
        ['failed', 'expired', 'cancelled'].includes(r.runStatus))) return null;
  if (result.complete) return result.stopReason === null && dirty ? { cursor: null } : null;
  if (!['scan-limit', 'work-limit'].includes(result.stopReason) || result.nextCursor === null) return null;
  const { cursor } = parseTurnDiscoveryInput({ limit: 1, cursor: result.nextCursor });
  return { cursor: dirty ? null : cursor };
}
type Job = { identity: WakeRequest; dirty: boolean; controller: AbortController;
  admission: Promise<Admission>; done: Promise<void> | null };

// Wake hints are ephemeral; durable turns and canonical leases remain authority.
export function createHostWake(services: WakeServices, { now = () => performance.now() } = {}) {
  const enabled = services.enabled.bind(services), open = services.open.bind(services);
  const active = new Map<string, Job>(), cooldowns = new Map<string, number>();
  let closed = false;
  return Object.freeze({
    async wake(input: unknown): Promise<Admission> {
      let identity: WakeRequest;
      try { identity = parseWakeRequest(input); } catch { return failure('invalid-input'); }
      if (closed) return failure('host-closed');
      try { if (enabled() !== true) return failure('host-disabled'); }
      catch { return failure('host-disabled'); }
      const previous = active.get(identity.owner);
      if (previous) {
        if (previous.identity.userId !== identity.userId) return failure('owner-ineligible');
        if (!sameTurnTarget(previous.identity.target, identity.target)) return failure('host-busy', 1);
        previous.dirty = true;
        const result = await previous.admission;
        return result.ok ? { ok: true, status: 'coalesced' } : result;
      }
      const start = now();
      for (const [owner, until] of cooldowns) if (!active.has(owner) && until <= start) cooldowns.delete(owner);
      const until = cooldowns.get(identity.owner);
      if (until !== undefined) return failure('wake-cooldown', Math.max(1, Math.ceil((until - start) / 1000)));
      if (active.size >= WAKE_LIMITS.owners) return failure('host-busy', 1);
      if (cooldowns.size >= WAKE_LIMITS.records) return failure('wake-capacity', 1);
      let admit!: (result: Admission) => void;
      const job: Job = { identity, dirty: false, controller: new AbortController(),
        admission: new Promise(resolve => { admit = resolve; }), done: null };
      active.set(identity.owner, job); cooldowns.set(identity.owner, start + WAKE_LIMITS.cooldownMs);
      const deadline = start + WAKE_LIMITS.elapsedMs, signal = job.controller.signal;
      const abortAdmission = () => admit(failure(closed ? 'host-closed' : 'wake-expired'));
      signal.addEventListener('abort', abortAdmission, { once: true });
      const timer = setTimeout(() => job.controller.abort(), WAKE_LIMITS.elapsedMs);
      job.done = (async () => {
        try {
          const session = await open(identity, signal);
          if (closed || signal.aborted || now() >= deadline) {
            admit(failure(closed ? 'host-closed' : 'wake-expired')); return;
          }
          if (enabled() !== true) { admit(failure('host-disabled')); return; }
          admit({ ok: true, status: 'accepted' });
          let cursor: DiscoveryCursor | null = null;
          for (let cycle = 0; cycle < WAKE_LIMITS.cycles; cycle++) {
            const remaining = Math.floor(deadline - now());
            if (closed || signal.aborted || remaining < 1000 || enabled() !== true) break;
            const result = await session.pickup({ cursor, maxScannedRows: 50, maxWorkItems: 5,
              maxElapsedMs: Math.min(110000, remaining) }, { signal });
            if (closed || signal.aborted || now() >= deadline) break;
            const next = continuation(result, job.dirty); job.dirty = false;
            if (!next) break;
            cursor = next.cursor;
          }
        } catch (error) {
          const code = (error as { code?: string })?.code;
          admit(failure(closed ? 'host-closed' : code && allowed.has(code) ? code : 'host-unavailable'));
        } finally { clearTimeout(timer); signal.removeEventListener('abort', abortAdmission); active.delete(identity.owner); }
      })();
      return job.admission;
    },
    async close(): Promise<{ drained: boolean }> {
      closed = true;
      const jobs = [...active.values()];
      for (const job of jobs) { job.dirty = false; job.controller.abort(); }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          Promise.all(jobs.map(job => job.done)).then(() => ({ drained: true })),
          new Promise<{ drained: boolean }>(resolve => { timer = setTimeout(() => resolve({ drained: false }), WAKE_LIMITS.drainMs); }),
        ]);
      } finally { clearTimeout(timer); }
    },
  });
}
