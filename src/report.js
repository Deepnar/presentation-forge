#!/usr/bin/env node

import { readFile, writeFile, readdir, mkdir, mkdtemp, rm, access, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import Ajv from "ajv";
import YAML from "yaml";
import { ROOT, REFERENCE } from "./paths.js";
import { userReferenceDir } from "./tenant.js";
import { loadIdentity } from "./ai/identity.js";
import { libreofficeToPdf } from "./preview.js";
import { readCredits, isCitable, creditText } from "./credits.js";

const run = promisify(execFile);

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

export const IMAGE_CREDITS = "Image Credits";

function donorMissing(refDir = REFERENCE) {
  return new Error(
    "report donor .docx not found. Drop the institutional template .docx into " +
    `${refDir} (or pass --donor <path>) before rendering a report. On a hosted ` +
    "deployment an admin can upload it under Settings, or set FORGE_REFERENCE_DIR.",
  );
}

export async function donorDirFor(owner) {
  const dir = userReferenceDir(owner);
  if (!dir) return REFERENCE;
  try {
    const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".docx"));
    if (files.length) return dir;
  } catch { /* this account has uploaded none */ }
  return REFERENCE;
}

export async function donorDirForDeck(deckDir) {
  if (!deckDir) return REFERENCE;
  try {
    const meta = YAML.parse(await readFile(path.join(deckDir, "meta.yaml"), "utf8")) ?? {};
    return await donorDirFor(meta.owner ?? null);
  } catch {
    return REFERENCE;                      // legacy folder, or a CLI run
  }
}

export async function donorStatus(refDir = REFERENCE) {
  let files = [];
  try {
    files = (await readdir(refDir)).filter((f) => f.toLowerCase().endsWith(".docx"));
  } catch {
    return { ok: false, dir: refDir, donors: [], reason: "missing", detail: "no reference directory on this box" };
  }
  if (!files.length) {
    return { ok: false, dir: refDir, donors: [], reason: "missing", detail: "no template .docx has been uploaded" };
  }
  if (files.length > 1) {
    return { ok: false, dir: refDir, donors: files, reason: "ambiguous", detail: `${files.length} templates present — exactly one is required` };
  }
  return { ok: true, dir: refDir, donors: files, reason: null, detail: files[0] };
}

export async function resolveDonor(explicit, refDir = REFERENCE) {
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
    throw donorMissing(refDir);
  }
  if (!files.length) throw donorMissing(refDir);
  if (files.length > 1) {
    throw new Error(
      `multiple donors in reference/ (${files.join(", ")}) — pass --donor <path> to choose`,
    );
  }
  return path.join(refDir, files[0]);
}

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

function sectionHasContent(sec) {
  if (!sec || typeof sec !== "object") return false;
  const paras = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])].filter((s) => String(s).trim());
  const hasTable = Array.isArray(sec.table?.header) && sec.table.header.length;
  return paras.length > 0 || hasTable;
}

