#!/usr/bin/env node

// Compatibility facade + filesystem/orchestration layer for report
// rendering. Canonical document construction lives in
// packages/renderer-docx (bytes in, bytes out); canonical report
// vocabulary and validation live in packages/model. This module keeps
// the legacy public API (donor discovery, identity loading, credit
// reading, two-pass TOC orchestration, CLI) delegating to those.

import { readFile, writeFile, readdir, mkdir, mkdtemp, rm, access, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import YAML from "yaml";
import { ROOT, REFERENCE } from "./paths.js";
import { userReferenceDir } from "./tenant.js";
import { loadIdentity } from "./ai/identity.js";
import { libreofficeToPdf } from "./preview.js";
import { readCredits, isCitable, creditText } from "./credits.js";
import {
  DEFAULT_REPORT_SECTIONS,
  REPORT_IMAGE_CREDITS_SECTION,
  presentReportSections,
} from "../packages/model/report.ts";
import { validateReport as validateReportSpec } from "../packages/model/validate.ts";
import {
  buildBody as buildReportBody,
  tocTable as buildTocTable,
} from "../packages/renderer-docx/body.ts";
import {
  parseDonorSections as parseSections,
  locatePages as findPages,
  renderedReportSections,
  renderDocx,
  donorSectionsFromBytes,
} from "../packages/renderer-docx/render.ts";

const run = promisify(execFile);

export const REPORT_SECTIONS = DEFAULT_REPORT_SECTIONS;
export const IMAGE_CREDITS = REPORT_IMAGE_CREDITS_SECTION;

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
    const meta = (await import("yaml")).parse(await readFile(path.join(deckDir, "meta.yaml"), "utf8")) ?? {};
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

export async function validateReport(report) {
  return validateReportSpec(report);
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

export function presentSections(report) {
  return presentReportSections(report);
}

export function parseDonorSections(documentXml) {
  return parseSections(documentXml);
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
    sections = await donorSectionsFromBytes(new Uint8Array(await readFile(donorPath)));
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

export function tocTable(present, tocPages = {}) {
  return buildTocTable(present, tocPages);
}

function coverContext(identity) {
  const ac = identity?.academic ?? {};
  const g = identity?.guide ?? {};
  const team = identity?.team ?? {};
  return {
    teamLabel: team.label,
    members: Array.isArray(team.members)
      ? team.members.map((m) => ({ name: m?.name ?? "", roll: m?.roll }))
      : [],
    subject: ac.subject,
    examType: ac.exam_type,
    year: ac.year,
    guideName: g.name,
    guideDesignation: g.designation,
  };
}

function normalizeCredits(imageCredits) {
  return (imageCredits ?? []).map((c) => ({ text: creditText(c), slide: c?.slide }));
}

export function buildBody(report, identity, present, tocPages = {}, { includeToc = true, imageCredits = [] } = {}) {
  return buildReportBody(report, coverContext(identity), present, tocPages, {
    includeToc,
    imageCredits: normalizeCredits(imageCredits),
  });
}

export async function assembleDocx(donorPath, report, identity, present, tocPages = {}, { includeToc = true, imageCredits = [] } = {}) {
  // `present` is accepted for signature compatibility; the canonical
  // renderer derives the section list from the report itself.
  void present;
  const donorBytes = new Uint8Array(await readFile(donorPath));
  const out = await renderDocx(report, donorBytes, {
    cover: coverContext(identity),
    tocPages,
    includeToc,
    imageCredits: normalizeCredits(imageCredits),
  });
  return JSZip.loadAsync(out);
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
    const donorBytes = new Uint8Array(await readFile(donorPath));
    const bytes = await renderDocx(report, donorBytes, {
      cover: coverContext(identity),
      tocPages: {},
      includeToc: true,
      imageCredits: normalizeCredits(imageCredits),
    });
    await writeFile(pass, bytes);
    const pdf = await libreofficeToPdf(pass, { outDir: path.join(dir, "pdf") });
    const { stdout } = await run("pdftotext", ["-layout", pdf, "-"], { timeout: 60_000 });
    return findPages(stdout, present);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function locatePages(text, present) {
  return findPages(text, present);
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

  const donorBytes = new Uint8Array(await readFile(donorPath));
  const cover = coverContext(merged);
  const normalized = normalizeCredits(imageCredits);
  const tocPages = toc
    ? await locateSectionPages(donorPath, report, merged, present, { signal, imageCredits })
    : {};

  const bytes = await renderDocx(report, donorBytes, {
    cover, tocPages, includeToc: toc, imageCredits: normalized,
  });
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, bytes);

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
