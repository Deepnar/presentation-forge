// E1: ReportSpec is model-owned. Validation messages match the legacy
// report validator exactly; the default vocabulary cannot drift from
// the schema documentation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateReport } from "../packages/model/validate.ts";
import { DEFAULT_REPORT_SECTIONS, REPORT_IMAGE_CREDITS_SECTION, presentReportSections } from "../packages/model/report.ts";

const FULL = {
  title: "Cells",
  content: {
    Abstract: { paragraphs: ["Cells matter."] },
    Introduction: { paragraphs: ["Context."], table: { header: ["A"], rows: [["1"]] } },
  },
  order: ["Abstract", "Introduction"],
};

describe("v2 report spec validation", () => {
  it("accepts a valid report", async () => {
    const { ok, errors } = await validateReport(FULL);
    assert.equal(ok, true, errors.join("\n"));
  });

  it("reports a missing title with the legacy wording", async () => {
    const { ok, errors } = await validateReport({ content: {} });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => e === '(root): missing required field "title"'), errors.join("\n"));
  });

  it("reports an unknown field with the legacy wording", async () => {
    const { ok, errors } = await validateReport({ ...FULL, bogus: 1 });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => e === '(root): unknown field "bogus"'), errors.join("\n"));
  });

  it("reports an ordinary schema violation", async () => {
    const { ok, errors } = await validateReport({ ...FULL, order: [""] });
    assert.equal(ok, false);
    assert.ok(errors.length > 0);
  });

  it("accepts custom sections and rejects invalid ones", async () => {
    assert.equal((await validateReport({ ...FULL, content: { ...FULL.content, Method: { paragraphs: ["How."] } } })).ok, true);
    assert.equal((await validateReport({ ...FULL, content: { "": { paragraphs: ["x"] } } })).ok, false);
  });

  it("preserves table constraints", async () => {
    const bad = JSON.parse(JSON.stringify(FULL));
    bad.content.Introduction.table.header = [];
    assert.equal((await validateReport(bad)).ok, false);
  });
});

describe("v2 report vocabulary drift", () => {
  it("every default section validates as a content key", async () => {
    for (const name of DEFAULT_REPORT_SECTIONS) {
      const { ok, errors } = await validateReport({
        title: "T",
        content: { [name]: { paragraphs: ["Prose."] } },
      });
      assert.equal(ok, true, `${name}: ${errors.join("\n")}`);
    }
    assert.equal(REPORT_IMAGE_CREDITS_SECTION, "Image Credits");
  });

  it("legacy and promoted schemas reach identical verdicts", async () => {
    const Ajv = (await import("ajv")).Ajv;
    const legacy = JSON.parse(
      await readFile(new URL("../schema/report.schema.json", import.meta.url), "utf8"),
    );
    const promoted = JSON.parse(
      await readFile(new URL("../packages/model/report.schema.json", import.meta.url), "utf8"),
    );
    const battery = [
      FULL,
      { title: "T", content: {} },
      ...DEFAULT_REPORT_SECTIONS.map((name) => ({ title: "T", content: { [name]: { paragraphs: ["x"] } } })),
      { title: "T", content: { Method: { paragraphs: ["x"] } }, order: ["Method"] },
      { title: "T" },
      { content: {} },
      { title: "T", content: { "": { paragraphs: ["x"] } } },
      { title: "T", content: { Abstract: { paragraphs: [] } } },
      { title: "T", content: { Abstract: { paragraphs: ["x"], bogus: 1 } } },
      { title: "T", content: { Abstract: { paragraphs: ["x"] } }, order: ["", "Abstract"] },
      { title: "T", content: { X: { table: { header: [], rows: [] } } } },
      { title: "T", content: 42 },
    ];
    for (const [i, doc] of battery.entries()) {
      const results = [];
      for (const schema of [legacy, promoted]) {
        const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
        results.push(ajv.compile(schema)(JSON.parse(JSON.stringify(doc))));
      }
      assert.equal(results[1], results[0], `battery[${i}] verdict diverged`);
    }
  });
});

describe("v2 presentReportSections", () => {
  it("follows declared order, drops empties, dedupes, appends content", async () => {
    assert.deepEqual(
      presentReportSections({
        title: "T",
        content: {
          Abstract: { paragraphs: ["a"] },
          Introduction: { paragraphs: ["i"] },
          Extra: { paragraphs: ["e"] },
          Conclusion: { paragraphs: [] },
        },
        order: ["Introduction", "Introduction", "Abstract", "Conclusion"],
      }),
      ["Introduction", "Abstract", "Extra"],
    );
  });

  it("falls back to the graded order without an explicit order", async () => {
    assert.deepEqual(
      presentReportSections({ title: "T", content: { Conclusion: { paragraphs: ["c"] } } }),
      ["Conclusion"],
    );
  });
});
