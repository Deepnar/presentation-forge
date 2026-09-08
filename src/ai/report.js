import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON, researchExcerptCap } from "./ollama.js";
import { loadIdentity } from "./identity.js";
import { excerptResearch } from "./research.js";
import { selectResearch } from "./retrieve.js";
import { REPORT_SECTIONS, IMAGE_CREDITS, reportStructureForDeck, validateReport } from "../report.js";

export const REPORT_DEPTHS = ["full", "brief"];

export const MAX_CUSTOM_SECTIONS = 3;

const GUARANTEED = ["Abstract", "Introduction", "Conclusion", "References"];

const reportPlanSchema = ({ maxSections = 8 } = {}) => ({
  type: "object",
  required: ["title", "sections"],
  properties: {
    title: { type: "string", maxLength: 150 },
    subtitle: { type: "string", maxLength: 200 },
    sections: {
      type: "array",
      minItems: 3,
      maxItems: maxSections,
      items: {
        type: "object",
        required: ["name", "focus"],
        properties: {
          name: { type: "string", maxLength: 60 },
          focus: { type: "string", maxLength: 160 },
        },
      },
    },
  },
});

export function sanitizeReportPlan(plan, { structure = REPORT_SECTIONS, maxCustom = MAX_CUSTOM_SECTIONS } = {}) {
  const index = new Map(structure.map((n, i) => [n.toLowerCase(), i]));
  const seen = new Set();
  const entries = [];
  let anchor = 0;
  let seq = 0;
  let custom = 0;
  const lastBodyAnchor = Math.max(0, structure.length - 2);

  for (const s of plan?.sections ?? []) {
    const raw = typeof s?.name === "string" ? s.name.trim() : "";
    if (!raw) continue;
    const focus = String(s?.focus ?? "").trim();
    const at = index.get(raw.toLowerCase());

    if (at != null) {
      const name = structure[at];
      if (seen.has(name)) continue;
      seen.add(name);
      anchor = at;
      entries.push({ name, focus, key: [at, 0, seq++] });
      continue;
    }

    if (custom >= maxCustom) continue;
    const name = raw.slice(0, 60);
    if (seen.has(name) || name === IMAGE_CREDITS) continue;
    seen.add(name);
    custom++;
    entries.push({ name, focus, key: [Math.min(anchor, lastBodyAnchor), 1, seq++] });
  }

  for (const name of structure.filter((n) => GUARANTEED.includes(n))) {
    if (seen.has(name)) continue;
    seen.add(name);
    entries.push({ name, focus: "", key: [index.get(name.toLowerCase()), 0, seq++] });
  }

  entries.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  return {
    title: String(plan?.title ?? "").trim(),
    subtitle: String(plan?.subtitle ?? "").trim(),
    sections: entries.map(({ name, focus }) => ({ name, focus })),
  };
}

export const PROSE_ONLY_SECTIONS = new Set([
  "abstract",
  "conclusion",
  "conclusions",
  "acknowledgement",
  "acknowledgements",
  "summary",
  "executive summary",
]);

export function sectionSchema(name, depth) {
  const brief = depth !== "full";

  if (name === "References") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["entries"],
      properties: {
        entries: brief
          ? {
              type: "array",
              minItems: 3,
              maxItems: 6,
              items: { type: "string", minLength: 1, maxLength: 600 },
            }
          : {
              type: "array",
              minItems: 4,
              maxItems: 12,
              items: { type: "string", minLength: 1, maxLength: 600 },
            },
      },
    };
  }

  if (name === "Acknowledgement") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["paragraphs"],
      properties: {
        paragraphs: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: { type: "string", minLength: 1, maxLength: 800 },
        },
      },
    };
  }

  const out = {
    type: "object",
    additionalProperties: false,
    required: ["paragraphs"],
    properties: {
      paragraphs: brief
        ? {
            type: "array",
            minItems: 3,
            maxItems: 4,
            items: { type: "string", minLength: 1, maxLength: 450 },
          }
        : {
            type: "array",
            minItems: 3,
            maxItems: 6,
            items: { type: "string", minLength: 1, maxLength: 1500 },
          },
    },
  };

  if (!brief && !PROSE_ONLY_SECTIONS.has(name.trim().toLowerCase())) {
    out.properties.table = {
      type: "object",
      additionalProperties: false,
      required: ["header", "rows"],
      properties: {
        caption: { type: "string", maxLength: 300 },
        header: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          items: { type: "string", minLength: 1, maxLength: 60 },
        },
        rows: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "array",
            minItems: 2,
            maxItems: 5,
            items: { type: "string", maxLength: 200 },
          },
        },
      },
    };
  }

  return out;
}

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
const validators = new Map();

