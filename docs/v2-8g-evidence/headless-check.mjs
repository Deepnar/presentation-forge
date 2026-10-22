import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import sharp from "sharp";
import JSZip from "jszip";
import * as sqlite from "../../src/projects/store.js";
import * as postgres from "../../src/projects/store-postgres.js";
import { scenario, spec } from "../../test/v2-runtime-fixture.js";
import { sceneToSvg } from "../../packages/editor/scene-svg.js";
import { renderPptx } from "../../packages/renderer-pptx/render.ts";
import { preview } from "../../src/preview.js";
import { reviewedEdit } from "../../test/v2-provider-contract.js";
import { conversationInput, calls, respond } from "../../test/v2-conversation-contract.js";
import { endpoint, wire } from "../../test/v2-provider-fixture.js";
import { createProviderRunner } from "../../packages/agent/provider-run.ts";
const root = "docs/v2-8g-evidence",
  output = process.env.FORGE_VALIDATION_OUT ?? "out/v2-8g-validation";
const sha = JSON.parse(
  await readFile(`${root}/validation-plan.json`, "utf8"),
).implementationSha;
const images = [],
  records = [];
for (const family of ["openai-compatible", "anthropic"])
for (const [backend, store] of [
  ["sqlite", sqlite],
  ["postgres", postgres],
])
  test(`${backend}/${family}: persisted provider semantic edits survive reopen, history restore and native export`, async (t) => {
    if (backend === "postgres") {
      const pool = new Pool({
        connectionString:
          process.env.TEST_PG_URL ??
          "postgres://postgres:probe@127.0.0.1:5544/postgres",
      });
      const name = `forge_8g_native_${crypto.randomUUID().replaceAll("-", "")}`;
      await pool.query(`CREATE DATABASE "${name}"`);
      const previous = process.env.FORGE_PROJECTS_DATABASE_URL;
      process.env.FORGE_PROJECTS_DATABASE_URL = (
        process.env.TEST_PG_URL ??
        "postgres://postgres:probe@127.0.0.1:5544/postgres"
      ).replace(/\/[^/]*$/, `/${name}`);
      t.after(async () => {
        await store.closeProjectStore();
        await pool.query(`DROP DATABASE "${name}"`);
        await pool.end();
        if (previous === undefined)
          delete process.env.FORGE_PROJECTS_DATABASE_URL;
        else process.env.FORGE_PROJECTS_DATABASE_URL = previous;
      });
    }
    const env = await scenario(t, store);
    const { runtime, binding, doc: before } = env;
    let rounds = 0;
    const { provider } = await endpoint(t, family, (_req,res) => {
      const round = ++rounds;
      respond(res, calls(family, round, round < 3 ? [{ tool: 'get_selected_elements', args: {} }] : [reviewedEdit()]));
    });
    const exchangesMs = [];
    const observed = { profile: provider.profile, exchange: async (...args) => {
      const started = performance.now(); const result = await provider.exchange(...args);
      exchangesMs.push(performance.now() - started); return result;
    } };
    const runner = createProviderRunner(store, observed);
    const timings = {};
    async function timed(name, fn) {
      const start = performance.now();
      const r = await fn();
      timings[name] = performance.now() - start;
      return r;
    }
    const proposal = await timed("prepareMs", () => runner.converse(binding, conversationInput(env)));
    assert.equal(proposal.outcome, 'edit-proposal');
    assert.equal(proposal.conversation.exchanges, 3); assert.equal(rounds, 3);
    assert.deepEqual((await store.getProject(binding)).doc, before);
    const queued = await timed('queueMs', () => runner.enqueue(proposal));
    assert.equal(queued.outcome, 'queued');
    const run = queued.run;
    const claim = await timed("claimMs", () =>
      runtime.claim(binding, run.id, "evidence", 10000),
    );
    assert.equal(claim.ok, true);
    const applied = await timed("commitMs", () =>
      runtime.advance(binding, run.id, claim.lease),
    );
    assert.equal(applied.run.status, "succeeded");
    await store.closeProjectStore();
    const { doc: after } = await timed("reopenMs", () =>
      store.getProject(binding),
    );
    assert.equal(after.revision, 1);
    const expected = structuredClone(before.scenes);
    expected[0].elements[0].paragraphs[0].runs[0].text = "Reviewed ";
    expected[0].elements[1].chart.categories = ["First", "Second"];
    expected[0].elements[1].chart.series = [
      { name: "Reviewed score", values: [2.5, 15.75] },
    ];
    expected[0].elements[2].table.rows = [
      ["Cell", "Score"],
      ["First", "2.5"],
      ["Second", "15.75"],
    ];
    for (const e of expected[0].elements) {
      e.provenance = "human";
      if (e.kind === "text") e.contentCustomized = true;
      else if (e.kind === "chart") e.dataCustomized = true;
      else e.tableCustomized = true;
    }
    assert.deepEqual(after.scenes, expected);
    const restored = await store.restoreRevision({
      ...binding,
      baseRevision: 1,
      targetRevision: 0,
    });
    assert.deepEqual(restored.doc.scenes, before.scenes);
    const reapplied = await store.restoreRevision({
      ...binding,
      baseRevision: 2,
      targetRevision: 1,
    });
    assert.deepEqual(reapplied.doc.scenes, after.scenes);
    const trace = await runtime.inspect(binding, run.id);
    assert.equal(trace.receipts.length, 1);
    let traceBytes;
    await store.withRuntimeTransaction(binding, async (tx) => {
      traceBytes =
        String(
          (
            await tx.query("SELECT payload FROM v2_agent_runs WHERE id=?", [
              run.id,
            ])
          )[0].payload,
        ).length + JSON.stringify(trace.receipts).length;
    });
    const dir = `${root}/native/${backend}-${family}`;
    await mkdir(dir, { recursive: true });
    for (const [label, doc] of [
      ["before", before],
      ["after", after],
    ]) {
      const bytes = await renderPptx(doc.scenes),
        file = `${dir}/${label}.pptx`,
        zip = await JSZip.loadAsync(bytes);
      await writeFile(file, bytes);
      await writeFile(
        `${dir}/${label}-scenes.json`,
        JSON.stringify(doc.scenes, null, 2) + "\n",
      );
      const slide = await zip.file("ppt/slides/slide1.xml").async("string");
      assert.ok(slide.includes("<a:tbl>"));
      assert.ok(slide.includes(label === "after" ? "Reviewed " : "Measured "));
      assert.ok(slide.includes("results"));
      assert.ok(slide.includes("112233"));
      assert.ok(slide.includes("445566"));
      const charts = Object.keys(zip.files).filter((f) =>
        /^ppt\/charts\/chart\d+\.xml$/.test(f),
      );
      assert.equal(charts.length, 1);
      const chart = await zip.file(charts[0]).async("string");
      for (const text of label === "after"
        ? ["Reviewed score", "2.5", "15.75"]
        : ["Score", "1.25", "12.5"])
        assert.ok(chart.includes(text), text);
      const rasters = await preview(path.resolve(file), {
        outDir: path.resolve(output, `native-${backend}-${family}-${label}`),
      });
      assert.equal(rasters.pages.length, 2);
      for (let i = 0; i < 2; i++) {
        const native = `${dir}/${label}-${i + 1}.png`;
        await copyFile(rasters.pages[i], native);
        const svg = sceneToSvg(doc.scenes[i]),
          svgFile = `${dir}/${label}-${i + 1}.svg`,
          svgRaster = `${dir}/${label}-${i + 1}-svg.png`;
        await writeFile(svgFile, svg);
        await sharp(Buffer.from(svg)).png().toFile(svgRaster);
        for (const file of [native, svgRaster])
          images.push({
            file,
            backend,
            implementationSha: sha,
            sha256: createHash("sha256")
              .update(await readFile(file))
              .digest("hex"),
          });
      }
      records.push({
        backend,
        family,
        label,
        pptx: file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        scenesSha256: createHash("sha256")
          .update(JSON.stringify(doc.scenes))
          .digest("hex"),
      });
    }
    await writeFile(
      `${dir}/execution.json`,
      JSON.stringify(
        {
          implementationSha: sha,
          backend,
          family,
          providerExchangesMs: exchangesMs,
          conversationTrace: proposal.conversation,
          conversationTraceBytes: Buffer.byteLength(JSON.stringify(proposal.conversation)),
          runId: run.id,
          timings,
          traceBytes,
          trace,
          limits:
            "Local samples, not production percentiles. Reopen after closing the pool/connection; actual kill recovery is tested separately. Mixed-run SVG inherits its first-run-style limitation.",
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      `${root}/native-images.json`,
      JSON.stringify(images, null, 2) + "\n",
    );
    await writeFile(
      `${root}/native-archives.json`,
      JSON.stringify(records, null, 2) + "\n",
    );
  });
