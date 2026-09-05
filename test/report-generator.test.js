import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import { REPORT_SECTIONS, validateReport } from "../src/report.js";
import {
  sanitizeReportPlan,
  sectionSchema,
  validateSection,
  assembleReport,
  resolveReportInputs,
  generateReport,
} from "../src/ai/report.js";

async function fixtureDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-reptgen-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true })));
  return dir;
}

async function writeDeckFiles(dir, { withResearch = true } = {}) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({
    slug: "fixture",
    brief: "Compare GPU architecture: NVIDIA vs AMD",
    status: "ready",
  }));
  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify({
    title: "GPU Architectures: NVIDIA vs AMD",
    sections: ["Introduction", "Architecture", "Application"],
    slides: [{ type: "title", purpose: "open", section: 0 }],
  }));
  if (withResearch) {
    await mkdir(path.join(dir, "research"), { recursive: true });
    await writeFile(
      path.join(dir, "research", "notes.md"),
      "## NVIDIA Ada Lovelace\nNVIDIA RTX 4090 packs 128 SMs totalling 16,384 CUDA cores.\n\n## AMD RDNA 3\nAMD RX 7900 XTX packs 96 CUs totalling 6,144 stream processors.",
    );
  }
}

/** A model stand-in: inspects the schema to decide what section it is writing
 *  and returns content that obeys the grammar, recording the research text it
 *  was handed. */
function fakeChat(log) {
  return async ({ schema, messages }) => {
    const user = messages.at(-1).content;
    if (schema.properties?.sections) {
      return { data: {
        title: "GPU Architectures: NVIDIA vs AMD — A Comparative Study",
        subtitle: "Two bets on parallelism",
        sections: [
          { name: "Abstract", focus: "Summarise the comparison." },
          { name: "Introduction", focus: "Motivate the study." },
          { name: "Theoretical Background", focus: "Explain the two execution models." },
          { name: "Application", focus: "Map the architectures to real use." },
          { name: "Conclusion", focus: "Weigh the two bets." },
          { name: "References", focus: "List the sources." },
        ],
      } };
    }
    log.push(user);
    if (schema.required?.includes("entries")) {
      return { data: { entries: ["1. NVIDIA. (2022). Ada Lovelace Architecture Whitepaper.", "2. AMD. (2022). RDNA 3 Architecture Whitepaper.", "3. Kirk & Hwu. (2016). Programming Massively Parallel Processors.", "4. Hennessy & Patterson. (2019). Computer Architecture."] } };
    }
    if (schema.properties?.paragraphs?.items?.maxLength < 1000) {
      return { data: { paragraphs: ["A headline statement of the section.", "One supporting sentence.", "A second supporting sentence.", "A third supporting sentence."] } };
    }
    return { data: {
      paragraphs: ["First substantial paragraph.", "Second substantial paragraph.", "Third substantial paragraph.", "Fourth substantial paragraph."],
      table: { caption: "Table 1: Architectural comparison.", header: ["Parameter", "NVIDIA", "AMD"], rows: [["Cores", "16,384", "6,144"], ["Model", "SIMT", "SIMD"]] },
    } };
  };
}

/* ------------------------------------------------------------ plan coercion */

test("sanitizeReportPlan maps names onto the fixed order, dropping junk", () => {
  const out = sanitizeReportPlan({
    title: "T", subtitle: "S",
    sections: [
      { name: "Conclusion", focus: "c" },
      { name: "Summary", focus: "not a section" },
      { name: "abstract", focus: "lowercase ok" },
      { name: "Conclusion", focus: "duplicate dropped" },
      { name: "References", focus: "r" },
    ],
  });
  assert.deepEqual(out.sections.map((s) => s.name), ["Abstract", "Introduction", "Conclusion", "References"]);
});

test("sanitizeReportPlan guarantees the graded core even from an empty plan", () => {
  const out = sanitizeReportPlan({});
  assert.deepEqual(out.sections.map((s) => s.name), ["Abstract", "Introduction", "Conclusion", "References"]);
});

test("sanitizeReportPlan sorts into the fixed graded order regardless of input order", () => {
  const out = sanitizeReportPlan({
    sections: [
      { name: "Future Scope", focus: "" },
      { name: "Introduction", focus: "" },
      { name: "Abstract", focus: "" },
    ],
  });
  assert.deepEqual(out.sections.map((s) => s.name), ["Abstract", "Introduction", "Future Scope", "Conclusion", "References"]);
});