function validatorFor(name, depth) {
  const key = `${name}:${depth}`;
  if (!validators.has(key)) validators.set(key, ajv.compile(sectionSchema(name, depth)));
  return validators.get(key);
}

export function validateSection(name, depth, data) {
  if (data && typeof data === "object" && data.table && PROSE_ONLY_SECTIONS.has(String(name).trim().toLowerCase())) {
    data = { ...data };
    delete data.table;
  }
  const v = validatorFor(name, depth);
  const ok = v(data);
  if (ok) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: v.errors.map((e) => `${e.instancePath || "(root)"}: ${e.message}`),
  };
}

export async function resolveReportInputs(dir, { requirePlan = true, model } = {}) {
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* no meta yet */ }

  let plan;
  try {
    plan = YAML.parse(await readFile(path.join(dir, "plan.yaml"), "utf8"));
  } catch {
    if (requirePlan) {
      throw new Error(
        `no decks/${path.basename(dir)}/plan.yaml — approve an outline first (forge new, then the outline gate)`,
      );
    }
    plan = { title: "", sections: [] };
  }

  let research = "";
  try {
    research = await readFile(path.join(dir, "research", "notes.md"), "utf8");
  } catch {
    throw new Error(
      `no decks/${path.basename(dir)}/research/notes.md — the report is generated from the same ` +
      "research pass as the deck; create the deck with --research first",
    );
  }
  research = excerptResearch(research, await researchExcerptCap({ model }));

  const identity = await loadIdentity(dir);
  return { meta, plan, research, identity };
}

