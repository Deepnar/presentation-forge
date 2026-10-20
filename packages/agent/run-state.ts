import { readFile } from "node:fs/promises";
import { Ajv } from "ajv";
import { cloneJson } from "../tools/json.ts";
import type { RunPlan } from "./run-plan.generated.ts";
import type { RunRecord } from "./run.generated.ts";
import type { RunReceipt } from "./receipt.generated.ts";
import type { ProviderRunRequest } from "./provider-run-request.generated.ts";
import type { ConversationRequest } from "./conversation-request.generated.ts";
export type { RunPlan, RunRecord };
const receiptValidator = new Ajv({ strict: false }).compile<RunReceipt>(
  JSON.parse(
    await readFile(new URL("./receipt.schema.json", import.meta.url), "utf8"),
  ),
);
export function parseReceipt(input: unknown): RunReceipt {
  const receipt = JSON.parse(JSON.stringify(cloneJson(input, 2048)));
  if (
    !receiptValidator(receipt) ||
    (receipt.ok && receipt.code !== null) ||
    (!receipt.ok && (receipt.changed || receipt.code === null)) ||
    (receipt.changed &&
      (receipt.tool !== "edit_content" || receipt.engineRevision !== 1))
  )
    invalidRun();
  return receipt;
}
export const MAX_PLAN_CHARS = 65536;
export const MAX_RECORD_CHARS = 131072;
const ajv = new Ajv({ strict: false });
const providerRunValidator = ajv.compile<ProviderRunRequest>(JSON.parse(
  await readFile(new URL('./provider-run-request.schema.json', import.meta.url), 'utf8'),
));
export function parseProviderRunRequest(input: unknown): ProviderRunRequest | null {
  try {
    // AJV's object uniqueItems comparison requires ordinary JSON prototypes.
    const copy: unknown = JSON.parse(JSON.stringify(cloneJson(input, MAX_PLAN_CHARS)));
    return providerRunValidator(copy) && copy.request.trim() ? copy : null;
  } catch { return null; }
}
const conversationValidator = ajv.compile<ConversationRequest>(JSON.parse(
  await readFile(new URL('./conversation-request.schema.json', import.meta.url), 'utf8'),
));
export function parseConversationRequest(input: unknown): ConversationRequest | null {
  try {
    const copy: unknown = JSON.parse(JSON.stringify(cloneJson(input, MAX_PLAN_CHARS)));
    return conversationValidator(copy) && copy.request.trim() ? copy : null;
  } catch { return null; }
}
const planValidator = ajv.compile<RunPlan>(
  JSON.parse(
    await readFile(new URL("./run-plan.schema.json", import.meta.url), "utf8"),
  ),
);
const stateValidator = ajv.compile<RunRecord>(
  JSON.parse(
    await readFile(new URL("./run.schema.json", import.meta.url), "utf8"),
  ),
);
export function invalidRun(): never {
  throw Object.assign(new Error("Invalid durable run data."), {
    code: "invalid-document",
  });
}
export function parsePlan(input: unknown): RunPlan {
  let plan: unknown;
  try {
    plan = JSON.parse(JSON.stringify(cloneJson(input, MAX_PLAN_CHARS)));
  } catch {
    return invalidRun();
  }
  if (!planValidator(plan)) return invalidRun();
  if (plan.steps.length > plan.maxSteps) return invalidRun();
  return plan;
}
export const terminal = (run: RunRecord) =>
  !["queued", "running"].includes(run.status);
export function parseRun(input: unknown): RunRecord {
  let run: unknown;
  try {
    run = JSON.parse(JSON.stringify(cloneJson(input, MAX_RECORD_CHARS)));
  } catch {
    return invalidRun();
  }
  if (!stateValidator(run)) return invalidRun();
  if (
    (run.status === "cancelled" && run.code !== "cancelled") ||
    (run.status === "expired" && run.code !== "deadline") ||
    (["queued", "running"].includes(run.status) && run.code !== null) ||
    (run.status === "failed" &&
      ![
        "step-budget",
        "failure-budget",
        "tool-refused",
        "stale-project",
      ].includes(run.code ?? ""))
  )
    invalidRun();
  if (
    run.status === "succeeded" &&
    (run.cursor !== run.plan.steps.length ||
      run.failures !== 0 ||
      run.code !== null)
  )
    invalidRun();
  parsePlan(run.plan);
  if (
    run.cursor > run.plan.steps.length ||
    run.attempts < run.cursor + Number(run.pendingAttempt !== null) ||
    (!terminal(run) && run.cursor >= run.plan.steps.length) ||
    (!terminal(run) && run.failures >= run.plan.maxFailures) ||
    run.attempts > run.plan.maxSteps ||
    run.failures > run.cursor ||
    (run.pendingAttempt !== null && run.pendingAttempt !== run.attempts) ||
    run.projectRevision < run.plan.projectRevision ||
    (run.lease &&
      (run.lease.fence !== run.fence || run.status !== "running")) ||
    (terminal(run) && (run.lease !== null || run.pendingAttempt !== null)) ||
    (run.status === "running" && !run.lease) ||
    (run.status === "queued" && (run.lease || run.cursor || run.attempts))
  )
    return invalidRun();
  return run;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function planDigest(plan: RunPlan): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(plan)),
  );
  return [...new Uint8Array(bytes)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
