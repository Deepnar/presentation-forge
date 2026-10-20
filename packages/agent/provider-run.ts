import { cloneJson } from '../tools/json.ts';
import { createDocument } from '../tools/executor.ts';
import { createToolSession, validatedToolRequest, type ToolResult } from '../tools/session.ts';
import type { ToolRequest } from '../tools/request.generated.ts';
import { composeInstructions } from './context.ts';
import { providerProfile, providerFailure, type ModelProvider, type ProviderExchange, type ProviderCode } from './provider.ts';
import { parsePlan, parseProviderRunRequest } from './run-state.ts';
import { createRuntime, type Binding, type RuntimeBackend, type RunView } from './runtime.ts';
import type { ProviderRunRequest } from './provider-run-request.generated.ts';

type Code = 'invalid-request' | 'not-found' | 'stale-project' | 'storage-unavailable' |
  'cancelled' | 'deadline' | 'timeout' | 'provider-error' | 'invalid-response' |
  'tool-refused' | 'result-too-large' | 'invalid-proposal' | 'queue-refused';
export type TurnFailure = { ok: false; code: Code; message: string; providerCode?: ProviderCode };
const messages: Record<Code, string> = {
  'invalid-request': 'Provide a valid bounded request and trusted project scope.',
  'not-found': 'The project is not available to this caller.',
  'stale-project': 'The saved project changed. Prepare a new proposal from its current revision.',
  'storage-unavailable': 'Project storage could not complete the operation.',
  cancelled: 'The operation was cancelled.',
  deadline: 'The request deadline has passed.',
  timeout: 'The bounded provider attempt timed out.',
  'provider-error': 'The provider attempt did not produce a usable response.',
  'invalid-response': 'The response cannot form one supported bounded turn.',
  'tool-refused': 'A scoped tool refused the proposed content operation.',
  'result-too-large': 'The result exceeds its budget. Request less content.',
  'invalid-proposal': 'Queue the exact unexpired proposal from this host instance.',
  'queue-refused': 'The durable run could not be queued with this request identity.',
};
const fail = (code: Code): TurnFailure => ({ ok: false, code, message: messages[code] });
// Backend adapters preserve these domain errors while sanitizing driver failures.
const stop = (code: Code): never => { throw Object.assign(new Error(messages[code]), {
  code: code === 'cancelled' || code === 'deadline' ? 'runtime-fenced' : 'invalid-document', turnCode: code,
}); };
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function signalOption(options: unknown): AbortSignal | undefined {
  if (!options || typeof options !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) return stop('invalid-request');
  let signal: AbortSignal | undefined;
  for (const key of Reflect.ownKeys(options)) {
    const d = Object.getOwnPropertyDescriptor(options, key)!;
    if (key !== 'signal' || !d.enumerable || !('value' in d) || d.value !== undefined && !(d.value instanceof AbortSignal)) stop('invalid-request');
    signal = d.value;
  }
  return signal;
}
function bindingCopy(input: Binding): Binding {
  const b = JSON.parse(JSON.stringify(cloneJson(input, 1024))) as Binding;
  if (!b || Object.keys(b).sort().join(',') !== 'id,owner' ||
      typeof b.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(b.id) ||
      b.owner !== null && (typeof b.owner !== 'string' || !b.owner.trim() || b.owner.length > 128)) stop('invalid-request');
  return b;
}
function errorResult(error: unknown): TurnFailure {
  const e = error as { turnCode?: Code; code?: string };
  if (e?.turnCode && Object.hasOwn(messages, e.turnCode)) return fail(e.turnCode);
  if (e?.code === 'not-found') return fail('not-found');
  return fail('storage-unavailable');
}
function check(signal: AbortSignal | undefined, deadline: number, now: number) {
  if (signal?.aborted) stop('cancelled');
  if (now >= deadline) stop('deadline');
}
type Summary = Pick<ProviderExchange, 'providerId' | 'family' | 'model' | 'text' | 'usage'>;
export type EditProposal = {
  ok: true; outcome: 'edit-proposal'; proposalId: string; projectRevision: number;
  editCount: number; expiresAt: number; summary: Summary;
  edits: Extract<ToolRequest, { tool: 'edit_content' }>['args']['edits'];
};
export type TurnResult = TurnFailure | EditProposal | {
  ok: true; outcome: 'text' | 'refusal' | 'read-results'; projectRevision: number;
  summary: Summary; results: ToolResult[];
};

