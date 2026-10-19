import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { sleep, spec } from "./v2-runtime-fixture.js";
import { edit } from "./v2-tool-fixture.js";

function child(t, rig, input) {
  const process = fork(
    new URL("./v2-runtime-worker.mjs", import.meta.url),
    [],
    {
      env: { ...globalThis.process.env, ...rig.env },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let stderr = "";
  process.stderr.on("data", (d) => (stderr += d));
  process.stdout.resume();
  const queue = [],
    waiters = [];
  process.on("message", (m) => {
    const waiter = waiters.shift();
    if (waiter) waiter(m);
    else queue.push(m);
  });
  async function next() {
    if (queue.length) return queue.shift();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error(`worker message timeout ${stderr.slice(-1000)}`)),
        15000,
      );
      waiters.push((m) => {
        clearTimeout(timer);
        resolve(m);
      });
    });
  }
  t.after(async () => {
    if (process.exitCode === null && process.signalCode === null) {
      process.kill("SIGKILL");
      await once(process, "exit");
    }
  });
  return {
    process,
    next,
    async start() {
      assert.deepEqual(await next(), { ready: true });
      process.send({
        ...input,
        binding: rig.binding,
        runId: input.runId ?? rig.run.id,
      });
    },
    async kill() {
      const exit = once(process, "exit");
      process.kill("SIGKILL");
      await exit;
    },
  };
}
export function processContract(label, setup) {
  const check = (name, fn) =>
    test(`${label} process: ${name}`, { timeout: 20000 }, async (t) =>
      fn(t, await setup(t)),
    );
  check(
    "two processes race for one lease and only one can claim",
    async (t, rig) => {
      const a = child(t, rig, {
          action: "claim",
          workerId: "a",
          leaseMs: 5000,
        }),
        b = child(t, rig, { action: "claim", workerId: "b", leaseMs: 5000 });
      await Promise.all([a.start(), b.start()]);
      const results = await Promise.all([a.next(), b.next()]);
      assert.deepEqual(results.map((r) => r.result.ok).sort(), [false, true]);
      assert.equal(results.find((r) => !r.result.ok).result.code, "busy");
    },
  );
  for (const point of [
    "reserved",
    "after-project",
    "after-receipt",
    "committed",
  ])
    check(
      `kill ${point} then restart cannot lose or replay an edit`,
      async (t, rig) => {
        const { runtime, binding, run, store } = rig;
        const claimed = await runtime.claim(binding, run.id, "old", 1500);
        const worker = child(t, rig, {
          action: "advance",
          lease: claimed.lease,
          phase: point,
        });
        await worker.start();
        assert.deepEqual(await worker.next(), { phase: point });
        await worker.kill();
        const state = await runtime.inspect(binding, run.id);
        assert.equal(state.run.attempts, 1);
        const committed = point === "committed";
        assert.equal(state.receipts.length, committed ? 1 : 0);
        assert.equal(
          (await store.getProject(binding)).doc.revision,
          committed ? 1 : 0,
        );
        assert.equal(
          (await store.listRevisions(binding)).revisions.length,
          committed ? 2 : 1,
        );
        if (committed) {
          assert.equal(state.run.status, "succeeded");
          assert.equal(
            (await runtime.claim(binding, run.id, "next")).code,
            "terminal",
          );
        } else {
          await sleep(Math.max(0, claimed.lease.until - Date.now() + 30));
          const claim = await runtime.claim(binding, run.id, "next", 3000);
          assert.equal(claim.ok, true);
          assert.equal(
            (await runtime.advance(binding, run.id, claimed.lease)).code,
            "lease-lost",
          );
          const recovered = child(t, rig, {
            action: "advance",
            lease: claim.lease,
          });
          await recovered.start();
          const out = await recovered.next();
          assert.equal(out.result.run.status, "succeeded");
          assert.equal(out.result.run.attempts, 2);
          assert.equal(
            (await runtime.inspect(binding, run.id)).receipts.length,
            1,
          );
          assert.equal((await store.getProject(binding)).doc.revision, 1);
        }
      },
    );

  check(
    "restart resumes after a committed checkpoint without repeating it",
    async (t, rig) => {
      const { runtime, binding, store } = rig;
      const run = await runtime.start(
        binding,
        spec({ requestId: "checkpoint", steps: [edit(), edit()] }),
      );
      const claim = await runtime.claim(binding, run.id, "old", 1500);
      const worker = child(t, rig, {
        action: "advance",
        runId: run.id,
        lease: claim.lease,
        phase: "committed",
      });
      await worker.start();
      assert.equal((await worker.next()).phase, "committed");
      await worker.kill();
      assert.equal((await runtime.inspect(binding, run.id)).run.cursor, 1);
      await sleep(Math.max(0, claim.lease.until - Date.now() + 30));
      const start = performance.now(),
        next = await runtime.claim(binding, run.id, "new", 3000);
      const recovered = child(t, rig, {
        action: "advance",
        runId: run.id,
        lease: next.lease,
      });
      await recovered.start();
      const result = await recovered.next();
      assert.equal(result.result.run.status, "succeeded");
      assert.equal(result.result.run.attempts, 2);
      const status = await runtime.inspect(binding, run.id);
      assert.equal(status.receipts.length, 2);
      assert.equal(status.receipts[0].changed, true);
      assert.equal(status.receipts[1].changed, false);
      assert.equal((await store.getProject(binding)).doc.revision, 1);
      if (process.env.FORGE_RUNTIME_METRICS_PATH) {
        const { appendFile } = await import("node:fs/promises");
        await appendFile(
          process.env.FORGE_RUNTIME_METRICS_PATH,
          JSON.stringify({
            backend: label,
            source: process.env.FORGE_RUNTIME_SOURCE,
            case: "kill-after-commit-checkpoint",
            recoveryClaimThroughWorkerCommitMs: performance.now() - start,
            excludesLeaseWait: true,
          }) + "\n",
        );
      }
    },
  );
  check(
    "crashed reservations exhaust the persisted step budget",
    async (t, rig) => {
      const { runtime, binding, store } = rig,
        run = await runtime.start(
          binding,
          spec({ requestId: "budget", maxSteps: 1 }),
        );
      const claim = await runtime.claim(binding, run.id, "old", 1000),
        worker = child(t, rig, {
          action: "advance",
          runId: run.id,
          lease: claim.lease,
          phase: "reserved",
        });
      await worker.start();
      assert.equal((await worker.next()).phase, "reserved");
      await worker.kill();
      await sleep(Math.max(0, claim.lease.until - Date.now() + 30));
      const recovery = await runtime.claim(binding, run.id, "new");
      assert.equal(recovery.ok, false);
      assert.equal(recovery.run.code, "step-budget");
      assert.equal(recovery.run.attempts, 1);
      assert.equal((await store.getProject(binding)).doc.revision, 0);
    },
  );
  check(
    "cancellation racing an in-flight commit keeps that commit and prevents the next",
    async (t, rig) => {
      const { runtime, binding, store } = rig,
        run = await runtime.start(
          binding,
          spec({ requestId: "cancel-race", steps: [edit(), edit()] }),
        ),
        claim = await runtime.claim(binding, run.id, "worker", 10000);
      const worker = child(t, rig, {
        action: "advance",
        runId: run.id,
        lease: claim.lease,
        phase: "after-project",
      });
      await worker.start();
      assert.equal((await worker.next()).phase, "after-project");
      const canceller = child(t, rig, { action: "cancel", runId: run.id });
      await canceller.start();
      worker.process.send("release");
      const [applied, cancelled] = await Promise.all([
        worker.next(),
        canceller.next(),
      ]);
      assert.equal(applied.result.ok, true);
      assert.equal(cancelled.result.status, "cancelled");
      assert.equal(
        (await runtime.advance(binding, run.id, claim.lease)).code,
        "terminal",
      );
      assert.equal((await store.getProject(binding)).doc.revision, 1);
      assert.equal((await runtime.inspect(binding, run.id)).receipts.length, 1);
    },
  );
}
