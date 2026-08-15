#!/usr/bin/env node
/**
 * The report renderer — the opposite of the deck.
 *
 * A deck is free and themed; a report is rigid and graded against the
 * institutional template exactly as it is. The template's own .docx (gitignored
 * reference/) is the donor: we strip only its body, keep every other part
 * byte-identical (headers with the VML watermark, footer, styles, settings,
 * theme, media), and inject generated content into the donor's body plus its
 * own section properties.
 *
 * The `docx` package is generation-only and cannot open an existing file, so
 * this is unzip + OOXML surgery via jszip. The donor's XML parts are preserved
 * as raw strings; the only part we touch is word/document.xml, and we touch
 * only its body. Section order is fixed (the graded constant), not negotiated.
 */

import { readFile, writeFile, readdir, mkdir, mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import Ajv from "ajv";
import YAML from "yaml";
import { ROOT } from "./paths.js";
import { loadIdentity } from "./ai/identity.js";
import { libreofficeToPdf } from "./preview.js";

const run = promisify(execFile);

/** The graded constant. The renderer emits these in this order, never the order
 *  the content file happens to list them in. */
export const REPORT_SECTIONS = [
  "Abstract",
  "Acknowledgement",
  "Introduction",
  "Theoretical Background",
  "Application",
  "Future Scope",
  "Conclusion",
  "References",
];

/* ------------------------------------------------------- donor discovery */

function donorMissing() {
  return new Error(
    "report donor .docx not found — reference/ is gitignored. Drop the institutional " +
    "template .docx into reference/ (or pass --donor <path>) before rendering a report.",
  );
}

/** The donor lives in gitignored reference/. With several present, an explicit
 *  path is required rather than guessing which template to match. */
export async function resolveDonor(explicit, refDir = path.join(ROOT, "reference")) {
  if (explicit) {
    await access(explicit).catch(() => {
      throw new Error(`report donor not found: ${explicit}`);
    });
    return path.resolve(explicit);
  }
  let files;
  try {
    files = (await readdir(refDir)).filter((f) => f.endsWith(".docx"));
  } catch {
    throw donorMissing();
  }
  if (!files.length) throw donorMissing();
  if (files.length > 1) {
    throw new Error(
      `multiple donors in reference/ (${files.join(", ")}) — pass --donor <path> to choose`,
    );
  }
  return path.join(refDir, files[0]);
}

/* -------------------------------------------------------- content loading */

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });

let _validate;
async function compiled() {
  if (!_validate) {
    const schema = JSON.parse(await readFile(path.join(ROOT, "schema", "report.schema.json"), "utf8"));
    _validate = ajv.compile(schema);
  }
  return _validate;
}

export async function validateReport(report) {
  const v = await compiled();
  const ok = v(report);
  if (ok) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: v.errors.map((e) => {
      const at = e.instancePath || "(root)";
      if (e.keyword === "additionalProperties") return `${at}: unknown field "${e.params.additionalProperty}"`;
      if (e.keyword === "required") return `${at}: missing required field "${e.params.missingProperty}"`;
      return `${at}: ${e.message}`;
    }),
  };
}

export async function loadReport(file) {
  const raw = await readFile(file, "utf8");
  const report = file.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  const { ok, errors } = await validateReport(report);
  if (!ok) {
    const err = new Error(`Report failed validation:\n  - ${errors.join("\n  - ")}`);
    err.validation = errors;
    throw err;
  }
  return report;
}

/** The sections that have anything to say, in fixed order. An empty section is
 *  skipped gracefully — never a bare heading. */
export function presentSections(report) {
  const content = report.content ?? {};
  return REPORT_SECTIONS.filter((name) => {
    const sec = content[name];
    if (!sec || typeof sec !== "object") return false;
    const paras = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])].filter((s) => String(s).trim());
    const hasTable = Array.isArray(sec.table?.header) && sec.table.header.length;
    return paras.length > 0 || hasTable;
  });
}

/* ------------------------------------------------------------ XML pieces */

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const FONT = '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
const CELL_FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>';
const SZ = (v) => `<w:sz w:val="${v}"/><w:szCs w:val="${v}"/>`;

