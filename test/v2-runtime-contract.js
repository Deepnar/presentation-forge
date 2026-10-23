import { test } from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../packages/agent/runtime.ts";
import { parsePlan, parseRun } from "../packages/agent/run-state.ts";
import { seed, target, edit, textEdit } from "./v2-tool-fixture.js";
import { spec, sleep } from "./v2-runtime-fixture.js";

async function controlledTime(store, binding) {
  const clock = { now: await store.withRuntimeTransaction(binding, tx => tx.now()) };
  const backend = {
    withRuntimeTransaction: (binding, job) => store.withRuntimeTransaction(binding,
      tx => job({ ...tx, now: async () => clock.now })),
  };
  return { clock, backend, runtime: createRuntime(backend) };
}

export function runtimeContract(label, setup) {
  const check = (name, fn) =>
    test(`${label}: ${name}`, async (t) => fn(t, await setup(t)));
  check(
    "project, history and receipt commit once with distinct revisions",
    async (t, { runtime, binding, run, store }) => {
      const claim = await runtime.claim(binding, run.id, "worker", 1000);
      assert.equal(claim.ok, true);
      const step = await runtime.advance(binding, run.id, claim.lease);
      assert.equal(step.ok, true);
      assert.equal(step.run.status, "succeeded");
      const { doc } = await store.getProject(binding);
      assert.equal(doc.revision, 1);
      assert.equal(
        doc.scenes[0].elements[0].paragraphs[0].runs[0].text,
        "Human-reviewed ",
      );
      assert.equal((await store.listRevisions(binding)).revisions.length, 2);
      const status = await runtime.inspect(binding, run.id);
      assert.equal(status.receipts.length, 1);
      assert.equal(status.receipts[0].projectRevision, 1);
      assert.equal(status.receipts[0].engineRevision, 1);
      assert.ok(status.receipts[0].runRevision > 1);
      assert.equal(
        (await runtime.advance(binding, run.id, claim.lease)).ok,
        false,
      );
      assert.equal((await store.getProject(binding)).doc.revision, 1);
    },
  );
  check(
    "request identity reopens exact state and refuses changed plans",
    async (t, { runtime, binding, run, plan }) => {
      const reordered = Object.fromEntries(Object.entries(plan).reverse());
      assert.equal((await runtime.start(binding, reordered)).id, run.id);
      await runtime.cancel(binding, run.id);
      assert.equal((await runtime.start(binding, plan)).status, "cancelled");
      await assert.rejects(
        runtime.start(binding, {
          ...plan,
          steps: [edit([textEdit("different")])],
        }),
        { code: "invalid-document" },
      );
    },
  );
  check(
    "input and output snapshots do not mutate durable authority",
    async (t, { runtime, binding, plan, run }) => {
      const next = structuredClone(plan);
      next.requestId = "snapshot";
      const start = runtime.start(binding, next);
      next.scope.readableSlides.length = 0;
      next.steps[0].args.edits[0].text = "raced";
      const saved = await start;
      saved.status = "succeeded";
      const state = await runtime.inspect(binding, saved.id);
      assert.equal(state.run.status, "queued");
      const c = await runtime.claim(binding, saved.id, "worker");
      const r = await runtime.advance(binding, saved.id, c.lease);
      assert.equal(r.ok, true);
      assert.equal(r.result.changed, true);
      const output = await runtime.inspect(binding, saved.id);
      output.receipts[0].changed = false;
      assert.equal(
        (await runtime.inspect(binding, saved.id)).receipts[0].changed,
        true,
      );
    },
  );
  check(
    "foreign owner, foreign project and deleted project cannot inspect or act",
    async (t, { runtime, binding, run, store }) => {
      for (const action of [
        () => runtime.inspect({ ...binding, owner: "other" }, run.id),
        () => runtime.claim({ ...binding, owner: "other" }, run.id, "worker"),
        () => runtime.cancel({ ...binding, owner: null }, run.id),
      ])
        await assert.rejects(action, { code: "not-found" });
      const other = await store.createProject({
        owner: "owner",
        title: "Other",
        scenes: seed(),
      });
      await assert.rejects(
        runtime.inspect({ ...binding, id: other.doc.id }, run.id),
        { code: "not-found" },
      );
      await store.deleteProject(binding);
      await assert.rejects(runtime.inspect(binding, run.id), {
        code: "not-found",
      });
    },
  );
  check(
    "local ownerless projects retain local authority without widening scope",
    async (t, { runtime, store }) => {
      const { doc } = await store.createProject({
        title: "Local",
        scenes: seed(),
      });
      const b = { owner: null, id: doc.id };
      const run = await runtime.start(b, spec());
      await assert.rejects(runtime.inspect({ ...b, owner: "owner" }, run.id), {
        code: "not-found",
      });
      const c = await runtime.claim(b, run.id, "local");
      assert.equal(
        (await runtime.advance(b, run.id, c.lease)).run.status,
        "succeeded",
      );
    },
  );
  check(
    "read and noop receipts never invent durable project history",
    async (t, { runtime, binding, store }) => {
      const plan = spec({
        requestId: "noops",
        steps: [
          { tool: "get_slide", args: { slideId: "s1" } },
          edit([textEdit("Measured ")]),
        ],
      });
      const run = await runtime.start(binding, plan);
      const c = await runtime.claim(binding, run.id, "worker");
      const read = await runtime.advance(binding, run.id, c.lease);
      assert.equal(read.result.ok, true);
      assert.equal(read.receipt.engineRevision, 0);
      const noop = await runtime.advance(binding, run.id, c.lease);
      assert.equal(noop.receipt.changed, false);
      assert.equal(noop.run.status, "succeeded");
      assert.equal(noop.run.projectRevision, 0);
      assert.equal((await store.listRevisions(binding)).revisions.length, 1);
    },
  );
  check(
    "multi-step text/chart/table preserve geometry, human content, styles and tombstones",
    async (t, { runtime, binding, store }) => {
      const scenes = seed();
      scenes[0].layoutState = "detached";
      scenes[0].suppressed = [
        { id: "removed-semantic", semanticRef: "removed-block" },
      ];
      const saved = await store.saveProject({
        ...binding,
        baseRevision: 0,
        scenes,
      });
      assert.equal(saved.status, "saved");
      const before = saved.doc;
      const steps = [
        edit(),
        edit([
          {
            kind: "chart",
            ...target("chart"),
            categories: ["A", "B"],
            series: [{ name: "Score", values: [3, 4] }],
          },
        ]),
        edit([
          {
            kind: "table",
            ...target("table"),
            rows: [
              ["Cell", "Score"],
              ["A", "3"],
              ["B", "4"],
            ],
          },
        ]),
      ];
      const run = await runtime.start(
        binding,
        spec({ requestId: "all-kinds", projectRevision: 1, steps }),
      );
      const c = await runtime.claim(binding, run.id, "worker");
      for (let i = 0; i < 3; i++)
        assert.equal(
          (await runtime.advance(binding, run.id, c.lease)).ok,
          true,
        );
      const { doc } = await store.getProject(binding);
      assert.equal(doc.revision, 4);
      assert.deepEqual(doc.scenes[1], before.scenes[1]);
      assert.deepEqual(doc.scenes[0].suppressed, before.scenes[0].suppressed);
      assert.equal(doc.scenes[0].layoutState, "detached");
      for (let i = 0; i < 3; i++)
        for (const key of ["x", "y", "w", "h", "z", "semanticRef"])
          assert.deepEqual(
            doc.scenes[0].elements[i][key],
            before.scenes[0].elements[i][key],
          );
      const text = doc.scenes[0].elements[0];
      assert.deepEqual(
        { ...text.paragraphs[0].runs[0], text: "Measured " },
        before.scenes[0].elements[0].paragraphs[0].runs[0],
      );
      assert.deepEqual(
        text.paragraphs[0].runs[1],
        before.scenes[0].elements[0].paragraphs[0].runs[1],
      );
      assert.deepEqual(
        doc.scenes[0].elements[2].table.layout,
        before.scenes[0].elements[2].table.layout,
      );
      assert.deepEqual(
        (await runtime.inspect(binding, run.id)).receipts.map((r) => [
          r.projectRevision,
          r.engineRevision,
        ]),
        [
          [2, 1],
          [3, 1],
          [4, 1],
        ],
      );
    },
  );
  check(
    "human changes after start cause stale refusal without rebasing",
    async (t, { runtime, binding, store, run }) => {
      await store.renameProject({
        ...binding,
        baseRevision: 0,
        title: "Human title",
      });
      const c = await runtime.claim(binding, run.id, "worker");
      const r = await runtime.advance(binding, run.id, c.lease);
      assert.equal(r.ok, false);
      assert.equal(r.run.code, "stale-project");
      assert.equal((await runtime.inspect(binding, run.id)).receipts.length, 0);
      assert.equal((await store.getProject(binding)).doc.title, "Human title");
    },
  );
  check(
    "inspect-only and locked/hidden targets fail through canonical tools",
    async (t, { runtime, binding, store }) => {
      for (const flag of ["locked", "hidden"]) {
        const scenes = seed();
        scenes[0].elements[0][flag] = true;
        const current = (await store.getProject(binding)).doc;
        await store.saveProject({
          ...binding,
          baseRevision: current.revision,
          scenes,
        });
        const base = (await store.getProject(binding)).doc.revision;
        const run = await runtime.start(
          binding,
          spec({ requestId: flag, projectRevision: base, maxFailures: 1 }),
        );
        const c = await runtime.claim(binding, run.id, "worker");
        const r = await runtime.advance(binding, run.id, c.lease);
        assert.equal(r.receipt.code, "locked");
        assert.equal(r.run.code, "failure-budget");
        assert.equal((await store.getProject(binding)).doc.revision, base);
      }
      const base = (await store.getProject(binding)).doc.revision,
        plan = spec({ requestId: "inspect", projectRevision: base });
      plan.scope.mode = "inspect";
      const run = await runtime.start(binding, plan),
        c = await runtime.claim(binding, run.id, "worker");
      assert.equal(
        (await runtime.advance(binding, run.id, c.lease)).receipt.code,
        "not-editable",
      );
    },
  );
  check(
    "failure budgets and concise traces survive a new runtime instance",
    async (t, { runtime, binding, store }) => {
      const bad = edit([textEdit()]);
      bad.args.edits[0].elementId = "outside";
      const run = await runtime.start(
        binding,
        spec({
          requestId: "failures",
          steps: [bad, bad, edit()],
          maxFailures: 2,
        }),
      );
      const c = await runtime.claim(binding, run.id, "worker");
      assert.equal(
        (await runtime.advance(binding, run.id, c.lease)).run.failures,
        1,
      );
      const reopened = createRuntime(store);
      const r = await reopened.advance(binding, run.id, c.lease);
      assert.equal(r.run.failures, 2);
      assert.equal(r.run.code, "failure-budget");
      assert.equal(r.run.attempts, 2);
      const status = await runtime.inspect(binding, run.id);
      assert.equal(status.receipts.length, 2);
      assert.equal(status.receipts[0].code, "not-editable");
      assert.equal((await store.getProject(binding)).doc.revision, 0);
    },
  );
  check(
    "cancellation before work and after commit preserves transaction order",
    async (t, { runtime, binding, run, plan, store }) => {
      const c = await runtime.claim(binding, run.id, "worker");
      assert.equal((await runtime.cancel(binding, run.id)).status, "cancelled");
      assert.equal(
        (await runtime.advance(binding, run.id, c.lease)).code,
        "terminal",
      );
      assert.equal((await store.getProject(binding)).doc.revision, 0);
      const next = await runtime.start(binding, {
        ...plan,
        requestId: "after",
        steps: [edit(), edit()],
      });
      const claim = await runtime.claim(binding, next.id, "worker");
      assert.equal(
        (await runtime.advance(binding, next.id, claim.lease)).ok,
        true,
      );
      assert.equal(
        (await runtime.cancel(binding, next.id)).status,
        "cancelled",
      );
      assert.equal(
        (await runtime.advance(binding, next.id, claim.lease)).code,
        "terminal",
      );
      assert.equal((await store.getProject(binding)).doc.revision, 1);
      assert.equal(
        (await runtime.inspect(binding, next.id)).receipts.length,
        1,
      );
    },
  );
  check(
    "lease takeover fences the previous worker even with reused worker name",
    async (t, { runtime, binding, run }) => {
      const old = await runtime.claim(binding, run.id, "worker", 100);
      assert.equal(
        (await runtime.claim(binding, run.id, "other")).code,
        "busy",
      );
      await sleep(125);
      const next = await runtime.claim(binding, run.id, "worker", 1000);
      assert.ok(next.lease.fence > old.lease.fence);
      assert.equal(
        (await runtime.advance(binding, run.id, old.lease)).code,
        "lease-lost",
      );
      assert.equal(
        (await runtime.renew(binding, run.id, old.lease)).code,
        "lease-lost",
      );
      assert.equal(
        (await runtime.advance(binding, run.id, next.lease)).run.status,
        "succeeded",
      );
    },
  );
  check(
    "deadlines persist across restart and expire before effects",
    async (t, { binding, store }) => {
      const { clock, backend, runtime } = await controlledTime(store, binding);
      const run = await runtime.start(
        binding,
        spec({ requestId: "deadline", deadlineAt: clock.now + 150 }),
      );
      const c = await runtime.claim(binding, run.id, "worker", 1000);
      assert.equal(c.ok, true);
      clock.now += 149;
      const reopened = createRuntime(backend);
      assert.equal((await reopened.inspect(binding, run.id)).run.status, "running");
      clock.now++;
      assert.equal(
        (await reopened.inspect(binding, run.id)).run.status,
        "expired",
      );
      assert.equal(
        (await reopened.advance(binding, run.id, c.lease)).code,
        "terminal",
      );
      assert.equal((await store.getProject(binding)).doc.revision, 0);
    },
  );
  for (const point of [
    "after-project",
    "after-receipt",
    "final-fence",
    "deadline-fence",
  ])
    check(
      `${point} failure rolls project/history/receipt back together`,
      async (t, { binding, run, store }) => {
        const { clock, backend: timedStore, runtime } = await controlledTime(store, binding);
        if (point === "deadline-fence")
          run = await runtime.start(
            binding,
            spec({ requestId: "deadline-fence", deadlineAt: clock.now + 100 }),
          );
        let injected = false;
        const backend = {
          withRuntimeTransaction: (b, fn) =>
            timedStore.withRuntimeTransaction(b, (tx) =>
              fn({
                ...tx,
                async saveScenes(...args) {
                  const r = await tx.saveScenes(...args);
                  if (point === "after-project" && !injected) {
                    injected = true;
                    throw new Error("injected storage fault");
                  }
                  return r;
                },
                async query(sql, params) {
                  const r = await tx.query(sql, params);
                  if (
                    point === "after-receipt" &&
                    sql.startsWith("INSERT INTO v2_agent_receipts") &&
                    !injected
                  ) {
                    injected = true;
                    throw new Error("injected receipt fault");
                  }
                  return r;
                },
                beforeCommit(check) {
                  tx.beforeCommit(async () => {
                    if (
                      ["final-fence", "deadline-fence"].includes(point) &&
                      !injected
                    ) {
                      injected = true;
                      clock.now += 140;
                    }
                    return check();
                  });
                },
              }),
            ),
        };
        const c = await runtime.claim(
            binding,
            run.id,
            "worker",
            point === "final-fence" ? 100 : 1000,
          ),
          faulty = createRuntime(backend);
        if (point === "deadline-fence")
          assert.equal(
            (await faulty.advance(binding, run.id, c.lease)).run.status,
            "expired",
          );
        else if (point === "final-fence")
          assert.equal(
            (await faulty.advance(binding, run.id, c.lease)).code,
            "lease-lost",
          );
        else await assert.rejects(faulty.advance(binding, run.id, c.lease));
        assert.equal((await store.getProject(binding)).doc.revision, 0);
        assert.equal((await store.listRevisions(binding)).revisions.length, 1);
        const state = await runtime.inspect(binding, run.id);
        assert.equal(state.receipts.length, 0);
        assert.equal(state.run.attempts, 1);
        if (point === "deadline-fence") return;
        if (point !== "final-fence") clock.now += 1010;
        const claim = await runtime.claim(binding, run.id, "recovered", 2000);
        assert.equal(
          (await runtime.advance(binding, run.id, claim.lease)).run.status,
          "succeeded",
        );
        assert.equal((await store.getProject(binding)).doc.revision, 1);
      },
    );
  check(
    "records and traces are bounded and omit raw document/read contents",
    async (t, { runtime, binding, store }) => {
      const run = await runtime.start(
          binding,
          spec({
            requestId: "read-trace",
            steps: [{ tool: "get_slide", args: { slideId: "s1" } }],
          }),
        ),
        c = await runtime.claim(binding, run.id, "worker");
      const r = await runtime.advance(binding, run.id, c.lease);
      assert.ok(JSON.stringify(r.result).includes("Measured"));
      await store.withRuntimeTransaction(binding, async (tx) => {
        const rows = await tx.query(
          "SELECT payload FROM v2_agent_runs WHERE id=?",
          [run.id],
        );
        const receipts = await tx.query(
          "SELECT payload FROM v2_agent_receipts WHERE run_id=?",
          [run.id],
        );
        const json = JSON.stringify({ rows, receipts });
        assert.ok(json.length < 10000);
        for (const key of [
          "Measured",
          "Unrelated private slide",
          "112233",
          "Inter",
          "paragraphs",
          "geometry",
          "credentials",
        ])
          assert.equal(json.includes(key), false, key);
      });
    },
  );
  check(
    "malformed/oversized/authority/layout data and duplicate grants are refused",
    async (t, { runtime, binding, plan }) => {
      for (const mutation of [
        (p) => (p.secret = "private"),
        (p) => (p.steps[0].args.edits[0].x = 1),
        (p) => (p.scope.owner = "other"),
        (p) => (p.steps[0].args.edits[0].text = "x".repeat(70000)),
        (p) => p.scope.editableTargets.push(p.scope.editableTargets[0]),
        (p) => (p.maxSteps = 0),
        (p) => (p.maxSteps = 65),
        (p) => (p.deadlineAt = Date.now() + 90000000),
        (p) => (p.scope.readableSlides = ["missing"]),
      ]) {
        const input = structuredClone(plan);
        input.requestId = crypto.randomUUID();
        mutation(input);
        await assert.rejects(runtime.start(binding, input), {
          code: "invalid-document",
        });
      }
      const accessor = {};
      Object.defineProperty(accessor, "requestId", {
        enumerable: true,
        get() {
          throw new Error("must not execute");
        },
      });
      assert.throws(() => parsePlan(accessor), { code: "invalid-document" });
    },
  );
  check(
    "concurrent advances sharing one lease reserve only one attempt",
    async (t, { runtime, binding, run }) => {
      const c = await runtime.claim(binding, run.id, "worker");
      const results = await Promise.all([
        runtime.advance(binding, run.id, c.lease),
        runtime.advance(binding, run.id, c.lease),
      ]);
      assert.equal(results.filter((r) => r.ok).length, 1);
      assert.equal((await runtime.inspect(binding, run.id)).run.attempts, 1);
      assert.equal((await runtime.inspect(binding, run.id)).receipts.length, 1);
    },
  );
  check(
    "unsupported or corrupt durable records fail closed",
    async (t, { runtime, binding, run, store }) => {
      await store.withRuntimeTransaction(binding, async (tx) => {
        const raw = JSON.parse(
          (
            await tx.query("SELECT payload FROM v2_agent_runs WHERE id=?", [
              run.id,
            ])
          )[0].payload,
        );
        raw.version = 2;
        await tx.query("UPDATE v2_agent_runs SET payload=? WHERE id=?", [
          JSON.stringify(raw),
          run.id,
        ]);
      });
      await assert.rejects(runtime.inspect(binding, run.id), {
        code: "invalid-document",
      });
      assert.throws(() => parseRun({ version: 1 }), {
        code: "invalid-document",
      });
    },
  );
  check(
    "renewal extends the current lease without changing its fence",
    async (t, { runtime, binding, run }) => {
      const c = await runtime.claim(binding, run.id, "worker", 150);
      await sleep(30);
      const r = await runtime.renew(binding, run.id, c.lease, 1000);
      assert.equal(r.ok, true);
      assert.equal(r.lease.fence, c.lease.fence);
      assert.ok(r.lease.until > c.lease.until);
      await sleep(150);
      assert.equal(
        (await runtime.advance(binding, run.id, r.lease)).run.status,
        "succeeded",
      );
    },
  );
  check(
    "project deletion cascades runs and all step receipts",
    async (t, { runtime, binding, run, store }) => {
      const c = await runtime.claim(binding, run.id, "worker");
      await runtime.advance(binding, run.id, c.lease);
      await store.deleteProject(binding);
      const other = await store.createProject({
        owner: "owner",
        title: "Probe",
        scenes: seed(),
      });
      await store.withRuntimeTransaction(
        { ...binding, id: other.doc.id },
        async (tx) => {
          assert.equal(
            (
              await tx.query("SELECT id FROM v2_agent_runs WHERE id=?", [
                run.id,
              ])
            ).length,
            0,
          );
          assert.equal(
            (
              await tx.query(
                "SELECT step FROM v2_agent_receipts WHERE run_id=?",
                [run.id],
              )
            ).length,
            0,
          );
        },
      );
    },
  );
  check(
    "corrupt receipt checkpoints refuse resume instead of skipping work",
    async (t, { runtime, binding, run, store }) => {
      const c = await runtime.claim(binding, run.id, "worker");
      await runtime.advance(binding, run.id, c.lease);
      await store.withRuntimeTransaction(binding, (tx) =>
        tx.query("DELETE FROM v2_agent_receipts WHERE run_id=?", [run.id]),
      );
      await assert.rejects(runtime.inspect(binding, run.id), {
        code: "invalid-document",
      });
    },
  );
  check(
    "CLI start exits and a separate worker completes the saved project",
    async (t, { runtime, binding, store, env }) => {
      const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const dir = await mkdtemp(path.join(tmpdir(), "forge-cli-"));
      t.after(() => rm(dir, { recursive: true, force: true }));
      const file = path.join(dir, "plan.json");
      await writeFile(file, JSON.stringify(spec({ requestId: "cli" })));
      const call = async (args) =>
        JSON.parse(
          (
            await promisify(execFile)(
              process.execPath,
              [
                "src/agent/cli.js",
                ...args,
                "--project",
                binding.id,
                "--owner",
                "owner",
              ],
              { env: { ...process.env, ...env }, timeout: 15000 },
            )
          ).stdout,
        );
      const run = await call(["start", "--plan", file]);
      assert.equal(run.status, "queued");
      const result = await call([
        "work",
        "--run",
        run.id,
        "--worker",
        "cli-worker",
      ]);
      assert.equal(result.ok, true);
      assert.equal(result.run.status, "succeeded");
      const status = await call(["status", "--run", run.id]);
      assert.equal(status.receipts.length, 1);
      assert.equal((await store.getProject(binding)).doc.revision, 1);
    },
  );
  check(
    "schema-valid contradictory receipts and counters fail closed",
    async (t, { runtime, binding, store }) => {
      const run = await runtime.start(
        binding,
        spec({
          requestId: "inconsistent",
          steps: [edit([textEdit("first")]), edit([textEdit("second")])],
        }),
      );
      const claim = await runtime.claim(binding, run.id, "worker");
      await runtime.advance(binding, run.id, claim.lease);
      await runtime.advance(binding, run.id, claim.lease);
      let original, receipts;
      await store.withRuntimeTransaction(binding, async (tx) => {
        original = (
          await tx.query("SELECT payload FROM v2_agent_runs WHERE id=?", [
            run.id,
          ])
        )[0].payload;
        receipts = (
          await tx.query(
            "SELECT payload FROM v2_agent_receipts WHERE run_id=? ORDER BY step",
            [run.id],
          )
        ).map((r) => r.payload);
      });
      for (const mutate of [
        (record, rs) => (rs[0].projectRevision = 100),
        (record, rs) => (rs[0].tool = "get_project"),
        (record, rs) => (rs[0].engineRevision = 0),
        (record, rs) => (record.failures = 1),
        (record, rs) => (rs[0].runRevision = rs[1].runRevision),
        (record, rs) => {
          record.status = "running";
          record.lease = {
            workerId: "worker",
            fence: record.fence,
            until: Date.now() + 10000,
          };
        },
      ]) {
        const record = JSON.parse(original),
          rs = receipts.map((r) => JSON.parse(r));
        mutate(record, rs);
        await store.withRuntimeTransaction(binding, async (tx) => {
          await tx.query("UPDATE v2_agent_runs SET payload=? WHERE id=?", [
            JSON.stringify(record),
            run.id,
          ]);
          for (let i = 0; i < rs.length; i++)
            await tx.query(
              "UPDATE v2_agent_receipts SET payload=? WHERE run_id=? AND step=?",
              [JSON.stringify(rs[i]), run.id, i],
            );
        });
        await assert.rejects(runtime.inspect(binding, run.id), {
          code: "invalid-document",
        });
        await store.withRuntimeTransaction(binding, async (tx) => {
          await tx.query("UPDATE v2_agent_runs SET payload=? WHERE id=?", [
            original,
            run.id,
          ]);
          for (let i = 0; i < receipts.length; i++)
            await tx.query(
              "UPDATE v2_agent_receipts SET payload=? WHERE run_id=? AND step=?",
              [receipts[i], run.id, i],
            );
        });
      }
    },
  );
}
