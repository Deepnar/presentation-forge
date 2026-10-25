import { createRuntime, type Binding } from './runtime.ts';

const MAX_ADVANCE_CALLS = 8;
const ended = (status: string) => ['succeeded', 'failed', 'cancelled', 'expired'].includes(status);

// Internal consumer loop: only the canonical runtime can claim, commit or renew.
// Current visible-turn proposals contain one batch; the bound also covers future
// consumers without relaxing the turn store's stricter proposal contract.
export async function advanceTurnRun(runtime: ReturnType<typeof createRuntime>, binding: Binding,
  runId: string, workerId: string, signal?: AbortSignal) {
  let advances = 0;
  if (signal?.aborted) return { advances, reason: 'aborted' };
  const claimed = await runtime.claim(binding, runId, workerId);
  if (!claimed.ok) return { advances, reason: claimed.code };
  let lease = claimed.lease;
  for (let call = 0; call < MAX_ADVANCE_CALLS; call++) {
    if (signal?.aborted) return { advances, reason: 'aborted' };
    const step = await runtime.advance(binding, runId, lease);
    if (!step.ok) return { advances, reason: step.code };
    advances++;
    if (ended(step.run.status)) return { advances, reason: null };
    if (signal?.aborted) return { advances, reason: 'aborted' };
    if (call === MAX_ADVANCE_CALLS - 1) return { advances, reason: 'step-limit' };
    const renewed = await runtime.renew(binding, runId, lease);
    if (!renewed.ok) return { advances, reason: renewed.code };
    lease = renewed.lease;
  }
  return { advances, reason: 'step-limit' };
}