const HEAD_RPR = `${FONT}<w:b/><w:sz w:val="32"/><w:lang w:val="en-IN"/>`;
const BODY_RPR = `${FONT}<w:sz w:val="24"/><w:lang w:val="en-IN"/>`;
const CAPTION_RPR = `${FONT}<w:i/><w:sz w:val="20"/>`;
const TOC_HEAD_RPR = `${FONT}<w:b/><w:bCs/>${SZ(44)}<w:u w:val="single"/>`;
const TOC_CELL_RPR = `${FONT}<w:b/><w:bCs/>${SZ(24)}`;
const CELL_RPR = `${CELL_FONT}<w:b w:val="0"/><w:sz w:val="24"/>`;

const CELL_BORDERS =
  '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '<w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '<w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/></w:tcBorders>';
const CELL_MARGIN =
  '<w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
  '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tcMar>';

function t(text, rpr) {
  const rp = rpr ? `<w:rPr>${rpr}</w:rPr>` : "";
  return `<w:r>${rp}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

function centerBold(text, sz) {
  const rpr = `${FONT}<w:b/><w:bCs/>${SZ(sz)}`;
  return `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${rpr}</w:rPr></w:pPr>${t(text, rpr)}</w:p>`;
}

const spacer = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>';

function bodyPara(text) {
  return `<w:p><w:pPr><w:spacing w:line="259" w:lineRule="auto"/><w:rPr>${BODY_RPR}</w:rPr></w:pPr>${t(text, BODY_RPR)}</w:p>`;
}

function sectionHeading(text) {
  return `<w:p><w:pPr><w:spacing w:line="259" w:lineRule="auto"/><w:rPr>${HEAD_RPR}</w:rPr></w:pPr>${t(text, HEAD_RPR)}</w:p>`;
}

function caption(text) {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${CAPTION_RPR}</w:rPr></w:pPr>${t(text, CAPTION_RPR)}</w:p>`;
}

/* ------------------------------------------------------------ body build */

/** Cover page from the merged identity: title, group label, names table and
 *  the submission block, matching the donor's own cover structure. The title
 *  is the one heading the user sees first — bold, centred, larger than the
 *  body so the report announces itself. */
function cover(report, identity) {
  const ac = identity.academic ?? {};
  const g = identity.guide ?? {};
  const team = identity.team ?? {};
  const members = Array.isArray(team.members) ? team.members : [];

  const out = [];
  out.push(centerBold(report.title, 44));
  if (team.label) {
    out.push(centerBold(`By ${team.label}`, 44));
    out.push(centerBold(`By ${team.label}`, 32));
  }
  out.push(spacer);
  if (members.length) out.push(namesTable(members));
  out.push(spacer);
  if (ac.exam_type) out.push(centerBold(`A ${ac.exam_type} Report`, 36));
  if (ac.subject) {
    out.push(centerBold("Submitted for the Subject of", 36));
    out.push(centerBold(ac.subject, 36));
  }
  out.push(spacer);
  if (g.name) {
    out.push(centerBold("Under the Guidance of", 36));
    out.push(centerBold(g.name, 36));
    if (g.designation) out.push(centerBold(g.designation, 36));
  }
  if (ac.year) out.push(centerBold(`A.Y. ${ac.year}`, 28));
  return out.join("\n");
}

function namesTable(members) {
  const widths = [3274, 3274, 3275];
  const rows = [["Names", "Roll No.", "Signature"]].concat(
    members.map((m) => [m.name ?? "", m.roll ?? "", ""]),
  );
  const trs = rows.map((cells, ri) => {
    const isHdr = ri === 0;
    const rpr = isHdr ? `${FONT}<w:b/><w:bCs/>` : CELL_RPR;
    const cellsXml = cells.map((c, ci) =>
      `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${rpr}</w:rPr></w:pPr>${t(c ?? "", rpr)}</w:p></w:tc>`,
    ).join("");
    return `<w:tr><w:trPr><w:trHeight w:val="349"/></w:trPr>${cellsXml}</w:tr>`;
  }).join("");
  const total = widths.reduce((a, b) => a + b, 0);
  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="a"/><w:tblW w:w="${total}" w:type="dxa"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/></w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" ` +
    `w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${trs}</w:tbl>`
  );
}

/** The static table of contents, mirroring the donor's: page numbers are the
 *  real ones from the two-pass locate step, or an em dash when a section could
 *  not be found in the PDF pass. */
