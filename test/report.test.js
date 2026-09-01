import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { buildDonor } from "./donor-fixture.js";
import {
  REPORT_SECTIONS,
  buildBody,
  presentSections,
  validateReport,
  resolveDonor,
  donorStatus,
  renderReport,
  assembleDocx,
  tocTable,
  locatePages,
} from "../src/report.js";
import { reportPreview } from "../src/preview.js";

const IDENTITY = {
  academic: { exam_type: "Innovative Examination (IE)", subject: "Operating Systems", year: "2025-2026" },
  guide: { name: "Ms. L. Suganya", designation: "Assistant Professor" },
  team: {
    label: "Group no. 2b [18-24]",
    members: [{ name: "Deepesh Sonar", roll: "21" }, { name: "Vedant Sud", roll: "23" }],
  },
};

function report(over = {}) {
  return {
    title: "A comparative study",
    content: {
      Abstract: { paragraphs: ["The abstract body."] },
      Introduction: { paragraphs: ["First paragraph.", "Second paragraph."] },
      "Theoretical Background": {
        paragraphs: ["The theory."],
        table: { caption: "Table 1: Comparison.", header: ["Parameter", "NVIDIA", "AMD"], rows: [["Model", "SIMT", "SIMD"]] },
      },
      References: { entries: ["1. First source.", "2. Second source."] },
    },
    ...over,
  };
}

const HEADING = (body) =>
  [...body.matchAll(/>(\d+)\. (Abstract|Acknowledgement|Introduction|Theoretical Background|Application|Future Scope|Conclusion|References)</g)]
    .map((m) => `${m[1]}. ${m[2]}`);

test("validateReport accepts a full report and rejects malformed ones", async () => {
  assert.deepEqual(await validateReport(report()), { ok: true, errors: [] });

  const noTitle = report();
  delete noTitle.title;
  assert.equal((await validateReport(noTitle)).ok, false);

  const unknownSection = report();
  unknownSection.content.Summary = { paragraphs: ["nope"] };
  const r = await validateReport(unknownSection);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("Summary")));

  const tooLong = report();
  tooLong.content.Introduction.paragraphs = ["x".repeat(5000)];
  assert.equal((await validateReport(tooLong)).ok, false);
});

test("presentSections keeps the fixed order and drops empty sections", () => {
  const r = report({
    content: {
      Conclusion: { paragraphs: ["End."] },
      Abstract: { paragraphs: ["Start."] },
      Introduction: { paragraphs: [] },
      Acknowledgement: {},
      References: { entries: ["1. Src."] },
    },
  });
  assert.deepEqual(presentSections(r), ["Abstract", "Conclusion", "References"]);
});

test("the body emits sections in the fixed order regardless of file order", () => {
  const r = report({
    content: {
      References: { entries: ["1. Src."] },
      Abstract: { paragraphs: ["A."] },
      Conclusion: { paragraphs: ["C."] },
      Acknowledgement: { paragraphs: ["G."] },
      Introduction: { paragraphs: ["I."] },
      "Theoretical Background": { paragraphs: ["T."] },
      Application: { paragraphs: ["App."] },
      "Future Scope": { paragraphs: ["F."] },
    },
  });
  const body = buildBody(r, IDENTITY, presentSections(r), {}, { includeToc: false });
  const headings = HEADING(body);
  assert.deepEqual(headings, REPORT_SECTIONS.map((s, i) => `${i + 1}. ${s}`));
});

test("empty sections are skipped gracefully, never a bare heading", () => {
  const r = report({ content: { Abstract: { paragraphs: ["A."] }, Acknowledgement: {} } });
  const body = buildBody(r, IDENTITY, presentSections(r), {}, { includeToc: false });
  assert.deepEqual(HEADING(body), ["1. Abstract"]);
});

test("content injection: paragraphs, references, caption and table all land", () => {
  const r = report();
  const body = buildBody(r, IDENTITY, presentSections(r), {}, { includeToc: false });
  assert.ok(body.includes("The abstract body."));
  assert.ok(body.includes("1. Abstract"));
  assert.ok(body.includes("First paragraph."));
  assert.ok(body.includes("Second paragraph."));
  assert.ok(body.includes("1. First source."));
  assert.ok(body.includes("Table 1: Comparison."));
  assert.ok(body.includes("Parameter"));
  assert.ok(body.includes("SIMT"));
  // The donor's own body text must never leak into a report.
  assert.ok(!body.includes("Second paragraph that must not survive"));
});

test("the TOC table lists present sections with the located page numbers", () => {
  const table = tocTable(["Abstract", "References"], { Abstract: 4, References: 7 });
  assert.ok(table.includes("TABLE OF CONTENT") === false); // heading is separate
  assert.ok(table.includes("ABSTRACT"));
  assert.ok(table.includes("REFERENCES"));
  assert.ok(table.includes("SR. NO."));
  assert.ok(table.includes(">4<"));
  assert.ok(table.includes(">7<"));
});