/* --------------------------------------------------------- depth as grammar */

test("brief depth forbids tables and caps paragraphs short; full depth allows both", () => {
  const brief = sectionSchema("Theoretical Background", "brief");
  const full = sectionSchema("Theoretical Background", "full");

  assert.equal(brief.properties.table, undefined);
  assert.equal(brief.properties.paragraphs.maxItems, 4);
  assert.equal(brief.properties.paragraphs.items.maxLength, 450);

  assert.ok(full.properties.table);
  assert.equal(full.properties.paragraphs.maxItems, 6);
  assert.equal(full.properties.paragraphs.items.maxLength, 1500);
});

test("validateSection: a table is valid at full depth and rejected at brief", () => {
  const withTable = {
    paragraphs: ["A.", "B.", "C."],
    table: { caption: "Table 1.", header: ["X", "Y"], rows: [["1", "2"], ["3", "4"]] },
  };
  assert.equal(validateSection("Theoretical Background", "full", withTable).ok, true);
  assert.equal(validateSection("Theoretical Background", "brief", withTable).ok, false);
});

test("validateSection: brief paragraphs must be short", () => {
  const long = { paragraphs: ["fine", "fine", "x".repeat(500)] };
  assert.equal(validateSection("Introduction", "brief", long).ok, false);
  assert.equal(validateSection("Introduction", "full", long).ok, true);
});

test("References are entries at any depth; Acknowledgement is short", () => {
  assert.ok(sectionSchema("References", "full").required.includes("entries"));
  assert.equal(sectionSchema("References", "brief").properties.table, undefined);
  assert.ok(sectionSchema("Acknowledgement", "full").required.includes("paragraphs"));
  assert.equal(sectionSchema("Acknowledgement", "full").properties.table, undefined);
});

test("no section schema carries a maxLength at or above 2000 — Ollama's grammar silently dies there", () => {
  for (const depth of ["full", "brief"]) {
    for (const name of REPORT_SECTIONS) {
      const big = [];
      JSON.stringify(sectionSchema(name, depth), (k, v) => {
        if (k === "maxLength" && v >= 2000) big.push(`${name}/${depth} maxLength ${v}`);
        return v;
      });
      assert.deepEqual(big, []);
    }
  }
});

/* ------------------------------------------------------------- assembly */

test("assembleReport keeps only sections that produced valid content", () => {
  const plan = sanitizeReportPlan({ sections: [{ name: "Abstract", focus: "" }, { name: "Conclusion", focus: "" }] });
  const report = assembleReport(plan, { Abstract: { paragraphs: ["A."] } });
  assert.deepEqual(Object.keys(report.content), ["Abstract"]);
  assert.equal(report.content.Abstract.paragraphs[0], "A.");
});

test("an assembled report validates against report.schema.json", async () => {
  const plan = sanitizeReportPlan({ sections: [{ name: "Abstract", focus: "" }] });
  const report = assembleReport(plan, { Abstract: { paragraphs: ["A."] } });
  const { ok, errors } = await validateReport(report);
  assert.equal(ok, true, errors.join("; "));
});

/* ------------------------------------------------- input resolution */

test("resolveReportInputs reads the shared research/notes.md from the deck dir", async (t) => {
  const dir = await fixtureDir(t);
  await writeDeckFiles(dir);
  const { meta, plan, research } = await resolveReportInputs(dir);
  assert.equal(meta.brief, "Compare GPU architecture: NVIDIA vs AMD");
  assert.equal(plan.title, "GPU Architectures: NVIDIA vs AMD");
  assert.match(research, /16,384 CUDA cores/);
});

test("resolveReportInputs errors clearly when research is missing", async (t) => {
  const dir = await fixtureDir(t);
  await writeDeckFiles(dir, { withResearch: false });
  await assert.rejects(resolveReportInputs(dir), /research\/notes\.md.*--research/);
});

test("resolveReportInputs errors clearly when the outline gate was skipped", async (t) => {
  const dir = await fixtureDir(t);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ brief: "x" }));
  await assert.rejects(resolveReportInputs(dir), /plan\.yaml.*outline gate/);
});