export function tocTable(present, tocPages = {}) {
  const widths = [2883, 2910, 2884];
  const rows = [["SR. NO.", "TITLE", "PAGE NO."]].concat(
    present.map((s, i) => [String(i + 1), s.toUpperCase(), String(tocPages[s] ?? "—")]),
  );
  const trs = rows.map((cells, ri) => {
    const isHdr = ri === 0;
    const trPr = `<w:trPr><w:trHeight w:val="${isHdr ? 942 : 845}"/><w:jc w:val="center"/></w:trPr>`;
    const cellsXml = cells.map((c, ci) => {
      const jc = ci === 1 && !isHdr ? "" : '<w:jc w:val="center"/>';
      const vAlign = ci === 2 ? '<w:vAlign w:val="center"/>' : "";
      const ppr = `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${jc}<w:rPr>${TOC_CELL_RPR}</w:rPr></w:pPr>`;
      return (
        `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/>${CELL_BORDERS}${CELL_MARGIN}${vAlign}</w:tcPr>` +
        `<w:p>${ppr}${t(c ?? "", TOC_CELL_RPR)}</w:p></w:tc>`
      );
    }).join("");
    return `<w:tr>${trPr}${cellsXml}</w:tr>`;
  }).join("");
  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="a0"/><w:tblW w:w="8677" w:type="dxa"/>` +
    '<w:jc w:val="center"/><w:tblLayout w:type="fixed"/>' +
    `<w:tblLook w:val="0400" w:firstRow="0" w:lastRow="0" w:firstColumn="0" ` +
    `w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${trs}</w:tbl>`
  );
}

/** Generated content tables keep the donor's own style: borderless, bold
 *  header, plain rows. */
function contentTable({ header, rows }) {
  const n = header.length;
  const total = 9026;
  const widths = Array.from({ length: n }, () => Math.floor(total / n));
  widths[n - 1] = total - widths.slice(0, n - 1).reduce((a, b) => a + b, 0);
  const cellsXml = (cells, isHdr) => cells.map((c, ci) => {
    const rpr = `${CELL_FONT}${isHdr ? "<w:b/>" : '<w:b w:val="0"/>'}<w:sz w:val="24"/>`;
    return `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/></w:tcPr><w:p>${t(c ?? "", rpr)}</w:p></w:tc>`;
  }).join("");
  const trs = [header, ...rows].map((cells, ri) => `<w:tr>${cellsXml(cells, ri === 0)}</w:tr>`).join("");
  return (
    '<w:tbl><w:tblPr><w:tblW w:type="auto" w:w="0"/>' +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:firstColumn="1" w:lastRow="0" ` +
    `w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${trs}</w:tbl>`
  );
}

/** The body: cover, ONE page break, TOC, ONE page break, then the fixed
 *  sections in order. The single breaks reproduce the donor's cover-page and
 *  TOC-page boundaries without the blank interior pages the doubled breaks
 *  produced when a cover or TOC ended near a page boundary; the first section
 *  follows the TOC's break directly, so it needs no pageBreakBefore of its
 *  own. Pure, so tests can assert on the XML directly. */
export function buildBody(report, identity, present, tocPages = {}, { includeToc = true } = {}) {
  const out = [cover(report, identity)];
  if (includeToc) {
    out.push(pageBreak);
    out.push(
      `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${TOC_HEAD_RPR}</w:rPr></w:pPr>${t("TABLE OF CONTENT", TOC_HEAD_RPR)}</w:p>`,
      tocTable(present, tocPages),
    );
  }
  out.push(pageBreak);
  present.forEach((name, i) => {
    const sec = report.content[name] ?? {};
    out.push(sectionHeading(`${i + 1}. ${name}`));
    for (const para of [...(sec.paragraphs ?? []), ...(sec.entries ?? [])]) {
      if (String(para).trim()) out.push(bodyPara(para));
    }
    if (Array.isArray(sec.table?.header) && sec.table.header.length) {
      if (sec.table.caption) out.push(caption(sec.table.caption));
      out.push(contentTable(sec.table));
    }
  });
  return out.join("\n");
}

/** Load the donor, swap its body for the generated one, keep every other part
 *  untouched. The sectPr is lifted verbatim, so the header/footer/watermark
 *  references and the page geometry survive exactly as the template has them. */
