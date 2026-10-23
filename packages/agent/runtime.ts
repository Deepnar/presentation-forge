import { checkBinding, view, finish, load, save, expire, queueRun } from './run-transaction.ts';
import { createDocument, type SlideScene } from "../tools/executor.ts";
import { createToolSession, type ToolResult } from "../tools/session.ts";
import {
  parsePlan,
  parseRun,
  parseReceipt,
  planDigest,
  terminal,
  invalidRun,
  type RunRecord,
} from "./run-state.ts";

export type Binding = { owner: string | null; id: string };
export type Lease = NonNullable<RunRecord["lease"]>;
export interface RuntimeTransaction {
  doc: { id: string; revision: number; scenes: SlideScene[] };
  query(
    sql: string,
    params?: (string | number | null)[],
  ): Promise<Record<string, unknown>[]>;
  now(): Promise<number>;
  beforeCommit(guard: () => Promise<void>): void;
  saveScenes(
    scenes: SlideScene[],
    provenance: {
      actor: "agent";
      agentId: string;
      envelopeIds: string[];
      engineRevision: number;
      historyLength: number;
    },
  ): Promise<number>;
}
export interface RuntimeBackend {
  withRuntimeTransaction<T>(
    binding: Binding,
    job: (tx: RuntimeTransaction) => Promise<T>,
  ): Promise<T>;
}
export type RunView = Pick<
  RunRecord,
  | "id"
  | "projectId"
  | "projectRevision"
  | "status"
  | "code"
  | "revision"
  | "cursor"
  | "attempts"
  | "failures"
  | "createdAt"
  | "updatedAt"
> & { deadlineAt: number; stepCount: number };
type Refusal = {
  ok: false;
  code: "busy" | "lease-lost" | "terminal" | "not-found";
  run?: RunView;
};
import type { RunReceipt } from "./receipt.generated.ts";
export type Receipt = RunReceipt;
const identifier = (id: string) => {
  if (typeof id !== "string" || !id.trim() || id.length > 128) invalidRun();
  return id;
};
function validLease(lease: Lease) {
  if (
    !lease ||
    Object.keys(lease).sort().join(",") !== "fence,until,workerId" ||
    !Number.isSafeInteger(lease.fence) ||
    lease.fence < 1 ||
    !Number.isSafeInteger(lease.until) ||
    lease.until < 0
  )
    invalidRun();
  return {
    workerId: identifier(lease.workerId),
    fence: lease.fence,
    until: lease.until,
  };
}
const duration = (ms: number) => {
  if (!Number.isSafeInteger(ms) || ms < 100 || ms > 30000) invalidRun();
  return ms;
};
const owns = (run: RunRecord, lease: Lease, now: number) =>
  run.lease !== null &&
  run.lease.workerId === lease.workerId &&
  run.lease.fence === lease.fence &&
  run.lease.until > now;

