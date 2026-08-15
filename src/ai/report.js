import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON, researchExcerptCap } from "./ollama.js";
import { loadIdentity } from "./identity.js";
import { excerptResearch } from "./research.js";
import { REPORT_SECTIONS, validateReport } from "../report.js";
import { targetSections } from "./team.js";

/**
 * The report content generator — the deck pipeline's writer for the report
 * side of the submission workflow.
 *
 * One brief → one research pass → both deck.yaml and report.yaml from the same
 * decks/<slug>/research/ artefact. This module is to the deck's generate.js
 * what src/report.js is to the deck's render.js: the report uses the fixed
 * graded section order, so there is no structure to plan, only the depth of
 * each section's prose.
 *
 * Depth is a parameter, not a second generator. Full depth writes four
 * paragraphs and a table where one earns its place; brief depth writes a
 * headline statement plus three short supporting sentences and never a table.
 * The renderer (src/report.js) is depth-agnostic — a section is paragraphs
 * plus an optional table — so depth changes only the schema bounds and the
 * prompt, never the output file's shape.
 */

export const REPORT_DEPTHS = ["full", "brief"];

/* ------------------------------------------------------ plan / plan schema */

/** The report's plan: title plus which fixed sections carry content and what
 *  each must say. Small grammar, and `name` is coerced after (the same reason
 *  the deck outline leaves `type` free). */
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
          name: { type: "string", maxLength: 30 },
          focus: { type: "string", maxLength: 160 },
        },
      },
    },
  },
});

/**
 * Coerce the planner's output onto the fixed graded order: unknown names
 * dropped (case-insensitive match against REPORT_SECTIONS), duplicates
 * removed, and the graded core (Abstract, Introduction, Conclusion,
 * References) guaranteed present. Same role as sanitizePlan in generate.js —
 * both a model's output and any future human edit pass through here.
 */
export function sanitizeReportPlan(plan) {
  const seen = new Set();
  const sections = [];
  for (const s of plan?.sections ?? []) {
    const name = typeof s?.name === "string" ? s.name.trim() : "";
    const match = REPORT_SECTIONS.find((r) => r.toLowerCase() === name.toLowerCase());
    if (!match || seen.has(match)) continue;
    seen.add(match);
    sections.push({ name: match, focus: String(s.focus ?? "").trim() });
  }
  // The graded core is non-negotiable even when the model omits it.
  for (const core of ["Abstract", "Introduction", "Conclusion", "References"]) {
    if (!seen.has(core)) {
      seen.add(core);
      sections.push({ name: core, focus: "" });
    }
  }
  sections.sort((a, b) => REPORT_SECTIONS.indexOf(a.name) - REPORT_SECTIONS.indexOf(b.name));
  return {
    title: String(plan?.title ?? "").trim(),
    subtitle: String(plan?.subtitle ?? "").trim(),
    sections,
  };
}

/* ---------------------------------------------------- per-section schemas */

/**
 * The constrained grammar for ONE section, keyed by section name and depth.
 * References are entries (numbered source lines); the Acknowledgement is one
 * or two short paragraphs at any depth; every other section is paragraphs,
 * plus a table only at full depth. Brief depth caps paragraphs at a headline
 * plus three short sentences — short strings mean a visibly shorter report.
 */
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
            // 450 rather than 240: a hard 240 cap truncates a long sentence
            // mid-word, and the resulting pressure pushes the model into
            // garbage characters. 450 fits a complete sentence and still reads
            // visibly lighter than a full-depth paragraph (1500).
            items: { type: "string", minLength: 1, maxLength: 450 },
          }
        : {
            type: "array",
            minItems: 3,
            maxItems: 6,
            // Capped well under 2000: Ollama's decoding grammar silently dies at
            // maxLength 2000 on a string item — no error, just unconstrained
            // output the model fills with its preferred shape. 1999 works.
            items: { type: "string", minLength: 1, maxLength: 1500 },
          },
    },
  };

  if (!brief) {
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

/** Validate one section against its own depth-aware grammar, so a bad section
 *  is dropped from the report rather than poisoning it — the report analogue
 *  of generate.js's incremental deck validation. */
export function validateSection(name, depth, data) {
  const v = validatorFor(name, depth);
  const ok = v(data);
  if (ok) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: v.errors.map((e) => `${e.instancePath || "(root)"}: ${e.message}`),
  };
}

/* ------------------------------------------------------ input resolution */

