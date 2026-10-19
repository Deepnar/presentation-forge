import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { agentRuntime } from "./index.js";
import { projectStore } from "../projects/backend.js";

// CLI identity is a trusted local operator input, like the project import CLI.
// Any future HTTP wrapper must derive it from authentication, never request JSON.
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: "string" },
      owner: { type: "string" },
      run: { type: "string" },
      plan: { type: "string" },
      worker: { type: "string" },
    },
  });
  const action = positionals[0];
  if (
    !["start", "status", "cancel", "work"].includes(action) ||
    !values.project
  )
    throw new Error("usage");
  const binding = { owner: values.owner ?? null, id: values.project },
    runtime = await agentRuntime();
  let output;
  if (action === "start") {
    if (!values.plan) throw new Error("usage");
    if ((await stat(values.plan)).size > 65536) throw new Error("input");
    const file = await readFile(values.plan);
    if (file.length > 65536) throw new Error("input");
    output = await runtime.start(binding, JSON.parse(file.toString("utf8")));
  } else {
    if (!values.run) throw new Error("usage");
    if (action === "status")
      output = await runtime.inspect(binding, values.run);
    if (action === "cancel") output = await runtime.cancel(binding, values.run);
    if (action === "work") {
      const claimed = await runtime.claim(
        binding,
        values.run,
        values.worker ?? crypto.randomUUID(),
      );
      output = claimed;
      if (claimed.ok) {
        let lease = claimed.lease;
        for (let i = 0; i < 64; i++) {
          const step = await runtime.advance(binding, values.run, lease);
          output = step.ok
            ? { ok: true, run: step.run, receipt: step.receipt }
            : step;
          if (!step.ok || step.run.status !== "running") break;
          const renewed = await runtime.renew(binding, values.run, lease);
          if (!renewed.ok) {
            output = renewed;
            break;
          }
          lease = renewed.lease;
        }
      }
    }
  }
  console.log(JSON.stringify(output));
} catch (error) {
  const code = [
    "not-found",
    "invalid-document",
    "invalid-id",
    "store-misconfigured",
    "storage-unavailable",
  ].includes(error?.code)
    ? error.code
    : "invalid-input";
  console.error(
    JSON.stringify({
      ok: false,
      code,
      message:
        "Run command could not complete. Use start --project ID --plan FILE, or status/cancel/work --project ID --run ID; --owner supplies the local operator identity.",
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await (await projectStore()).closeProjectStore();
  } catch {}
}
