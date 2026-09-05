import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import {
  REPORT_SECTIONS,
  parseDonorSections,
  donorSections,
  presentSections,
} from "../src/report.js";

/**
 * The report's structure is data, not a constant.
 *
 * The renderer never cared what a section was CALLED — `buildBody` emits
 * `content[name]` for any name, which is how the Image Credits appendix has
 * always worked without being in the graded list. What was fixed was the LIST,
 * and that belongs to whichever institution's template is installed.
 */

/** A donor body: numbered bold headings, plus the things that look like them
 *  and are not — a numbered reference list, and a table of contents. */
function donorXml(headings, { refs = [], toc = [] } = {}) {
  const heading = (n, title) =>
    `<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${n}. ${title}</w:t></w:r></w:p>`;
  const ref = (n, text) => `<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${n}. ${text}</w:t></w:r></w:p>`;
  const tocTable = toc.length
    ? `<w:tbl>${toc.map((t, i) =>
        `<w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${i + 1}. ${t}</w:t></w:r></w:p></w:tc></w:tr>`,
      ).join("")}</w:tbl>`
    : "";
  return `<w:document><w:body>${tocTable}` +
    headings.map((h, i) => heading(i + 1, h)).join("") +
    refs.map((r, i) => ref(i + 1, r)).join("") +
    `</w:body></w:document>`;
}

async function donorFile(t, xml) {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-structure-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const file = path.join(dir, "donor.docx");
  await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  return file;
}

/* ------------------------------------------------- reading the structure */

test("parseDonorSections reads the template's own numbered heading run", () => {
  assert.deepEqual(
    parseDonorSections(donorXml(["Abstract", "Introduction", "Methodology", "Results", "References"])),
    ["Abstract", "Introduction", "Methodology", "Results", "References"],
  );
});

test("a numbered reference list is not a structure — bold is the discriminator", () => {
  // References are the other consecutively numbered thing in a report, they
  // start at 1 like the headings do, and they are not bold. Numbering alone
  // would read the bibliography as the section list.
  const xml = donorXml(["Abstract", "Introduction", "Conclusion", "References"], {
    refs: ["Author, A. (2020). A paper.", "Author, B. (2021). Another.", "Author, C. (2022). A third."],
  });
  assert.deepEqual(parseDonorSections(xml), ["Abstract", "Introduction", "Conclusion", "References"]);
});

test("the table of contents is not mistaken for the structure", () => {
  // The TOC lists the same names in the same order inside a table. Reading it
  // as well would double every section.
  const names = ["Abstract", "Introduction", "Conclusion", "References"];
  assert.deepEqual(parseDonorSections(donorXml(names, { toc: names })), names);
});

test("a donor that declares nothing recognisable yields null, not a guess", () => {
  assert.equal(parseDonorSections("<w:document><w:body><w:p><w:t>Hello.</w:t></w:p></w:body></w:document>"), null);
  // Two headings is not a structure — too short to be anything but a stray.
  assert.equal(parseDonorSections(donorXml(["Abstract", "References"])), null);
});

test("a heading run must be consecutive from 1", () => {
  const xml =
    `<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>4. Stray</w:t></w:r></w:p>` +
    donorXml(["Abstract", "Introduction", "Conclusion", "References"]);
  assert.deepEqual(parseDonorSections(xml), ["Abstract", "Introduction", "Conclusion", "References"]);
});

test("donorSections reads a real .docx, and answers null for one it cannot", async (t) => {
  const file = await donorFile(t, donorXml(["Abstract", "Design", "Evaluation", "References"]));
  assert.deepEqual(await donorSections(file), ["Abstract", "Design", "Evaluation", "References"]);
  assert.equal(await donorSections(null), null);
  assert.equal(await donorSections(path.join(path.dirname(file), "absent.docx")), null);
});

test("donorSections re-reads a template that was replaced", async (t) => {
  // The cache is keyed on the file's mtime and size, not its path: an admin
  // uploading a new template must not keep getting the old structure.
  const file = await donorFile(t, donorXml(["Abstract", "Design", "Evaluation", "References"]));
  assert.deepEqual(await donorSections(file), ["Abstract", "Design", "Evaluation", "References"]);

  const zip = new JSZip();
  zip.file("word/document.xml", donorXml(["Summary", "Method", "Findings", "Sources"]));
  await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  assert.deepEqual(await donorSections(file), ["Summary", "Method", "Findings", "Sources"]);
});

/* --------------------------------------------- emitting in that structure */

const withContent = (names) =>
  Object.fromEntries(names.map((n) => [n, { paragraphs: [`${n} prose.`] }]));

test("presentSections follows the report's declared order", () => {
  const order = ["Abstract", "Introduction", "Depot Case Study", "Conclusion", "References"];
  const report = { title: "T", order, content: withContent(order) };
  assert.deepEqual(presentSections(report), order);
});

test("presentSections falls back to the graded order for a report with none", () => {
  // Every report written before the structure became data.
  const report = { title: "T", content: withContent(["Conclusion", "Abstract", "References"]) };
  assert.deepEqual(presentSections(report), ["Abstract", "Conclusion", "References"]);
});

test("a section with content but missing from the order is still emitted", () => {
  // Silently dropping it would lose model-written prose to a bookkeeping slip,
  // which is the worst available outcome — the .docx renders and looks fine.
  const report = {
    title: "T",
    order: ["Abstract", "Conclusion"],
    content: withContent(["Abstract", "Conclusion", "References", "Late Addition"]),
  };
  const out = presentSections(report);
  assert.ok(out.includes("References"), out.join(", "));
  assert.ok(out.includes("Late Addition"), out.join(", "));
  assert.equal(out[0], "Abstract");
});

test("an empty section is skipped even when the order names it", () => {
  const report = {
    title: "T",
    order: ["Abstract", "Methodology", "References"],
    content: { Abstract: { paragraphs: ["A."] }, Methodology: { paragraphs: [] }, References: { entries: ["1. S."] } },
  };
  assert.deepEqual(presentSections(report), ["Abstract", "References"]);
});

test("a duplicated name in the order is emitted once", () => {
  const report = {
    title: "T",
    order: ["Abstract", "Abstract", "References"],
    content: withContent(["Abstract", "References"]),
  };
  assert.deepEqual(presentSections(report), ["Abstract", "References"]);
});

test("the graded eight remain the fallback structure", () => {
  assert.deepEqual(REPORT_SECTIONS.slice(0, 3), ["Abstract", "Acknowledgement", "Introduction"]);
  assert.equal(REPORT_SECTIONS.at(-1), "References");
});