export async function assembleDocx(donorPath, report, identity, present, tocPages = {}, { includeToc = true } = {}) {
  const zip = await JSZip.loadAsync(await readFile(donorPath));
  const doc = await zip.file("word/document.xml").async("string");

  const bodyIdx = doc.indexOf("<w:body>");
  if (bodyIdx < 0) throw new Error("donor document.xml has no <w:body>");
  const sectStart = doc.lastIndexOf("<w:sectPr");
  const sectEnd = doc.indexOf("</w:sectPr>", sectStart);
  if (sectStart < 0 || sectEnd < 0) {
    throw new Error("donor document.xml has no body-level <w:sectPr> — cannot preserve its chrome");
  }

  const docStart = doc.slice(0, bodyIdx + "<w:body>".length);
  const sectPr = doc.slice(sectStart, sectEnd + "</w:sectPr>".length);
  const docEnd = doc.slice(sectEnd + "</w:sectPr>".length);

  zip.file("word/document.xml", docStart + buildBody(report, identity, present, tocPages, { includeToc }) + sectPr + docEnd);
  return zip;
}

/* -------------------------------------------------- two-pass TOC pages */

async function which(bin) {
  try { await run("which", [bin]); return true; } catch { return false; }
}

/** Render once, ask LibreOffice where each heading actually lands, and return
 *  section → page. A heading the PDF pass cannot find yields null — the TOC
 *  shows an em dash for it rather than a wrong number. */
export async function locateSectionPages(donorPath, report, identity, present, { signal } = {}) {
  if (!(await which("pdftotext"))) {
    throw new Error("pdftotext not found (install poppler) — needed to number the report's table of contents; pass --no-toc to skip");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "forge-report-"));
  try {
    const pass = path.join(dir, "report.docx");
    const zip = await assembleDocx(donorPath, report, identity, present, {}, { includeToc: true });
    await writeFile(pass, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    // libreofficeToPdf clears its outDir, so the PDF pass gets a nested dir
    // and the pass document survives it.
    const pdf = await libreofficeToPdf(pass, { outDir: path.join(dir, "pdf") });
    const { stdout } = await run("pdftotext", ["-layout", pdf, "-"], { timeout: 60_000 });
    return locatePages(stdout, present);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function locatePages(text, present) {
  const pages = text.split("\f");
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const out = {};
  present.forEach((name, i) => {
    const target = norm(`${i + 1}. ${name}`);
    const idx = pages.findIndex((p) => p.split("\n").some((l) => norm(l) === target));
    out[name] = idx >= 0 ? idx + 1 : null;
  });
  return out;
}

/* --------------------------------------------------------------- render */

export async function renderReport({ reportFile, donor, out, toc = true, identity, signal } = {}) {
  if (!reportFile) throw new Error("reportFile is required");
  const report = await loadReport(reportFile);
  const deckDir = path.dirname(reportFile);
  const merged = identity ?? (await loadIdentity(deckDir));
  const donorPath = await resolveDonor(donor);
  const outFile = path.resolve(out ?? path.join(deckDir, "out", "report.docx"));

  const present = presentSections(report);
  if (!present.length) throw new Error("report has no section content — nothing to render");

  const tocPages = toc
    ? await locateSectionPages(donorPath, report, merged, present, { signal })
    : {};

  const zip = await assembleDocx(donorPath, report, merged, present, tocPages, { includeToc: toc });
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

  const problems = toc
    ? present.filter((s) => tocPages[s] == null).map((s) => `TOC page for "${s}" not found in the PDF pass`)
    : [];
  return { outFile, sections: present, pages: tocPages, problems };
}

/* ------------------------------------------------------------------- CLI */

function parseArgs(argv) {
  const args = { toc: true };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--donor") args.donor = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--no-toc") args.toc = false;
    else rest.push(a);
  }
  args.reportFile = rest[0];
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.reportFile) {
    console.error("usage: node src/report.js <report.yaml> [--donor reference/x.docx] [--out file.docx] [--no-toc]");
    process.exit(2);
  }
  try {
    await access(args.reportFile);
  } catch {
    console.error(`no such report file: ${args.reportFile}`);
    process.exit(2);
  }
  try {
    const r = await renderReport(args);
    console.log(`  report ${path.relative(ROOT, r.outFile)} — ${r.sections.join(" → ")}`);
    for (const p of r.problems) console.error(`  ! ${p}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