test("resolveReportInputs with requirePlan:false needs no plan.yaml — the standalone report", async (t) => {
  const dir = await fixtureDir(t);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ brief: "Standalone topic" }));
  await mkdir(path.join(dir, "research"), { recursive: true });
  await writeFile(path.join(dir, "research", "notes.md"), "## Source\nFacts for the report.");
  const { meta, plan, research } = await resolveReportInputs(dir, { requirePlan: false });
  assert.equal(meta.brief, "Standalone topic");
  assert.deepEqual(plan, { title: "", sections: [] });
  assert.match(research, /Facts for the report/);
});

/* --------------------------------------- report size vs the team that writes it */

/** A model stand-in that OBEYS the plan grammar it is handed.
 *
 *  `fakeChat` above returns six sections whatever the schema says, and every
 *  generateReport test used it — so no test could see a `maxItems` that the
 *  real, grammar-constrained model would have been held to. A stub that
 *  ignores the bound tests the stub. This one spends its budget the way the
 *  prompt directs: the graded core first, then the body sections. */
function obedientChat(planSchemas = []) {
  const CORE = ["Abstract", "Introduction", "Conclusion", "References"];
  const order = [...CORE, ...REPORT_SECTIONS.filter((s) => !CORE.includes(s))];
  return async ({ schema }) => {
    if (schema.properties?.sections) {
      planSchemas.push(schema);
      const max = schema.properties.sections.maxItems ?? REPORT_SECTIONS.length;
      return { data: { title: "T", sections: order.slice(0, max).map((name) => ({ name, focus: "f" })) } };
    }
    // Obedience has to extend to the section grammars too: Acknowledgement
    // allows at most two paragraphs, so a stub that always returns four has
    // its Acknowledgement dropped and the test reads that as a planning bug.
    const fill = (spec, text) =>
      Array.from({ length: Math.max(spec.minItems ?? 1, Math.min(spec.maxItems ?? 4, 4)) }, (_, i) => `${text} ${i + 1}.`);
    if (schema.required?.includes("entries")) {
      return { data: { entries: fill(schema.properties.entries, "Source") } };
    }
    return { data: { paragraphs: fill(schema.properties.paragraphs, "Paragraph") } };
  };
}

async function withTeam(dir, members) {
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({
    slug: "fixture", brief: "x", status: "ready",
    team: { label: "G", members: members.map((name) => ({ name, presenting: true })) },
  }));
}

test("a solo author's report still carries the substance sections", async (t) => {
  const dir = await fixtureDir(t);
  await writeDeckFiles(dir);
  await withTeam(dir, []);
  const planSchemas = [];
  const r = await generateReport({ dir, depth: "brief", chat: obedientChat(planSchemas) });

  // The budget was the TOTAL section count floored at four, while the prompt
  // also requires the four-section graded core — so one author could plan
  // nothing but the frame and the report had no body at all.
  assert.equal(planSchemas[0].properties.sections.maxItems, REPORT_SECTIONS.length);
  const body = ["Theoretical Background", "Application", "Future Scope"];
  assert.ok(
    body.some((s) => r.sections.includes(s)),
    `a report with no body section: ${r.sections.join(", ")}`,
  );
});

test("the report's section budget does not shrink with the team", async (t) => {
  // A talk is divided between the people giving it; a report's structure is
  // set by the institution grading it. One author writing up a large project
  // owes the same sections as six.
  const sizes = [[], ["A"], ["A", "B"], ["A", "B", "C", "D"], Array.from({ length: 11 }, (_, i) => `M${i}`)];
  for (const members of sizes) {
    const dir = await fixtureDir(t);
    await writeDeckFiles(dir);
    await withTeam(dir, members);
    const planSchemas = [];
    const r = await generateReport({ dir, depth: "brief", chat: obedientChat(planSchemas) });
    assert.equal(
      planSchemas[0].properties.sections.maxItems, REPORT_SECTIONS.length,
      `team of ${members.length} was handed a tightened cap`,
    );
    assert.deepEqual(r.sections, REPORT_SECTIONS, `team of ${members.length}`);
  }
});

