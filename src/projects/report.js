// A project's report (F7): the same planner, section writer and donor
// renderer as a deck's report, fed from the project instead of a deck
// directory — its slides and speaker notes are the argument, its files the
// evidence (a source-of-truth file first), the account's identity the cover.
// The report is kept with the project as a structured spec and rendered to
// .docx when downloaded.
import { randomBytes } from "node:crypto";
import { projectStore } from "./backend.js";
import { generateReport } from "../ai/report.js";
import { researchExcerptCap } from "../ai/ollama.js";
import { loadIdentity } from "../ai/identity.js";
import { donorDirFor, resolveDonor, donorSections, renderReportBytes } from "../report.js";
import { DEFAULT_REPORT_SECTIONS } from "../../packages/model/report.ts";

const refuse = (code, message) => Object.assign(new Error(message), { code });

const runsText = (paragraphs) => (paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join("")).filter((t) => t.trim()).join("\n");

// A slide's words as a reader would take them in: the heading, then the
// rest top to bottom, tables and charts as plain rows. The theme's marks
// (slide number, presenter line) say nothing about the subject.
export function slideText(scene) {
  const els = (scene.elements ?? []).filter((e) => !e.hidden && !String(e.id).includes(":chrome:"));
  const heading = els.find((e) => e.kind === "text" && String(e.id).endsWith(":title:heading"));
  const rest = els.filter((e) => e !== heading).sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const lines = [];
  for (const e of rest) {
    if (e.kind === "text") lines.push(runsText(e.paragraphs));
    else if (e.kind === "table") lines.push(...(e.table?.rows ?? []).map((r) => r.map((c) => (typeof c === "string" ? c : runsText(c?.paragraphs) || c?.text || "")).join(" | ")));
    else if (e.kind === "chart" && e.chart) {
      lines.push(`Chart: ${(e.chart.series ?? []).map((s) => `${s.name}: ${(e.chart.categories ?? []).map((c, i) => `${c} ${s.values[i]}`).join(", ")}`).join("; ")}`);
    }
  }
  return { title: heading ? runsText(heading.paragraphs).replace(/\n/g, " ") : "", body: lines.filter((l) => l.trim()).join("\n") };
}

async function fileText(store, who, id, file, budget) {
  let text = "", offset = 0;
  while (text.length < budget && offset !== null) {
    const page = (await store.readProjectFile({ ...who, id, fileId: file.id, offset, limit: Math.min(20000, budget - text.length) })).file;
    if (!page) break;
    text += page.text;
    offset = page.nextOffset;
  }
  return text;
}

// The generator's inputs, from the project. The research budget is shared
// so neither part crowds out the other: facts a person marked as truth
// first, then the deck's own words, then the rest of their files.
export async function projectReportInputs({ owner = null, admin = false, id, model } = {}) {
  const store = await projectStore();
  const who = { owner, admin };
  const { doc } = await store.getProject({ ...who, id });
  if (!doc) throw refuse("not-found", "no such project");
  const slides = doc.scenes.map((s) => ({ ...slideText(s), notes: s.notes ?? "" }));
  if (!slides.some((s) => s.title || s.body)) throw refuse("empty-project", "the project has no text to write a report from");
  const cap = await researchExcerptCap({ model });
  const files = (await store.listProjectFiles({ ...who, id })).files ?? [];
  const truth = files.filter((f) => f.role === "source-of-truth");
  const others = files.filter((f) => ["source", "dataset", "unknown"].includes(f.role));
  const parts = [];
  let left = cap;
  const take = async (list, share, label) => {
    for (const f of list) {
      const budget = Math.min(left, Math.floor(share / list.length));
      if (budget < 400) break;
      const text = (await fileText(store, who, id, f, budget)).trim();
      if (!text) continue;
      parts.push(`## ${label}: ${f.name}\n${text}`);
      left -= text.length;
    }
  };
  await take(truth, cap * 0.45, "Source of truth (its facts and figures are not to be changed)");
  const deck = slides.map((s, i) => `### Slide ${i + 1}${s.title ? `: ${s.title}` : ""}\n${s.body}${s.notes ? `\nSpeaker notes: ${s.notes}` : ""}`).join("\n\n");
  const deckPart = `## The presentation\n${deck}`.slice(0, Math.max(0, Math.floor(left * (others.length ? 0.6 : 1))));
  parts.push(deckPart);
  left -= deckPart.length;
  await take(others, left, "Source");
  return {
    title: doc.title,
    revision: doc.revision,
    inputs: {
      meta: { brief: doc.title },
      plan: { title: doc.title, sections: slides.map((s) => s.title).filter(Boolean).slice(0, 40) },
      research: parts.join("\n\n"),
      identity: await loadIdentity(null, { owner }),
    },
  };
}

async function donorFor(owner) {
  const donorPath = await resolveDonor(null, await donorDirFor(owner));
  return { donorPath, structure: (await donorSections(donorPath).catch(() => null)) ?? DEFAULT_REPORT_SECTIONS };
}

// Writes the report and keeps it with the project. `chat` is the model
// client (injected in tests); everything else is the deck report's path.
export async function generateProjectReport({ owner = null, admin = false, id, depth = "full", density = "balanced", model, signal, onProgress, chat } = {}) {
  const { title, revision, inputs } = await projectReportInputs({ owner, admin, id, model });
  let structure = DEFAULT_REPORT_SECTIONS;
  try { ({ structure } = await donorFor(owner)); } catch { /* no donor yet: the default sections, and render says what is missing */ }
  const out = await generateReport({ inputs, structure, persist: false, depth, density, model, signal, onProgress, ...(chat ? { chat } : {}) });
  const store = await projectStore();
  const document = { id: `doc_${randomBytes(8).toString("hex")}`, kind: "report", title: out.report.title || title, body: out.report, basisRevision: revision };
  const { stored } = await store.putProjectDocument({ owner, admin, id, document });
  if (!stored) throw refuse("not-found", "no such project");
  return { document: { id: document.id, kind: "report", title: document.title, basisRevision: revision }, skipped: out.skipped, sections: out.sections };
}

// The .docx for a kept report, on the account's donor.
export async function renderProjectReport({ owner = null, admin = false, id, documentId, toc = true, signal } = {}) {
  const store = await projectStore();
  const { document } = await store.getProjectDocument({ owner, admin, id, documentId });
  if (!document || document.kind !== "report") throw refuse("not-found", "no such report");
  let donor;
  try { donor = await donorFor(owner); } catch { throw refuse("no-donor", "no report template is installed — an admin uploads one under Admin → Reports"); }
  const identity = await loadIdentity(null, { owner });
  const { bytes, problems } = await renderReportBytes({ report: document.body, identity, donorPath: donor.donorPath, toc, signal });
  return { bytes, title: document.title, problems };
}
