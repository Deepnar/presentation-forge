import { cloneJson } from '../tools/json.ts';
import { createDocument } from '../tools/executor.ts';
import { createToolSession, validatedToolRequest, type ToolResult } from '../tools/session.ts';
import type { ToolRequest } from '../tools/request.generated.ts';
import { composeInstructions } from './context.ts';
import { providerProfile, providerFailure, normalizedExchange, prepareExchange, type ModelProvider, type ProviderExchange, type ProviderCode, type ReadRound, type ExchangeOptions } from './provider.ts';
import { parsePlan, parseProviderRunRequest, parseConversationRequest } from './run-state.ts';
import { createRuntime, type Binding, type RuntimeBackend, type RunView } from './runtime.ts';
import type { ProviderRunRequest } from './provider-run-request.generated.ts';
import type { ConversationRequest } from './conversation-request.generated.ts';

type Code = 'invalid-request' | 'not-found' | 'stale-project' | 'storage-unavailable' |
  'cancelled' | 'deadline' | 'timeout' | 'provider-error' | 'invalid-response' |
  'budget-exhausted' | 'tool-refused' | 'result-too-large' | 'invalid-proposal' | 'queue-refused';
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
  'budget-exhausted': 'The bounded conversation allowance is exhausted. Start a new explicit request.',
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

export type ConversationTrace = {
  exchanges: number; toolCalls: number; reservedOutputTokens: number;
  reportedInputTokens: number | null; reportedOutputTokens: number | null;
  steps: { step: number; providerId: string; family: string; model: string;
    wireChars: number; reservedOutputTokens: number; durationMs: number | null;
    outcome: string; toolNames: string[] }[];
};
export type ConversationResult = TurnResult & { conversation: ConversationTrace };
type Loop = { limits: ConversationRequest['limits']; history: ReadRound[]; ids: Set<string>; trace: ConversationTrace };
const newTrace = (): ConversationTrace => ({ exchanges: 0, toolCalls: 0, reservedOutputTokens: 0,
  reportedInputTokens: 0, reportedOutputTokens: 0, steps: [] });

