import { cloneJson } from '../tools/json.ts';
import { checkBinding } from './run-transaction.ts';
import { invalidRun } from './run-state.ts';
import { createRuntime, type Binding, type RuntimeBackend } from './runtime.ts';
import { providerProfile, type ModelProvider } from './provider.ts';
import { createTurnService } from './turns.ts';

const MAX_ADVANCE_CALLS = 8;
const ERRORS = new Set(['not-found', 'invalid-document', 'invalid-id', 'runtime-fenced',
  'store-misconfigured', 'storage-unavailable']);
const ended = (status: string) => ['succeeded', 'failed', 'cancelled', 'expired'].includes(status);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 128;

function record(input: unknown, keys: string[]) {
  let value;
  try { value = cloneJson(input, 2048); } catch { return invalidRun(); }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) invalidRun();
  return value as Record<string, unknown>;
}

function signalOption(options: unknown): AbortSignal | undefined {
  if (options === undefined) return undefined;
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(options))) invalidRun();
  const keys = Reflect.ownKeys(options);
  if (!keys.length) return undefined;
  if (keys.length !== 1 || keys[0] !== 'signal') invalidRun();
  const descriptor = Object.getOwnPropertyDescriptor(options, 'signal')!;
  if (!descriptor.enumerable || !('value' in descriptor) ||
    descriptor.value !== undefined && !(descriptor.value instanceof AbortSignal)) invalidRun();
  return descriptor.value;
}

export function parseTurnWorkInput(input: unknown) {
  const value = record(input, ['generation', 'turnId', 'workerId']);
  if (!identifier(value.generation) || !identifier(value.turnId) || !identifier(value.workerId)) invalidRun();
  return { generation: value.generation, turnId: value.turnId, workerId: value.workerId };
}

// This consumer has no queue or approval authority. The stored turn selects the
// canonical run; its existing leases and receipts own every durable effect.
export function createTurnWorker(backend: RuntimeBackend, provider?: ModelProvider) {
  const service = createTurnService(backend), runtime = createRuntime(backend);
  let transport: ModelProvider | undefined;
  if (provider !== undefined) {
    try {
      if (!provider || typeof provider.exchange !== 'function') invalidRun();
      transport = Object.freeze({ profile: providerProfile(provider.profile), exchange: provider.exchange.bind(provider) });
    } catch { invalidRun(); }
  }
  return Object.freeze({
    async work(binding: Binding, input: unknown, options?: { signal?: AbortSignal }) {
      try {
        const trusted = checkBinding(record(binding, ['owner', 'id']) as Binding);
        const { generation, turnId, workerId } = parseTurnWorkInput(input);
        const signal = signalOption(options), lookup = { generation, turnId };
        let advances = 0;
        const initial = await service.inspect(trusted, lookup);
        if (!initial.ok) return initial;

        async function status(phase: 'observe' | 'prepare' | 'execute', reason: string | null = null) {
          const current = await service.inspect(trusted, lookup);
          if (!current.ok) return current;
          const { id, revision, projectRevision, state, code } = current.turn;
          return { ok: true as const, generation: current.generation, revision: current.revision,
            phase, reason, advances, turn: { id, revision, projectRevision, state, code }, run: current.turn.run };
        }

        if (signal?.aborted) return await status('observe', 'aborted');
        if (initial.turn.state === 'submitted') {
          if (!transport) return { ok: false as const, code: 'provider-required' };
          const prepared = await service.prepare(trusted, {
            generation, turnId, workerId, revision: initial.turn.revision,
          }, transport, { signal });
          if (!prepared.ok) return prepared;
          return await status('prepare');
        }
        if (initial.turn.state !== 'approved') return await status('observe', initial.turn.state);
        const run = initial.turn.run;
        if (!run) return invalidRun();
        if (ended(run.status)) return await status('observe', run.status);
        if (signal?.aborted) return await status('observe', 'aborted');
        const claimed = await runtime.claim(trusted, run.id, workerId);
        if (!claimed.ok) return await status('execute', claimed.code);
        let lease = claimed.lease;
        for (let call = 0; call < MAX_ADVANCE_CALLS; call++) {
          if (signal?.aborted) return await status('execute', 'aborted');
          const step = await runtime.advance(trusted, run.id, lease);
          if (!step.ok) return await status('execute', step.code);
          advances++;
          if (ended(step.run.status)) return await status('execute');
          if (signal?.aborted) return await status('execute', 'aborted');
          if (call === MAX_ADVANCE_CALLS - 1) return await status('execute', 'step-limit');
          const renewed = await runtime.renew(trusted, run.id, lease);
          if (!renewed.ok) return await status('execute', renewed.code);
          lease = renewed.lease;
        }
        return await status('execute', 'step-limit');
      } catch (error) {
        const original = (error as { code?: string })?.code;
        throw Object.assign(new Error('Turn worker operation failed.'), {
          code: original && ERRORS.has(original) ? original : 'worker-failed',
        });
      }
    },
  });
}
