import { cloneJson } from '../tools/json.ts';
import { parseDiscoveryBinding, parseTurnDiscoveryInput, discoveryIdentifier,
  discoveryProjectId, type DiscoveryCursor } from './turn-discovery-input.ts';
import type { ModelProvider } from './provider.ts';

type Owner = { owner: string };
type Binding = Owner & { id: string };
export type PickupSession = {
  authorize(): void | Promise<void>;
  provider(): ModelProvider | Promise<ModelProvider>;
};
export type PickupPolicy = { open(binding: Owner): PickupSession | Promise<PickupSession> };
export type PickupServices = {
  discover(binding: Owner, input: { limit: number; cursor: DiscoveryCursor | null }): Promise<any>;
  inspect(binding: Binding, input: { generation: string; turnId: string }): Promise<any>;
  work(binding: Binding, input: { generation: string; turnId: string; workerId: string },
    provider: ModelProvider | undefined, options: { signal: AbortSignal }): Promise<any>;
};
const failures = new Set(['not-found', 'invalid-document', 'invalid-id', 'runtime-fenced',
  'store-misconfigured', 'storage-unavailable', 'host-disabled', 'owner-ineligible',
  'host-misconfigured', 'provider-required', 'worker-failed', 'discovery-failed',
  'stale-generation', 'stale-conversation', 'stale-project', 'busy', 'lease-lost',
  'aborted', 'step-limit', 'rate-limited']);
const obsolete = new Set(['not-found', 'stale-generation', 'stale-conversation', 'stale-project']);
const states = new Set(['submitted', 'preparing', 'awaiting-decision', 'complete', 'refused',
  'needs-user-action', 'cancelled', 'expired', 'approved', 'rejected']);
const runStates = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']);
const ended = new Set(['succeeded', 'failed', 'cancelled', 'expired']);
const codeOf = (error: unknown, fallback = 'worker-failed') => {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && failures.has(code) ? code : fallback;
};
const invalid = (): never => { throw Object.assign(new Error('Invalid pickup request.'), { code: 'invalid-input' }); };
const integer = (n: unknown, min: number, max: number) => Number.isSafeInteger(n) && Number(n) >= min && Number(n) <= max;
export function parsePickupBinding(input: unknown): Owner {
  const binding = parseDiscoveryBinding(input);
  if (binding.owner === null) return invalid();
  return { owner: binding.owner };
}
export function parsePickupInput(input: unknown) {
  const value = cloneJson(input, 4096) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'cursor,maxElapsedMs,maxScannedRows,maxWorkItems' ||
      !integer(value.maxScannedRows, 1, 50) || !integer(value.maxWorkItems, 1, 5) ||
      !integer(value.maxElapsedMs, 1000, 110000)) return invalid();
  const { cursor } = parseTurnDiscoveryInput({ limit: 1, cursor: value.cursor });
  return { cursor, maxScannedRows: Number(value.maxScannedRows),
    maxWorkItems: Number(value.maxWorkItems), maxElapsedMs: Number(value.maxElapsedMs) };
}
function signalOf(options: unknown): AbortSignal | undefined {
  if (options === undefined) return undefined;
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options))) return invalid();
  const keys = Reflect.ownKeys(options);
  if (!keys.length) return undefined;
  const d = Object.getOwnPropertyDescriptor(options, 'signal');
  if (keys.length !== 1 || !d?.enumerable || !('value' in d) ||
      d.value !== undefined && !(d.value instanceof AbortSignal)) return invalid();
  return d.value;
}
function hintOf(page: any) {
  if (!page || page.ok !== true || !Array.isArray(page.items) || page.items.length > 1 ||
      !integer(page.scannedRows, 0, 1) || typeof page.hasMore !== 'boolean' ||
      page.items.length > page.scannedRows || page.hasMore && page.scannedRows !== 1 ||
      page.hasMore === (page.nextCursor === null)) throw new Error();
  parseTurnDiscoveryInput({ limit: 1, cursor: page.nextCursor });
  const hint = page.items[0];
  if (hint && (!discoveryProjectId(hint.projectId) || !discoveryIdentifier(hint.turnId) ||
      !discoveryIdentifier(hint.generation) || !integer(hint.turnRevision, 0, Number.MAX_SAFE_INTEGER) ||
      !['submitted', 'preparing', 'approved'].includes(hint.state))) throw new Error();
  if (hint && page.hasMore && (page.nextCursor.projectId !== hint.projectId || page.nextCursor.turnId !== hint.turnId)) throw new Error();
  return hint as { projectId: string; turnId: string; generation: string } | undefined;
}
function summary(hint: { projectId: string; turnId: string; generation: string }, result: any) {
  if (!result || result.ok !== true || !states.has(result.turn?.state) ||
      !['observe', 'prepare', 'execute'].includes(result.phase) ||
      !integer(result.advances, 0, 8) || result.run !== null && !runStates.has(result.run?.status)) throw new Error();
  return { projectId: hint.projectId, turnId: hint.turnId, generation: hint.generation, phase: result.phase as string,
    turnState: result.turn.state as string, runStatus: result.run?.status as string | undefined ?? null,
    advances: result.advances as number };
}
function finished(result: ReturnType<typeof summary>) {
  return !['submitted', 'preparing', 'approved'].includes(result.turnState) ||
    result.turnState === 'approved' && result.runStatus !== null && ended.has(result.runStatus);
}

