// Internal composition seam: callers already hold the canonical project lock.
// Never expose these functions as browser/model approval capabilities.
import type { Binding, RuntimeTransaction, RunView } from './runtime.ts';
import { parsePlan, parseRun, parseReceipt, planDigest, terminal, invalidRun, type RunRecord, type RunPlan } from './run-state.ts';
export function view(run: RunRecord): RunView {
  const {
    id,
    projectId,
    projectRevision,
    status,
    code,
    revision,
    cursor,
    attempts,
    failures,
    createdAt,
    updatedAt,
  } = run;
  return {
    id,
    projectId,
    projectRevision,
    status,
    code,
    revision,
    cursor,
    attempts,
    failures,
    createdAt,
    updatedAt,
    deadlineAt: run.plan.deadlineAt,
    stepCount: run.plan.steps.length,
  };
}
export function checkBinding(binding: Binding) {
  if (
    !binding ||
    typeof binding.id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(binding.id) ||
    (binding.owner !== null &&
      (typeof binding.owner !== "string" ||
        !binding.owner.trim() ||
        binding.owner.length > 128))
  )
    invalidRun();
  return { id: binding.id, owner: binding.owner };
}
export const finish = (
  run: RunRecord,
  status: RunRecord["status"],
  code: RunRecord["code"],
) => {
  run.status = status;
  run.code = code;
  run.lease = null;
  run.pendingAttempt = null;
};
  export async function load(tx: RuntimeTransaction, binding: Binding, id: string) {
    const row = (
      await tx.query(
        "SELECT payload FROM v2_agent_runs WHERE id=? AND project_id=?",
        [id, binding.id],
      )
    )[0];
    if (!row)
      throw Object.assign(new Error("Run unavailable."), { code: "not-found" });
    let raw: unknown;
    try {
      raw = JSON.parse(String(row.payload));
    } catch {
      return invalidRun();
    }
    const run = parseRun(raw);
    if ((await planDigest(run.plan)) !== run.digest) invalidRun();
    if (
      run.owner !== binding.owner ||
      run.projectId !== binding.id ||
      run.id !== id
    )
      invalidRun();
    const receipts = (
      await tx.query(
        "SELECT payload FROM v2_agent_receipts WHERE run_id=? ORDER BY step",
        [id],
      )
    ).map((row) => parseReceipt(JSON.parse(String(row.payload))));
    if (receipts.length !== run.cursor) invalidRun();
    let projectRevision = run.plan.projectRevision,
      previousRunRevision = 0,
      failures = 0;
    for (const [i, receipt] of receipts.entries()) {
      projectRevision += Number(receipt.changed);
      if (
        receipt.step !== i ||
        receipt.tool !== run.plan.steps[i].tool ||
        receipt.projectRevision !== projectRevision ||
        receipt.engineRevision !== Number(receipt.changed) ||
        receipt.runRevision <= previousRunRevision ||
        receipt.runRevision > run.revision
      )
        invalidRun();
      previousRunRevision = receipt.runRevision;
      if (!receipt.ok) failures++;
    }
    if (projectRevision !== run.projectRevision || failures !== run.failures)
      invalidRun();
    return run;
  }
  export async function save(tx: RuntimeTransaction, run: RunRecord, now: number) {
    run.updatedAt = now;
    run.revision++;
    const clean = parseRun(run);
    await tx.query(
      "UPDATE v2_agent_runs SET payload=? WHERE id=? AND project_id=?",
      [JSON.stringify(clean), run.id, run.projectId],
    );
  }
  export async function expire(tx: RuntimeTransaction, run: RunRecord, now: number) {
    if (!terminal(run) && now >= run.plan.deadlineAt) {
      finish(run, "expired", "deadline");
      await save(tx, run, now);
    }
  }

export async function queueRun(tx: RuntimeTransaction, trusted: Binding, plan: RunPlan, digest: string): Promise<RunView> {
        const existing = (
          await tx.query(
            "SELECT id FROM v2_agent_runs WHERE project_id=? AND request_key=?",
            [trusted.id, plan.requestId],
          )
        )[0];
        if (existing) {
          const run = await load(tx, trusted, String(existing.id));
          if (run.digest !== digest) invalidRun();
          await expire(tx, run, await tx.now());
          return view(run);
        }
        const now = await tx.now();
        if (
          plan.projectRevision !== tx.doc.revision ||
          plan.deadlineAt <= now ||
          plan.deadlineAt > now + 86400000
        )
          invalidRun();
        // Validate grants without persisting a second document or accepting authority
        // fields in model arguments. The scope is immutable for this run identity.
        const slides = new Set(tx.doc.scenes.map((s) => s.id));
        if (
          plan.scope.readableSlides.some((s) => !slides.has(s)) ||
          [...plan.scope.editableTargets, ...plan.scope.selection].some(
            (t) => !plan.scope.readableSlides.includes(t.slideId),
          )
        )
          invalidRun();
        const run: RunRecord = {
          version: 1,
          id: crypto.randomUUID(),
          projectId: trusted.id,
          owner: trusted.owner,
          digest,
          plan,
          projectRevision: tx.doc.revision,
          cursor: 0,
          attempts: 0,
          failures: 0,
          pendingAttempt: null,
          status: "queued",
          code: null,
          fence: 0,
          lease: null,
          revision: 0,
          createdAt: now,
          updatedAt: now,
        };
        await tx.query(
          "INSERT INTO v2_agent_runs (id,project_id,request_key,payload) VALUES (?,?,?,?)",
          [
            run.id,
            run.projectId,
            plan.requestId,
            JSON.stringify(parseRun(run)),
          ],
        );
        return view(run);
}
export async function inspectRun(tx: RuntimeTransaction, binding: Binding, id: string): Promise<RunView> {
  const run = await load(tx, binding, id);
  await expire(tx, run, await tx.now());
  return view(run);
}
export async function cancelRun(tx: RuntimeTransaction, binding: Binding, id: string): Promise<RunView> {
  const run = await load(tx, binding, id), now = await tx.now();
  await expire(tx, run, now);
  if (!terminal(run)) { finish(run, 'cancelled', 'cancelled'); await save(tx, run, now); }
  return view(run);
}