// Preparation is ephemeral. Only an explicit queue action persists the canonical
// semantic plan; no request text, provider response or new transcript is stored.
export function createProviderRunner(backend: RuntimeBackend, provider: ModelProvider) {
  const profile = providerProfile(provider.profile);
  const proposals = new WeakMap<object, { binding: Binding; plan: ReturnType<typeof parsePlan> }>();
  async function snapshot(binding: Binding, request: ProviderRunRequest, signal?: AbortSignal) {
    return backend.withRuntimeTransaction(binding, async tx => {
      const now = await tx.now();
      check(signal, request.deadlineAt, now);
      if (request.deadlineAt > now + 86400000) stop('invalid-request');
      if (tx.doc.revision !== request.projectRevision) stop('stale-project');
      const slides = new Set(tx.doc.scenes.map(s => s.id));
      if (request.scope.readableSlides.some(s => !slides.has(s)) ||
          [...request.scope.editableTargets, ...request.scope.selection].some(t => !request.scope.readableSlides.includes(t.slideId))) stop('invalid-request');
      return { scenes: structuredClone(tx.doc.scenes), remainingMs: request.deadlineAt - now };
    });
  }
  return Object.freeze({
    async prepare(binding: Binding, input: unknown, options: { signal?: AbortSignal } = {}): Promise<TurnResult> {
      let request: ProviderRunRequest, trusted: Binding, signal: AbortSignal | undefined;
      try {
        signal = signalOption(options);
        trusted = bindingCopy(binding);
        const copied = parseProviderRunRequest(input);
        if (!copied) return fail('invalid-request');
        request = copied;
        if (request.maxOutputTokens > profile.capabilities.maxOutputTokens || !profile.capabilities.toolCalling) return fail('invalid-request');
      } catch { return fail('invalid-request'); }
      try {
        const initial = await snapshot(trusted, request, signal);
        const document = await createDocument(initial.scenes), identity = trusted.owner ?? 'local';
        const session = createToolSession({ document, projectId: trusted.id, ownerId: identity,
          actorId: identity, agentId: request.requestId, ...request.scope });
        const context = await composeInstructions({ session, request: request.request, reads: request.reads,
          maxChars: request.contextChars });
        if (!context.ok) return fail(context.code === 'context-too-large' ? 'result-too-large' : 'tool-refused');
        const networkWindow = await snapshot(trusted, request, signal);
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let abort: () => void = () => {};
        const stopped = new Promise<TurnFailure>(resolve => {
          abort = () => { controller.abort(); resolve(fail('cancelled')); };
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
          timer = setTimeout(() => { controller.abort(); resolve(fail(networkWindow.remainingMs <= 120000 ? 'deadline' : 'timeout')); }, Math.min(networkWindow.remainingMs, 120000));
        });
        let raw: unknown;
        try {
          if (signal?.aborted) return fail('cancelled');
          raw = await Promise.race([Promise.resolve().then(() => provider.exchange(context, {
            signal: controller.signal, maxOutputTokens: request.maxOutputTokens,
          })).catch(() => fail('provider-error')), stopped]);
        } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
        if (signal?.aborted) return fail('cancelled');
        // The injectable provider is a host dependency, but every returned request
        // still crosses canonical validation before it can reach a durable plan.
        let response: ProviderExchange;
        try {
          const copied = cloneJson(raw, 262144);
          if (copied && typeof copied === 'object' && !Array.isArray(copied) && copied.ok === false) {
            const data = copied;
            const code = (data as unknown as { code: ProviderCode }).code;
            if (Object.hasOwn(messages, code) && ['cancelled', 'deadline', 'timeout', 'provider-error'].includes(code)) return fail(code as Code);
            if (!['invalid-request','unsupported-capability','context-too-large','invalid-response','truncated','unauthorized','rate-limited','provider-unavailable','timeout','cancelled','response-too-large'].includes(code)) return fail('invalid-response');
            return { ...fail('provider-error'), providerCode: code, message: providerFailure(code).message };
          }
          const data = copied as unknown as ProviderExchange;
          if (!data || data.ok !== true || data.providerId !== profile.id || data.family !== profile.family ||
              typeof data.model !== 'string' || !data.model.trim() || data.model.length > 128 ||
              typeof data.text !== 'string' || data.text.length > 32000 ||
              !['text', 'refusal', 'tool-calls'].includes(data.outcome) || !Array.isArray(data.calls) || data.calls.length > 8 ||
              Object.keys(data).sort().join(',') !== 'calls,family,model,ok,outcome,providerId,text,usage') return fail('invalid-response');
          const ids = new Set<string>(), allowed = new Set(context.tools.map(t => t.name));
          for (const call of data.calls) {
            if (!call || Object.keys(call).sort().join(',') !== 'id,request' || typeof call.id !== 'string' ||
                !call.id.trim() || call.id.length > 128 || ids.has(call.id)) return fail('invalid-response');
            ids.add(call.id);
            const canonical = validatedToolRequest(call.request);
            if (!canonical || !allowed.has(canonical.tool) || canonical.tool === 'edit_content' && canonical.args.baseRevision !== context.revision) return fail('invalid-response');
            call.request = canonical;
          }
          if ((data.calls.length > 0) !== (data.outcome === 'tool-calls') || data.outcome === 'text' && !data.text.trim()) return fail('invalid-response');
          if (data.usage !== null) {
            if (!data.usage || Object.keys(data.usage).some(k => !['inputTokens','outputTokens','cacheReadInputTokens','cacheWriteInputTokens'].includes(k)) ||
                !['inputTokens','outputTokens'].every(k => Object.hasOwn(data.usage!, k)) ||
                Object.values(data.usage).some(v => !Number.isSafeInteger(v) || v < 0 || v > 100000000) ||
                data.usage.outputTokens > request.maxOutputTokens) return fail('invalid-response');
          }
          response = data;
        } catch { return fail('invalid-response'); }
        const { providerId, family, model, text, usage } = response;
        const summary = { providerId, family, model, text, usage };
        const edits = response.calls.filter(c => c.request.tool === 'edit_content');
        if (edits.length && edits.length !== response.calls.length) return fail('invalid-response');
        if (edits.length) {
          const batch = validatedToolRequest({ tool: 'edit_content', args: { baseRevision: context.revision,
            edits: edits.flatMap(c => c.request.tool === 'edit_content' ? c.request.args.edits : []) } });
          if (!batch || batch.tool !== 'edit_content') return fail('invalid-response');
          const preflight = await session.execute(batch, crypto.randomUUID());
          if (!preflight.ok) return fail('tool-refused');
          let plan: ReturnType<typeof parsePlan>;
          try {
            plan = parsePlan({ requestId: request.requestId, projectRevision: request.projectRevision,
              scope: request.scope, steps: [batch], maxSteps: 8, maxFailures: 1, deadlineAt: request.deadlineAt });
          } catch { return fail('invalid-response'); }
          await snapshot(trusted, request, signal);
          const proposal: EditProposal = freeze({ ok: true, outcome: 'edit-proposal', proposalId: crypto.randomUUID(),
            projectRevision: request.projectRevision, editCount: batch.args.edits.length, expiresAt: request.deadlineAt,
            edits: structuredClone(batch.args.edits), summary });
          if (JSON.stringify(proposal).length > 65536) return fail('result-too-large');
          proposals.set(proposal, { binding: trusted, plan });
          return proposal;
        }
        const results: ToolResult[] = [];
        for (const call of response.calls) {
          const result = await session.execute(call.request);
          if (!result.ok) return fail('tool-refused');
          results.push(result);
        }
        const output = { ok: true as const, outcome: response.outcome === 'tool-calls' ? 'read-results' as const : response.outcome,
          projectRevision: request.projectRevision, summary, results };
        if (JSON.stringify(output).length > 65536) return fail('result-too-large');
        await snapshot(trusted, request, signal);
        return freeze(output);
      } catch (error) { return errorResult(error); }
    },
    async enqueue(proposal: unknown, options: { signal?: AbortSignal } = {}): Promise<TurnFailure | { ok: true; outcome: 'queued'; run: RunView }> {
      let signal: AbortSignal | undefined;
      try { signal = signalOption(options); } catch { return fail('invalid-request'); }
      const prepared = proposal && typeof proposal === 'object' ? proposals.get(proposal) : undefined;
      if (!prepared) return fail('invalid-proposal');
      const { binding, plan } = prepared;
      const guarded: RuntimeBackend = {
        withRuntimeTransaction: (bound, job) => backend.withRuntimeTransaction(bound, async tx => {
          check(signal, plan.deadlineAt, await tx.now());
          if (tx.doc.revision !== plan.projectRevision && !(await tx.query(
            'SELECT id FROM v2_agent_runs WHERE project_id=? AND request_key=?', [binding.id, plan.requestId],
          )).length) stop('stale-project');
          let innerGuard: (() => Promise<void>) | undefined;
          const result = await job({ ...tx, beforeCommit: guard => { innerGuard = guard; } });
          tx.beforeCommit(async () => {
            await innerGuard?.();
            check(signal, plan.deadlineAt, await tx.now());
          });
          return result;
        }),
      };
      try {
        const run = await createRuntime(guarded).start(binding, plan);
        return { ok: true, outcome: 'queued', run };
      } catch (error) {
        if ((error as { turnCode?: Code })?.turnCode) return errorResult(error);
        if ((error as { code?: string })?.code === 'invalid-document') return fail('queue-refused');
        return errorResult(error);
      }
    },
  });
}