/**
 * Everything the report generator draws on, resolved from the deck directory:
 * the brief and identity (meta.yaml), the approved outline (plan.yaml) and —
 * the point of shared research — the same notes the deck was written from
 * (research/notes.md). Missing plan or research is a hard error in the deck→
 * report direction: the report is only ever generated after the outline gate
 * and from the research pass. With `requirePlan: false` (standalone report —
 * no deck at all) the plan slot is left empty and the brief carries the title.
 */
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
  // The model sees a bounded excerpt; the full artefact stays on disk. The cap
  // tracks the author's transport — cloud gets the larger budget.
  research = excerptResearch(research, await researchExcerptCap({ model }));

  const identity = await loadIdentity(dir);
  return { meta, plan, research, identity };
}

/** Assemble the schema-validated report object from the plan and the written
 *  sections. Sections that produced no valid content are simply absent — the
 *  renderer skips them gracefully, never a bare heading. */
export function assembleReport(plan, sectionsData) {
  const content = {};
  for (const spec of plan.sections) {
    if (sectionsData[spec.name]) content[spec.name] = sectionsData[spec.name];
  }
  return {
    title: plan.title,
    ...(plan.subtitle ? { subtitle: plan.subtitle } : {}),
    content,
  };
}

/* -------------------------------------------------------------- model calls */

async function planReport({ brief, research, deckSections, identity, model, signal, chat }) {
  const subject = identity?.academic?.subject;
  // Like the deck planner, the report is sized to the team: one substantive
  // section per member, floored at the graded core (4) and capped at the
  // fixed eight. The schema's maxItems is tightened to the same number so a
  // small group cannot be handed a sprawling report.
  const maxSections = targetSections(identity, { min: 4 });
  const res = await chat({
    role: "author",
    model,
    signal,
    schema: reportPlanSchema({ maxSections }),
    messages: [
      {
        role: "system",
        content: [
          "You plan the structure of an academic report. The section order is FIXED and graded:",
          "",
          REPORT_SECTIONS.map((s, i) => `${i + 1}. ${s}`).join("\n"),
          "",
          `The team writing it has about ${maxSections} members, one substantive section each, so`,
          `choose about ${maxSections} sections to carry real content (never more than that). The`,
          "graded core — Abstract, Introduction, Conclusion, References — is always included.",
          "Give each chosen section a single specific focus sentence stating what that section",
          "must establish.",
          "The report must AGREE with the deck's approved outline below: the two artefacts are",
          "built from the same research and must not contradict each other.",
          "`name` must be one of the fixed section names above. Return {title, subtitle, sections}.",
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
  return sanitizeReportPlan(res.data ?? {});
}

const ACK_PROMPT =
  "You write the Acknowledgement of an academic report. A short, sincere paragraph " +
  "thanking the guide, the institution and the sources used. One or two paragraphs.";

async function writeSection({ spec, report, research, identity, depth, density, model, signal, chat }) {
  const subject = identity?.academic?.subject;

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
          research ? `\nRESEARCH NOTES\n${research}` : "",
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  return res.data;
}

/* ------------------------------------------------------------ orchestration */

/**
 * Generate decks/<slug>/report.yaml from the deck's research and approved
 * outline. Two model stages, both small grammars: a plan call fixes the
 * title and which fixed sections carry content, then one call per section
 * constrained to that section's own depth-aware schema — the same
 * decomposition that keeps the deck writer on-distribution.
 *
 * `dir` and `chat` are test seams (mirroring resolveDonor's injectable refDir):
 * dir overrides the deck directory, chat overrides the model client.
 */
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
}) {
  if (!REPORT_DEPTHS.includes(depth)) {
    throw new Error(`report depth must be one of ${REPORT_DEPTHS.join(", ")}, got "${depth}"`);
  }

  const deckDir = path.resolve(dir ?? path.join(DECKS, slug ?? ""));
  const { meta, plan, research, identity } = await resolveReportInputs(deckDir, { requirePlan, model });

  onProgress?.({ status: "report_planning" });
  const planned = await planReport({
    brief: meta.brief ?? plan.title ?? "",
    research,
    deckSections: plan.sections,
    identity,
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
      const data = await writeSection({ spec, report, research, identity, depth, density, model, signal, chat });
      const check = validateSection(spec.name, depth, data ?? {});
      if (!check.ok) {
        skipped.push({ section: spec.name, reason: check.errors.slice(0, 2).join("; ") });
        continue;
      }
      sectionsData[spec.name] = data;
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
    sections: Object.keys(assembled.content),
    skipped,
    depth,
  };
}