test("locatePages finds the page each heading landed on", () => {
  const text = "cover stuff\n\f\n\fTABLE OF CONTENT\n\f1. Abstract\nbody\n\fbody two\n2. Introduction\n\f3. References";
  const pages = locatePages(text, ["Abstract", "Introduction", "References", "Conclusion"]);
  assert.equal(pages.Abstract, 4);
  assert.equal(pages.Introduction, 5);
  assert.equal(pages.References, 6);
  assert.equal(pages.Conclusion, null); // heading never found in the text
});

test("a missing donor fails with a clear message, not a half-working render", async () => {
  await assert.rejects(resolveDonor(path.join("/nonexistent", "donor.docx")), /donor not found/);

  const empty = await mkdtemp(path.join(tmpdir(), "forge-ref-"));
  await assert.rejects(resolveDonor(null, empty), /report donor \.docx not found/);

  const multi = await mkdtemp(path.join(tmpdir(), "forge-ref-"));
  await writeFile(path.join(multi, "a.docx"), "x");
  await writeFile(path.join(multi, "b.docx"), "x");
  await assert.rejects(resolveDonor(null, multi), /multiple donors/);
});

test("renderReport preserves the donor chrome and strips its body", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-report-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true })));

  const donorPath = path.join(dir, "donor.docx");
  await writeFile(donorPath, await buildDonor());
  const reportFile = path.join(dir, "report.yaml");
  await writeFile(reportFile, `title: "A comparative study"\ncontent:\n  Abstract:\n    paragraphs:\n      - "Injected abstract."\n`);

  const r = await renderReport({ reportFile, donor: donorPath, toc: false });
  assert.equal(r.outFile, path.join(dir, "out", "report.docx"));
  assert.deepEqual(r.sections, ["Abstract"]);

  const zip = await JSZip.loadAsync(await readFile(r.outFile));
  const header = await zip.file("word/header1.xml").async("string");
  const footer = await zip.file("word/footer1.xml").async("string");
  const styles = await zip.file("word/styles.xml").async("string");
  const doc = await zip.file("word/document.xml").async("string");

  // Chrome parts survive byte-for-byte.
  assert.ok(header.includes("WordPictureWatermark1"));
  assert.ok(footer.includes("PAGE"));
  assert.ok(styles.includes('w:styleId="a0"'));

  // Media survives.
  assert.ok(zip.file("word/media/image1.png"));

  // Body stripped and injected; section properties (which carry the chrome
  // references and page geometry) preserved verbatim.
  assert.ok(!doc.includes("DONOR BODY TEXT TO BE STRIPPED"));
  assert.ok(doc.includes("Injected abstract."));
  assert.ok(doc.includes("<w:sectPr>"));
  assert.ok(doc.includes('<w:headerReference w:type="default" r:id="rId3"/>'));
});

test("assembleDocx errors clearly when the donor has no sectPr", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-report-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true })));
  const donorPath = path.join(dir, "donor.docx");
  const zip = new JSZip();
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>');
  await writeFile(donorPath, await zip.generateAsync({ type: "nodebuffer" }));

  const r = report();
  await assert.rejects(
    assembleDocx(donorPath, r, IDENTITY, presentSections(r)),
    /no body-level <w:sectPr>/,
  );
});

test("reportPreview rasterises the rendered docx to one PNG per page", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-report-prev-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true })));

  const donorPath = path.join(dir, "donor.docx");
  await writeFile(donorPath, await buildDonor());
  const reportFile = path.join(dir, "report.yaml");
  await writeFile(reportFile, `title: "A comparative study"\ncontent:\n  Abstract:\n    paragraphs:\n      - "Injected abstract."\n      - "A second paragraph."\n`);

  const r = await renderReport({ reportFile, donor: donorPath, toc: false });
  const p = await reportPreview(r.outFile);

  assert.ok(p.pages.length >= 1, "at least one page rasterised");
  assert.equal(p.pages.length, p.thumbs.length);

  // The PNG is a real raster of the document, not a placeholder.
  const meta = await import("sharp").then((s) => s.default(p.pages[0]).metadata());
  assert.equal(meta.format, "png");
  assert.ok(meta.width > 400, "page is wide enough to be a real render");

  // The preview lives in out/report-preview so it never collides with the
  // deck's slide previews.
  assert.ok(p.pages[0].includes(path.join("out", "report-preview")));
  assert.ok(p.pdf.endsWith(".pdf"));
});

/* ------------------------------------------------------------ donor state */

test("donorStatus names the three states a box can be in", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-donor-"));
  try {
    // A directory that does not exist at all — the fresh-container case.
    const absent = await donorStatus(path.join(dir, "nothing-here"));
    assert.equal(absent.ok, false);
    assert.equal(absent.reason, "missing");

    await writeFile(path.join(dir, "notes.txt"), "not a template");
    const empty = await donorStatus(dir);
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, "missing", "a non-.docx file is not a donor");

    await writeFile(path.join(dir, "Template.docx"), "PK");
    const one = await donorStatus(dir);
    assert.equal(one.ok, true);
    assert.deepEqual(one.donors, ["Template.docx"]);

    // resolveDonor refuses to guess between several, so the status has to say
    // so rather than reporting a healthy box that fails only at render time.
    await writeFile(path.join(dir, "Other.docx"), "PK");
    const many = await donorStatus(dir);
    assert.equal(many.ok, false);
    assert.equal(many.reason, "ambiguous");
    assert.equal(many.donors.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