// Preparation is ephemeral. Only an explicit queue action persists the canonical
// semantic plan; no request text, provider response or new transcript is stored.
export type ProviderRunHost = {
  planDeadlineAt?: number;
  reserve(event: { step: number; outputTokens: number }): Promise<string>;
  dispatch(attemptId: string): Promise<void>;
  receipt(attemptId: string, usage: ProviderExchange['usage']): Promise<void>;
  proposal(plan: ReturnType<typeof parsePlan>): Promise<void>;
};
// Only the trusted host factory supplies this bridge; model/request JSON cannot
// carry persistence callbacks or convert copied proposal DTOs into capabilities.
export function createProviderRunner(backend: RuntimeBackend, provider: ModelProvider, host?: ProviderRunHost) {
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
  async function prepareTurn(binding: Binding, input: unknown, options: { signal?: AbortSignal } = {}, loop?: Loop): Promise<TurnResult> {
      const publish = <T extends TurnResult>(result: T): T => freeze(loop ? { ...result, conversation: structuredClone(loop.trace) } : result);
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
        if (signal?.aborted) return fail('cancelled');
        const document = await createDocument(initial.scenes), identity = trusted.owner ?? 'local';
        if (signal?.aborted) return fail('cancelled');
        const session = createToolSession({ document, projectId: trusted.id, ownerId: identity,
          actorId: identity, agentId: request.requestId, ...request.scope,
          ...(loop ? { limits: { maxCalls: request.reads.length + loop.limits.maxToolCalls + 1 } } : {}) });
        const context = await composeInstructions({ session, request: request.request, reads: request.reads,
          maxChars: request.contextChars });
        if (signal?.aborted) return fail('cancelled');
        if (!context.ok) return fail(context.code === 'context-too-large' ? 'result-too-large' : 'tool-refused');
        for (;;) {
          const networkWindow = await snapshot(trusted, request, signal);
          if (signal?.aborted) return fail('cancelled');
          const remainingOutput = loop ? loop.limits.maxOutputTokensTotal - loop.trace.reservedOutputTokens : request.maxOutputTokens;
          if (loop && (loop.trace.exchanges >= loop.limits.maxExchanges || remainingOutput < 1)) return fail('budget-exhausted');
          const outputTokens = Math.min(request.maxOutputTokens, remainingOutput);
          const exchangeOptions: ExchangeOptions = { maxOutputTokens: outputTokens,
            ...(loop ? { contextChars: Math.min(request.contextChars, profile.capabilities.contextChars), history: structuredClone(loop.history) } : {}) };
          const prepared = loop ? prepareExchange(profile, context, exchangeOptions) : null;
          if (prepared && 'ok' in prepared && prepared.ok === false) return fail(prepared.code === 'context-too-large' ? 'result-too-large' : 'invalid-request');
          let step: ConversationTrace['steps'][number] | undefined;
          const priorInput = loop?.trace.reportedInputTokens, priorOutput = loop?.trace.reportedOutputTokens;
          const started = performance.now();
          if (loop) {
            loop.trace.exchanges++; loop.trace.reservedOutputTokens += outputTokens;
            loop.trace.reportedInputTokens = null; loop.trace.reportedOutputTokens = null;
            step = { step: loop.trace.exchanges, providerId: profile.id, family: profile.family, model: profile.model,
              wireChars: prepared && 'wire' in prepared ? JSON.stringify(prepared.wire).length : 0,
              reservedOutputTokens: outputTokens, durationMs: null, outcome: 'error', toolNames: [] };
            loop.trace.steps.push(step);
          }
          const attemptId = await host?.reserve({ step: loop ? loop.trace.exchanges - 1 : 0, outputTokens });
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
            raw = await Promise.race([Promise.resolve().then(() => {
              if (controller.signal.aborted || signal?.aborted) return providerFailure('cancelled');
              return (async () => {
                if (attemptId !== undefined) await host!.dispatch(attemptId);
                if (controller.signal.aborted || signal?.aborted) return providerFailure('cancelled');
                const raw = await provider.exchange(loop ? freeze(structuredClone(context)) : context, {
                  ...exchangeOptions, ...(loop ? { history: freeze(structuredClone(loop.history)) } : {}), signal: controller.signal,
                });
                // A late validated receipt still settles its bounded slot after
                // cancellation/clear; it can never publish a stale turn.
                const accepted = normalizedExchange(profile, context, raw, outputTokens);
                if (attemptId !== undefined && accepted) await host!.receipt(attemptId, accepted.usage);
                return raw;
              })();
            }).catch(() => fail('provider-error')), stopped]);
          } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (step) step.durationMs = performance.now() - started; }
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
            const data = normalizedExchange(profile, context, copied, outputTokens);
            if (!data) return fail('invalid-response');
            response = data;
          } catch { return fail('invalid-response'); }
          if (loop) {
            loop.trace.reportedInputTokens = priorInput !== null && priorInput !== undefined && response.usage !== null
              ? priorInput + response.usage.inputTokens : null;
            loop.trace.reportedOutputTokens = priorOutput !== null && priorOutput !== undefined && response.usage !== null
              ? priorOutput + response.usage.outputTokens : null;
            if (response.calls.some(c => loop.ids.has(c.id))) return fail('invalid-response');
            if (loop.trace.toolCalls + response.calls.length > loop.limits.maxToolCalls) return fail('budget-exhausted');
            response.calls.forEach(c => loop.ids.add(c.id)); loop.trace.toolCalls += response.calls.length;
            if (step) { step.outcome = response.outcome; step.toolNames = response.calls.map(c => c.request.tool); }
          }
          const { providerId, family, model, text, usage } = response;
          const summary = { providerId, family, model, text, usage };
          const edits = response.calls.filter(c => c.request.tool === 'edit_content');
          if (edits.length && edits.length !== response.calls.length) return fail('invalid-response');
          if (edits.length) {
            const batch = validatedToolRequest({ tool: 'edit_content', args: { baseRevision: context.revision,
              edits: edits.flatMap(c => c.request.tool === 'edit_content' ? c.request.args.edits : []) } });
            if (!batch || batch.tool !== 'edit_content') return fail('invalid-response');
            const preflight = await session.execute(batch, crypto.randomUUID());
            if (signal?.aborted) return fail('cancelled');
            if (!preflight.ok) return fail('tool-refused');
            let plan: ReturnType<typeof parsePlan>;
            try {
              plan = parsePlan({ requestId: request.requestId, projectRevision: request.projectRevision,
                scope: request.scope, steps: [batch], maxSteps: 8, maxFailures: 1, deadlineAt: host?.planDeadlineAt ?? request.deadlineAt });
            } catch { return fail('invalid-response'); }
            await snapshot(trusted, request, signal);
            if (signal?.aborted) return fail('cancelled');
            const proposal: EditProposal = publish({ ok: true, outcome: 'edit-proposal', proposalId: crypto.randomUUID(),
              projectRevision: request.projectRevision, editCount: batch.args.edits.length, expiresAt: request.deadlineAt,
              edits: structuredClone(batch.args.edits), summary });
            if (JSON.stringify(proposal).length > 65536) return fail('result-too-large');
            await host?.proposal(freeze(structuredClone(plan)));
            proposals.set(proposal, { binding: trusted, plan });
            return proposal;
          }
          const results: ToolResult[] = [];
          for (const call of response.calls) {
            await snapshot(trusted, request, signal);
            if (signal?.aborted) return fail('cancelled');
            const result = await session.execute(call.request);
            if (signal?.aborted) return fail('cancelled');
            if (!result.ok) return fail('tool-refused');
            results.push(result);
          }
          const output = { ok: true as const, outcome: response.outcome === 'tool-calls' ? 'read-results' as const : response.outcome,
            projectRevision: request.projectRevision, summary, results };
          if (JSON.stringify(output).length > 65536) return fail('result-too-large');
          await snapshot(trusted, request, signal);
          if (signal?.aborted) return fail('cancelled');
          if (loop && response.calls.length) {
            loop.history.push({ exchange: structuredClone(response), results: structuredClone(results) });
            if (step) step.outcome = 'read-results';
            continue;
          }
          return publish(output);
        }
      } catch (error) { return errorResult(error); }
  }
  return Object.freeze({
    prepare(binding: Binding, input: unknown, options: { signal?: AbortSignal } = {}) {
      return prepareTurn(binding, input, options);
    },
    async converse(binding: Binding, input: unknown, options: { signal?: AbortSignal } = {}): Promise<ConversationResult> {
      const trace = newTrace();
      const finish = (result: TurnResult): ConversationResult => {
        if (Object.hasOwn(result, 'conversation')) return result as ConversationResult;
        return freeze({ ...result, conversation: structuredClone(trace) });
      };
      let request: ConversationRequest, signal: AbortSignal | undefined;
      try {
        signal = signalOption(options);
        const parsed = parseConversationRequest(input);
        if (!parsed) return finish(fail('invalid-request'));
        request = parsed;
      } catch { return finish(fail('invalid-request')); }
      if (signal?.aborted) return finish(fail('cancelled'));
      const { limits, ...base } = request;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined, abort: () => void = () => {};
      const remaining = request.deadlineAt - Date.now();
      if (remaining <= 0) return finish(fail('deadline'));
      const stopped = new Promise<TurnFailure>(resolve => {
        abort = () => { controller.abort(); resolve(fail('cancelled')); };
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        timer = setTimeout(() => { controller.abort(); resolve(fail(remaining <= 120000 ? 'deadline' : 'timeout')); }, Math.min(remaining, 120000));
      });
      try {
        const result = await Promise.race([prepareTurn(binding, base, { signal: controller.signal },
          { limits, history: [], ids: new Set(), trace }), stopped]);
        return finish(result);
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
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