export function salvageParagraph(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  if (/^[[{]/.test(text)) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    const prose = proseWithin(parsed);
    return prose && prose.trim() ? prose.trim() : null;
  }
  if (/^[\][{}(),;:"'\s]+$/.test(text)) return null;
  if (!/\s/.test(text) && /_/.test(text)) return null;
  return text;
}

function proseWithin(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    const parts = node.map(proseWithin).filter(Boolean);
    return parts.length ? parts.join(" ") : null;
  }
  if (node && typeof node === "object") {
    for (const key of ["text", "paragraph", "content", "body"]) {
      if (typeof node[key] === "string" && node[key].trim()) return node[key];
    }
  }
  return null;
}

const LINK_LABELS =
  /\s*\[(?:DOI|PubMed(?:\s+Central)?|PMC(?:\s+free\s+article)?|Google\s+Scholar|CrossRef|Free\s+full\s+text|Abstract|Article)\]/gi;

export function cleanReference(raw) {
  const text = String(raw ?? "")
    .replace(LINK_LABELS, "")
    .replace(/\s*\[[^\]]*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text || null;
}

function cleanSection(section, name = "") {
  if (!section || typeof section !== "object") return null;
  const out = { ...section };
  if (out.table && PROSE_ONLY_SECTIONS.has(String(name).trim().toLowerCase())) delete out.table;
  if (Array.isArray(out.entries)) {
    const entries = out.entries.map(cleanReference).filter(Boolean);
    if (!entries.length) return null;
    out.entries = entries;
  }
  if (Array.isArray(out.paragraphs)) {
    const paragraphs = out.paragraphs.map(salvageParagraph).filter(Boolean);
    if (!paragraphs.length && !out.entries?.length) return null;
    if (paragraphs.length) out.paragraphs = paragraphs;
    else delete out.paragraphs;
  }
  return out;
}

export function assembleReport(plan, sectionsData) {
  const content = {};
  const order = [];
  for (const spec of plan.sections) {
    const cleaned = cleanSection(sectionsData[spec.name], spec.name);
    if (cleaned) {
      content[spec.name] = cleaned;
      order.push(spec.name);
    }
  }
  return {
    title: plan.title,
    ...(plan.subtitle ? { subtitle: plan.subtitle } : {}),
    order,
    content,
  };
}

async function planReport({ brief, research, deckSections, identity, structure = REPORT_SECTIONS, model, signal, chat }) {
  const subject = identity?.academic?.subject;
  const guaranteed = structure.filter((s) => GUARANTEED.includes(s));
  const res = await chat({
    role: "author",
    model,
    signal,
    schema: reportPlanSchema({ maxSections: structure.length + MAX_CUSTOM_SECTIONS }),
    messages: [
      {
        role: "system",
        content: [
          "You plan the structure of an academic report. This report is graded on the template's",
          "own section order, which is:",
          "",
          structure.map((s, i) => `${i + 1}. ${s}`).join("\n"),
          "",
          "Plan the FULL structure: include every section above unless the topic genuinely gives",
          "it nothing to say. Omit a section only for that reason, never for brevity.",
          ...(guaranteed.length ? [`${guaranteed.join(", ")} are always included.`] : []),
          "",
          `You may ALSO add up to ${MAX_CUSTOM_SECTIONS} sections of your own where this specific topic`,
          "earns one — a case study, a methodology, a comparison that does not fit any section",
          "above. Name it for the topic, not generically, and list it in the position it belongs:",
          "immediately after the section it follows. Add none if none is earned; an invented",
          "section that merely re-cuts material already covered makes the report worse.",
          "",
          "Give each chosen section a single specific focus sentence stating what that section",
          "must establish.",
          "The report must AGREE with the deck's approved outline below: the two artefacts are",
          "built from the same research and must not contradict each other.",
          "Return {title, subtitle, sections}.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          research ? `RESEARCH NOTES\n${research}\n` : "",
          `BRIEF\n${brief}`,
          deckSections?.length ? `DECK OUTLINE (approved)\n${deckSections.map((s, i) => `${i}=${s}`).join(", ")}` : "",
          subject ? `\nSubject: ${subject}` : "",
        ].filter(Boolean).join("\n"),
      },
    ],
  });
  return sanitizeReportPlan(res.data ?? {}, { structure });
}

const ACK_PROMPT =
  "You write the Acknowledgement of an academic report. A short, sincere paragraph " +
  "thanking the guide, the institution and the sources used. One or two paragraphs.";

async function writeSection({ spec, plan, report, research, identity, depth, density, model, signal, chat }) {
  const subject = identity?.academic?.subject;

  const outline = (plan ?? [])
    .filter((s) => s.name !== spec.name)
    .map((s) => (s.focus ? `- ${s.name}: ${s.focus}` : `- ${s.name}`))
    .join("\n");

  const written = Object.entries(report.content ?? {})
    .map(([name, sec]) => {
      const first = (sec?.paragraphs ?? sec?.entries ?? [])[0];
      return first ? `- ${name}: ${String(first).slice(0, 240)}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const densityNote = density === "sparse"
    ? "Keep the prose lean: state each point once, avoid restating the same idea in consecutive sentences."
    : density === "dense"
      ? "Write with the density of a technical brief: precise, information-rich sentences, concrete figures and terms drawn from the research where they belong."
      : "";

  const guidance = depth === "full"
    ? [
        "This is a FULL-depth report. Write FOUR substantial paragraphs per section — each one",
        "a developed claim with evidence. Add a table (caption, header, rows) where a table",
        "genuinely strengthens the section: a comparison, a specification list, a timeline.",
        "A section without a natural table must have none.",
      ]
    : [
        "This is a BRIEF report — the deck's level of depth in report form. Write ONE headline",
        "statement followed by THREE short supporting sentences: four short items total, each a",
        "single complete sentence. Do not write long paragraphs, and do not add a table.",
      ];

  const isAck = spec.name === "Acknowledgement";
  const isRefs = spec.name === "References";

  const sectionResearch = isRefs
    ? research
    : selectResearch(research, [spec.name, spec.focus].filter(Boolean).join(" "));

  const system = [
    `You write the prose of ONE section of an academic report: "${spec.name}".`,
    "Layout, fonts and colours are not your concern — the institutional template handles those.",
    "",
    ...(isRefs
      ? [
          "Write the References as a numbered list of sources drawn from the RESEARCH NOTES,",
          "in a consistent citation style. Format each entry like:",
          '"1. Author or Organisation. (Year). Title. Publisher or Site."',
        ]
      : isAck
        ? [ACK_PROMPT]
        : [
            ...guidance,
            ...(densityNote ? [densityNote, ""] : []),
            "Lead each item with its claim, then the evidence. Ground every factual claim in the",
            "RESEARCH NOTES — never invent statistics, names or numbers. Do not repeat wording",
            "already used in another section. Formal academic English.",
            "",
            "Every paragraph must serve THIS report's topic and section focus: a claim, its",
            "support, and an implied 'so what'. If a researched fact does not serve THIS report's",
            "argument, do not use it — even if it is grounded. A report that drifts from its",
            "topic is incoherent, however well-sourced each paragraph is.",
          ]),
  ].filter(Boolean).join("\n");

  const res = await chat({
    role: "author",
    model,
    signal,
    schema: sectionSchema(spec.name, depth),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          `REPORT: ${report.title}`,
          `SECTION: ${spec.name}`,
          spec.focus ? `FOCUS: ${spec.focus}` : "",
          subject ? `Subject: ${subject}` : "",
          outline ? `\nTHE OTHER SECTIONS AND WHAT THEY COVER\n${outline}` : "",
          written ? `\nALREADY WRITTEN — do not restate these\n${written}` : "",
          sectionResearch ? `\nRESEARCH NOTES\n${sectionResearch}` : "",
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  return res.data;
}

export async function generateReport({
  slug,
  dir,
  depth = "full",
  density = "balanced",
  model,
  signal,
  onProgress,
  chat = chatJSON,
  requirePlan = true,
  structure = null,
}) {
  if (!REPORT_DEPTHS.includes(depth)) {
    throw new Error(`report depth must be one of ${REPORT_DEPTHS.join(", ")}, got "${depth}"`);
  }

  const deckDir = path.resolve(dir ?? path.join(DECKS, slug ?? ""));
  const { meta, plan, research, identity } = await resolveReportInputs(deckDir, { requirePlan, model });

  const reportStructure = structure ?? (await reportStructureForDeck(deckDir));

  onProgress?.({ status: "report_planning" });
  const planned = await planReport({
    brief: meta.brief ?? plan.title ?? "",
    research,
    deckSections: plan.sections,
    identity,
    structure: reportStructure,
    model,
    signal,
    chat,
  });

  const title = planned.title || String(plan.title ?? "").trim() || String(meta.brief ?? "").slice(0, 150);
  const report = { title, ...(planned.subtitle ? { subtitle: planned.subtitle } : {}), content: {} };

  onProgress?.({ status: "report_writing", total: planned.sections.length });
  const sectionsData = {};
  const skipped = [];

  for (const [i, spec] of planned.sections.entries()) {
    onProgress?.({ status: "report_writing", index: i, total: planned.sections.length, section: spec.name });
    try {
      const data = await writeSection({
        spec, plan: planned.sections, report, research, identity, depth, density, model, signal, chat,
      });
      const check = validateSection(spec.name, depth, data ?? {});
      if (!check.ok) {
        skipped.push({ section: spec.name, reason: check.errors.slice(0, 2).join("; ") });
        continue;
      }
      sectionsData[spec.name] = data;
      report.content[spec.name] = data;
    } catch (err) {
      skipped.push({ section: spec.name, reason: err.message.slice(0, 120) });
    }
  }

  const assembled = assembleReport({ ...planned, title }, sectionsData);
  if (!Object.keys(assembled.content).length) {
    throw new Error("The model produced no report content.");
  }

  const { ok, errors } = await validateReport(assembled);
  if (!ok) {
    throw new Error(`Generated report failed validation:\n  - ${errors.join("\n  - ")}`);
  }

  const reportFile = path.join(deckDir, "report.yaml");
  await writeFile(reportFile, YAML.stringify(assembled), "utf8");

  return {
    report: assembled,
    reportFile,
    sections: assembled.order,
    skipped,
    depth,
  };
}