test("generateReport with requirePlan:false builds a standalone report with no deck", async (t) => {
  const dir = await fixtureDir(t);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ brief: "Standalone topic" }));
  await mkdir(path.join(dir, "research"), { recursive: true });
  await writeFile(path.join(dir, "research", "notes.md"), "## Source\nFacts for the report.");

  const r = await generateReport({ dir, depth: "full", chat: fakeChat([]), requirePlan: false });
  assert.ok(r.sections.length >= 3);
  const onDisk = YAML.parse(await readFile(r.reportFile, "utf8"));
  const { ok } = await validateReport(onDisk);
  assert.equal(ok, true);
});

/* ------------------------------------------------------- orchestration */

test("generateReport: full depth writes four paragraphs and a table, from shared research", async (t) => {
  const dir = await fixtureDir(t);
  await writeDeckFiles(dir);
  const seen = [];
  const r = await generateReport({ dir, depth: "full", chat: fakeChat(seen) });

  assert.equal(r.depth, "full");
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(r.sections, ["Abstract", "Introduction", "Theoretical Background", "Application", "Conclusion", "References"]);
  assert.equal(r.reportFile, path.join(dir, "report.yaml"));

  // The same research/ dir the deck used fed every section writer.
  assert.ok(seen.length >= 4);
  for (const user of seen) assert.match(user, /16,384 CUDA cores/);

  // Persisted and schema-valid.
  const onDisk = YAML.parse(await readFile(r.reportFile, "utf8"));
  const { ok, errors } = await validateReport(onDisk);
  assert.equal(ok, true, errors.join("; "));
  assert.equal(onDisk.content["Theoretical Background"].paragraphs.length, 4);
  assert.ok(onDisk.content["Theoretical Background"].table);
});

test("generateReport: brief depth is visibly shorter — no tables, sentence-level paragraphs", async (t) => {
  const dir = await fixtureDir(t);
  await writeDeckFiles(dir);
  const seen = [];
  const r = await generateReport({ dir, depth: "brief", chat: fakeChat(seen) });

  const onDisk = YAML.parse(await readFile(r.reportFile, "utf8"));
  for (const name of r.sections) {
    const sec = onDisk.content[name];
    if (name === "References") continue;
    assert.equal(sec.table, undefined, `${name} must have no table at brief depth`);
    for (const p of sec.paragraphs) assert.ok(p.length <= 450, `${name} paragraph must be short`);
  }
  // And it is visibly lighter than the full report of the same fixture — read
  // the brief file before the full run overwrites it.
  const briefBytes = (await readFile(r.reportFile)).length;
  const full = await generateReport({ dir, depth: "full", chat: fakeChat([]) });
  const fullBytes = (await readFile(full.reportFile)).length;
  assert.ok(briefBytes < fullBytes);
});

test("generateReport fails clearly when research was never gathered", async (t) => {
  const dir = await fixtureDir(t);
  await writeDeckFiles(dir, { withResearch: false });
  await assert.rejects(
    generateReport({ dir, depth: "full", chat: fakeChat([]) }),
    /research\/notes\.md/,
  );
});

test("generateReport rejects an unknown depth before touching the model", async (t) => {
  const dir = await fixtureDir(t);
  await writeDeckFiles(dir);
  await assert.rejects(
    generateReport({ dir, depth: "verbose", chat: fakeChat([]) }),
    /depth must be one of full, brief/,
  );
});

test("generateReport drops a section whose prose violates its depth grammar", async (t) => {
  const dir = await fixtureDir(t);
  await writeDeckFiles(dir);
  let calls = 0;
  const chat = async ({ schema }) => {
    if (schema.properties?.sections) {
      return { data: { title: "T", sections: [{ name: "Abstract", focus: "" }, { name: "Introduction", focus: "" }] } };
    }
    calls++;
    if (schema.required?.includes("entries")) {
      return { data: { entries: ["1. S.", "2. S.", "3. S.", "4. S."] } };
    }
    // Fail the Introduction at full depth: a table with a wrong-shaped row.
    if (calls === 2) return { data: { paragraphs: ["A.", "B.", "C."], table: { header: ["X"], rows: [["bad"]] } } };
    return { data: { paragraphs: ["A.", "B.", "C.", "D."], table: { caption: "c", header: ["X", "Y"], rows: [["1", "2"], ["3", "4"]] } } };
  };
  const r = await generateReport({ dir, depth: "full", chat });
  assert.deepEqual(r.sections, ["Abstract", "Conclusion", "References"]);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].section, "Introduction");
});
