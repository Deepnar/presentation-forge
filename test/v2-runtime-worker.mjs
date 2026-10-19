import { projectStore } from "../src/projects/backend.js";
import { createRuntime } from "../packages/agent/runtime.ts";
let release;
process.on("message", async (message) => {
  if (message === "release") {
    release?.();
    return;
  }
  if (message === "go") return;
  const { action, binding, runId, lease, workerId, leaseMs, phase } = message;
  try {
    const store = await projectStore();
    let calls = 0;
    async function pause(point) {
      if (phase === point) {
        process.send({ phase: point });
        await new Promise((r) => (release = r));
      }
    }
    const backend = {
      withRuntimeTransaction: async (b, fn) => {
        calls++;
        const result = await store.withRuntimeTransaction(b, (tx) =>
          fn({
            ...tx,
            async saveScenes(...args) {
              const saved = await tx.saveScenes(...args);
              await pause("after-project");
              return saved;
            },
            async query(sql, params) {
              const rows = await tx.query(sql, params);
              if (sql.startsWith("INSERT INTO v2_agent_receipts"))
                await pause("after-receipt");
              return rows;
            },
          }),
        );
        if (action === "advance" && calls === 1) await pause("reserved");
        if (action === "advance" && calls === 2) await pause("committed");
        return result;
      },
    };
    const runtime = createRuntime(backend);
    const result =
      action === "claim"
        ? await runtime.claim(binding, runId, workerId, leaseMs)
        : action === "cancel"
          ? await runtime.cancel(binding, runId)
          : await runtime.advance(binding, runId, lease);
    process.send({ result });
    await store.closeProjectStore();
    process.disconnect();
  } catch (error) {
    process.send({
      error: { code: error.code ?? "unexpected", message: "worker failed" },
    });
    process.disconnect();
  }
});
process.send({ ready: true });