// A cursor records completed positions, never a work capability or a new queue.
export function createTurnPickup(services: PickupServices, policy: PickupPolicy,
  { now = () => performance.now() }: { now?: () => number } = {}) {
  const discover = services.discover.bind(services), inspect = services.inspect.bind(services),
    work = services.work.bind(services), open = policy.open.bind(policy);
  return Object.freeze({ async pickup(binding: unknown, input: unknown, options?: { signal?: AbortSignal }) {
    const trusted = Object.freeze(parsePickupBinding(binding)), request = parsePickupInput(input), signal = signalOf(options);
    const controller = new AbortController(), start = now(), workerId = 'pickup-' + crypto.randomUUID();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, request.maxElapsedMs);
    let cursor = request.cursor, scannedRows = 0, workItems = 0, completedItems = 0;
    const results: ReturnType<typeof summary>[] = [];
    const response = (ok: boolean, complete: boolean, stopReason: string | null) => {
      const result = { ok, scannedRows, workItems, completedItems, nextCursor: cursor, complete, stopReason, results };
      if (new TextEncoder().encode(JSON.stringify(result)).length > 131072) throw new Error('Pickup output exceeded its bound.');
      return result;
    };
    const stopping = () => signal?.aborted ? 'aborted'
      : controller.signal.aborted || now() - start >= request.maxElapsedMs ? 'time-limit' : null;
    try {
      if (stopping()) return response(true, false, stopping());
      const session = await open(trusted), authorize = session.authorize.bind(session), providerFor = session.provider.bind(session);
      while (true) {
        if (stopping()) return response(true, false, stopping());
        if (scannedRows >= request.maxScannedRows) return response(true, false, 'scan-limit');
        if (workItems >= request.maxWorkItems) return response(true, false, 'work-limit');
        await authorize();
        const page = cloneJson(await discover(trusted, { limit: 1, cursor }), 131072) as any, hint = hintOf(page);
        if (stopping()) return response(true, false, stopping());
        scannedRows += page.scannedRows;
        if (hint) {
          const target = Object.freeze({ owner: trusted.owner, id: hint.projectId });
          const lookup = { generation: hint.generation, turnId: hint.turnId };
          const inspected = await inspect(target, lookup);
          if (!inspected.ok) {
            if (!obsolete.has(inspected.code)) return response(false, false, codeOf(inspected));
          } else {
            if (!states.has(inspected.turn?.state)) throw new Error();
            const provider = inspected.turn.state === 'submitted' ? await providerFor() : undefined;
            if (stopping()) return response(true, false, stopping());
            await authorize();
            if (stopping()) return response(true, false, stopping());
            workItems++;
            const worked = await work(target, { ...lookup, workerId }, provider, { signal: controller.signal });
            if (!worked.ok) {
              if (!obsolete.has(worked.code)) return response(false, false, codeOf(worked));
            } else {
              const item = summary(hint, worked); results.push(item);
              if (!finished(item)) return response(true, false, stopping() ?? codeOf({ code: worked.reason ?? 'busy' }, 'busy'));
              completedItems++;
            }
          }
        }
        cursor = parseTurnDiscoveryInput({ limit: 1, cursor: page.nextCursor }).cursor;
        if (!page.hasMore) return response(true, true, null);
      }
    } catch (error) { return response(false, false, codeOf(error)); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  } });
}