// The backend owns transaction/authorization; this core never opens a database,
// starts a browser job or couples execution to a transport connection.
export function createRuntime(backend: RuntimeBackend) {
  async function transact<T>(
    binding: Binding,
    id: string,
    job: (tx: RuntimeTransaction, run: RunRecord, now: number) => Promise<T>,
  ) {
    const trusted = checkBinding(binding);
    identifier(id);
    return backend.withRuntimeTransaction(trusted, async (tx) => {
      const run = await load(tx, trusted, id),
        now = await tx.now();
      await expire(tx, run, now);
      return job(tx, run, now);
    });
  }
  return Object.freeze({
    async start(binding: Binding, input: unknown): Promise<RunView> {
      const trusted = checkBinding(binding),
        plan = parsePlan(input),
        digest = await planDigest(plan);
      return backend.withRuntimeTransaction(trusted, async (tx) => {
        return queueRun(tx, trusted, plan, digest);
      });
    },
    async inspect(binding: Binding, id: string) {
      return transact(binding, id, async (tx, run) => ({
        run: view(run),
        receipts: (
          await tx.query(
            "SELECT payload FROM v2_agent_receipts WHERE run_id=? ORDER BY step",
            [id],
          )
        ).map((row) => parseReceipt(JSON.parse(String(row.payload)))),
      }));
    },
    async cancel(binding: Binding, id: string) {
      return transact(binding, id, async (tx, run, now) => {
        if (!terminal(run)) {
          finish(run, "cancelled", "cancelled");
          await save(tx, run, now);
        }
        return view(run);
      });
    },
    async claim(
      binding: Binding,
      id: string,
      workerId: string,
      leaseMs = 10000,
    ): Promise<{ ok: true; lease: Lease; run: RunView } | Refusal> {
      identifier(workerId);
      duration(leaseMs);
      return transact(binding, id, async (tx, run, now) => {
        if (terminal(run))
          return { ok: false, code: "terminal", run: view(run) };
        if (run.lease && run.lease.until > now)
          return { ok: false, code: "busy", run: view(run) };
        if (run.attempts >= run.plan.maxSteps) {
          finish(run, "failed", "step-budget");
          await save(tx, run, now);
          return { ok: false, code: "terminal", run: view(run) };
        }
        run.fence++;
        run.lease = {
          workerId,
          fence: run.fence,
          until: Math.min(now + leaseMs, run.plan.deadlineAt),
        };
        run.pendingAttempt = null;
        run.status = "running";
        await save(tx, run, now);
        return { ok: true, lease: { ...run.lease }, run: view(run) };
      });
    },
    async renew(
      binding: Binding,
      id: string,
      token: Lease,
      leaseMs = 10000,
    ): Promise<{ ok: true; lease: Lease; run: RunView } | Refusal> {
      const lease = validLease(token);
      duration(leaseMs);
      return transact(binding, id, async (tx, run, now) => {
        if (terminal(run))
          return { ok: false, code: "terminal", run: view(run) };
        if (!owns(run, lease, now))
          return { ok: false, code: "lease-lost", run: view(run) };
        run.lease!.until = Math.min(now + leaseMs, run.plan.deadlineAt);
        await save(tx, run, now);
        return { ok: true, lease: { ...run.lease! }, run: view(run) };
      });
    },
    async advance(
      binding: Binding,
      id: string,
      token: Lease,
    ): Promise<
      { ok: true; run: RunView; receipt: Receipt; result: ToolResult } | Refusal
    > {
      const lease = validLease(token);
      const reservation = await transact(
        binding,
        id,
        async (
          tx,
          run,
          now,
        ): Promise<{ ok: true; attempt: number } | Refusal> => {
          if (terminal(run))
            return { ok: false, code: "terminal", run: view(run) };
          if (!owns(run, lease, now))
            return { ok: false, code: "lease-lost", run: view(run) };
          if (run.pendingAttempt !== null)
            return { ok: false, code: "busy", run: view(run) };
          if (run.attempts >= run.plan.maxSteps) {
            finish(run, "failed", "step-budget");
            await save(tx, run, now);
            return { ok: false, code: "terminal", run: view(run) };
          }
          run.attempts++;
          run.pendingAttempt = run.attempts;
          await save(tx, run, now);
          return { ok: true, attempt: run.attempts };
        },
      );
      if (!reservation.ok) return reservation;
      try {
        return await transact(binding, id, async (tx, run, now) => {
          if (terminal(run))
            return { ok: false, code: "terminal", run: view(run) };
          if (
            !owns(run, lease, now) ||
            run.pendingAttempt !== reservation.attempt
          )
            return { ok: false, code: "lease-lost", run: view(run) };
          if (tx.doc.revision !== run.projectRevision) {
            finish(run, "failed", "stale-project");
            await save(tx, run, now);
            return { ok: false, code: "terminal", run: view(run) };
          }
          const deadline = run.plan.deadlineAt,
            until = run.lease!.until;
          tx.beforeCommit(async () => {
            const now = await tx.now();
            if (now >= deadline || now >= until)
              throw Object.assign(
                new Error("Run effect was fenced before commit."),
                { code: "runtime-fenced" },
              );
          });
          const document = await createDocument(tx.doc.scenes),
            identity = run.owner ?? "local";
          const session = createToolSession({
            document,
            projectId: run.projectId,
            ownerId: identity,
            actorId: identity,
            agentId: run.id,
            ...run.plan.scope,
            limits: { maxCalls: 1, inputChars: 65536, outputChars: 16000 },
          });
          const request = run.plan.steps[run.cursor],
            envelopeId = `${run.id}:${run.cursor}`;
          const result = await session.execute(request, envelopeId);
          const checkedAt = await tx.now();
          await expire(tx, run, checkedAt);
          if (terminal(run))
            return { ok: false, code: "terminal", run: view(run) };
          if (!owns(run, lease, checkedAt))
            return { ok: false, code: "lease-lost", run: view(run) };
          if (result.ok && result.changed)
            run.projectRevision = await tx.saveScenes(
              document.snapshot().scenes,
              {
                actor: "agent",
                agentId: run.id,
                envelopeIds: [envelopeId],
                engineRevision: document.status().revision,
                historyLength: document.status().historyLength,
              },
            );
          const receipt: Receipt = {
            step: run.cursor,
            tool: request.tool,
            ok: result.ok,
            code: result.ok ? null : result.code,
            changed: result.ok && result.changed,
            projectRevision: run.projectRevision,
            engineRevision: document.status().revision,
            runRevision: run.revision + 1,
          };
          run.cursor++;
          run.pendingAttempt = null;
          if (!result.ok) run.failures++;
          if (run.failures >= run.plan.maxFailures)
            finish(run, "failed", "failure-budget");
          else if (run.cursor === run.plan.steps.length)
            finish(
              run,
              run.failures ? "failed" : "succeeded",
              run.failures ? "tool-refused" : null,
            );
          await tx.query(
            "INSERT INTO v2_agent_receipts (run_id,step,payload) VALUES (?,?,?)",
            [run.id, receipt.step, JSON.stringify(parseReceipt(receipt))],
          );
          await save(tx, run, checkedAt);
          return { ok: true as const, run: view(run), receipt, result };
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "runtime-fenced") throw error;
        return transact(binding, id, async (_tx, run) => ({
          ok: false as const,
          code: terminal(run) ? ("terminal" as const) : ("lease-lost" as const),
          run: view(run),
        }));
      }
    },
  });
}