export function presentSections(report) {
  const content = report.content ?? {};
  const declared = Array.isArray(report.order) && report.order.length ? report.order : REPORT_SECTIONS;
  const seen = new Set();
  const order = [];
  for (const name of declared) {
    if (typeof name !== "string" || seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }
  for (const name of [...REPORT_SECTIONS, ...Object.keys(content)]) {
    if (!seen.has(name) && sectionHasContent(content[name])) {
      seen.add(name);
      order.push(name);
    }
  }
  return order.filter((name) => sectionHasContent(content[name]));
}

export function parseDonorSections(documentXml) {
  const headings = [];
  let depth = 0;
  const re = /<w:tbl[ >]|<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  for (const m of documentXml.matchAll(re)) {
    const chunk = m[0];
    if (chunk.startsWith("<w:tbl")) { depth++; continue; }
    if (chunk.startsWith("</w:tbl")) { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (!/<w:b\/>/.test(chunk)) continue;
    const text = unesc([...chunk.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join("")).trim();
    const numbered = /^(\d+)[.)]\s+(\S.*)$/.exec(text);
    if (!numbered) continue;
    headings.push({ n: Number(numbered[1]), title: numbered[2].trim() });
  }

  let best = [];
  let run = [];
  for (const h of headings) {
    if (h.n === (run.length ? run.at(-1).n + 1 : 1)) run.push(h);
    else run = h.n === 1 ? [h] : [];
    if (run.length > best.length) best = [...run];
  }
  if (best.length < 3) return null;
  return best.map((h) => h.title).filter((t) => t.length <= 60);
}

const structureCache = new Map();

export async function donorSections(donorPath) {
  if (!donorPath) return null;
  let key;
  try {
    const { mtimeMs, size } = await stat(donorPath);
    key = `${donorPath}:${mtimeMs}:${size}`;
  } catch {
    return null;
  }
  if (structureCache.has(key)) return structureCache.get(key);
  let sections = null;
  try {
    const zip = await JSZip.loadAsync(await readFile(donorPath));
    const xml = await zip.file("word/document.xml")?.async("string");
    if (xml) sections = parseDonorSections(xml);
  } catch {
    sections = null;                        // an unreadable donor is not a structure
  }
  structureCache.set(key, sections);
  return sections;
}

export async function reportStructureForDeck(deckDir) {
  try {
    const donorPath = await resolveDonor(null, await donorDirForDeck(deckDir));
    return (await donorSections(donorPath)) ?? REPORT_SECTIONS;
  } catch {
    return REPORT_SECTIONS;
  }
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const unesc = (s) => String(s ?? "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, "&");

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

export function buildBody(report, identity, present, tocPages = {}, { includeToc = true, imageCredits = [] } = {}) {
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
    out.push(sectionHeading(`${i + 1}. ${name}`));
    if (name === IMAGE_CREDITS) {
      out.push(caption("Images reproduced under the licences named below. Slide numbers refer to the presentation."));
      imageCredits.forEach((c, n) => {
        const where = c.slide ? `Slide ${c.slide}. ` : "";
        out.push(bodyPara(`${n + 1}. ${where}${creditText(c)}`));
      });
      return;
    }
    const sec = report.content[name] ?? {};
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

export async function assembleDocx(donorPath, report, identity, present, tocPages = {}, { includeToc = true, imageCredits = [] } = {}) {
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

  zip.file("word/document.xml", docStart + buildBody(report, identity, present, tocPages, { includeToc, imageCredits }) + sectPr + docEnd);
  return zip;
}

async function which(bin) {
  try { await run("which", [bin]); return true; } catch { return false; }
}

export async function locateSectionPages(donorPath, report, identity, present, { signal, imageCredits = [] } = {}) {
  if (!(await which("pdftotext"))) {
    throw new Error("pdftotext not found (install poppler) — needed to number the report's table of contents; pass --no-toc to skip");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "forge-report-"));
  try {
    const pass = path.join(dir, "report.docx");
    const zip = await assembleDocx(donorPath, report, identity, present, {}, { includeToc: true, imageCredits });
    await writeFile(pass, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
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

export async function renderReport({ reportFile, donor, out, toc = true, identity, signal } = {}) {
  if (!reportFile) throw new Error("reportFile is required");
  const report = await loadReport(reportFile);
  const deckDir = path.dirname(reportFile);
  const merged = identity ?? (await loadIdentity(deckDir));
  const donorPath = await resolveDonor(donor, await donorDirForDeck(deckDir));
  const outFile = path.resolve(out ?? path.join(deckDir, "out", "report.docx"));

  const present = presentSections(report);
  if (!present.length) throw new Error("report has no section content — nothing to render");

  const imageCredits = (await readCredits(deckDir)).filter(isCitable);
  if (imageCredits.length) present.push(IMAGE_CREDITS);

  const tocPages = toc
    ? await locateSectionPages(donorPath, report, merged, present, { signal, imageCredits })
    : {};

  const zip = await assembleDocx(donorPath, report, merged, present, tocPages, { includeToc: toc, imageCredits });
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

  const problems = toc
    ? present.filter((s) => tocPages[s] == null).map((s) => `TOC page for "${s}" not found in the PDF pass`)
    : [];
  return { outFile, sections: present, pages: tocPages, problems };
}

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
