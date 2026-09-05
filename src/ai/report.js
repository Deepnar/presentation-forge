import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON, researchExcerptCap } from "./ollama.js";
import { loadIdentity } from "./identity.js";
import { excerptResearch } from "./research.js";
import { REPORT_SECTIONS, IMAGE_CREDITS, reportStructureForDeck, validateReport } from "../report.js";

/**
 * The report content generator — the deck pipeline's writer for the report
 * side of the submission workflow.
 *
 * One brief → one research pass → both deck.yaml and report.yaml from the same
 * decks/<slug>/research/ artefact. This module is to the deck's generate.js
 * what src/report.js is to the deck's render.js.
 *
 * The report's structure is the donor template's, read from the donor itself
 * (`reportStructureForDeck`) and falling back to the graded eight. So there is
 * a little structure to plan — which of the template's sections carry content,
 * and the few a particular topic earns for itself — and then the depth of each
 * section's prose.
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

/**
 * How many sections a report may invent for itself, on top of the structure
 * its template declares.
 *
 * Bounded rather than free: the structure is what the report is graded on, and
 * a writer that can add sections at will drifts into an essay with headings.
 * Three is enough for the case study, the methodology or the comparison a
 * particular topic genuinely earns, and few enough that the graded shape still
 * reads as the graded shape.
 */
export const MAX_CUSTOM_SECTIONS = 3;

/** The sections a report is not allowed to come out without, where its
 *  structure has them. A donor that declares none of these is trusted on its
 *  own terms — it is the institution's own contract, not a guess. */
const GUARANTEED = ["Abstract", "Introduction", "Conclusion", "References"];

/** The report's plan: title plus which sections carry content and what each
 *  must say. Small grammar, and `name` is coerced after (the same reason the
 *  deck outline leaves `type` free). */
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
          // 60, matching the content contract's own propertyNames bound. 30
          // was enough to spell the eight fixed names and nothing else: a
          // topic-specific section is named for its topic, and "Vehicle-to-Grid
          // Economic Modelling" is 34 characters. A cap that cannot spell the
          // answer reads as the model declining to give it.
          name: { type: "string", maxLength: 60 },
          focus: { type: "string", maxLength: 160 },
        },
      },
    },
  },
});

/**
 * Coerce the planner's output onto the report's structure: a name that matches
 * the structure is snapped to its canonical spelling and its graded position,
 * duplicates are removed, and the guaranteed sections are forced in. Same role
 * as sanitizePlan in generate.js — both a model's output and any future human
 * edit pass through here.
 *
 * A name the structure does NOT have used to be dropped, which made a
 * topic-specific section unrepresentable however well it was argued for. It is
 * now kept, up to `maxCustom`, and this is where its POSITION is decided —
 * the one thing that cannot be recovered later, because sorting by structure
 * index says nothing about where a section that has no index belongs.
 *
 * A custom section is anchored to the last structural section the model listed
 * before it, so "…Application, Grid Case Study, Future Scope…" keeps the
 * writer's intended placement. The anchor is then clamped away from the final
 * structural position: a report whose References are not last is a report that
 * fails its own format, and a model that lists a case study after them should
 * not be able to cause that.
 */
export function sanitizeReportPlan(plan, { structure = REPORT_SECTIONS, maxCustom = MAX_CUSTOM_SECTIONS } = {}) {
  const index = new Map(structure.map((n, i) => [n.toLowerCase(), i]));
  const seen = new Set();
  const entries = [];
  // Sort key: [anchor, custom?, order seen]. The third element keeps two
  // custom sections sharing an anchor in the order the model wrote them.
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
    // "Image Credits" is the renderer's own appendix, built from the picture
    // record rather than written; a section claiming that name would be
    // overwritten by it at render time.
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

/* ---------------------------------------------------- per-section schemas */

/**
 * The constrained grammar for ONE section, keyed by section name and depth.
 * References are entries (numbered source lines); the Acknowledgement is one
 * or two short paragraphs at any depth; every other section is paragraphs,
 * plus a table only at full depth. Brief depth caps paragraphs at a headline
 * plus three short sentences — short strings mean a visibly shorter report.
 */
/** Sections that are prose by definition and never carry a table. */
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

  // An abstract is a prose summary of the whole report and a conclusion is its
  // closing argument; neither carries a data table in any academic format. The
  // grammar offered one on every section at full depth, so the writer put a
  // five-row table in the Abstract of a real generated report. A field the
  // schema offers is a field the model will fill.
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

/** Validate one section against its own depth-aware grammar, so a bad section
 *  is dropped from the report rather than poisoning it — the report analogue
 *  of generate.js's incremental deck validation. */
export function validateSection(name, depth, data) {
  // Strip before validating, never reject because of it. A prose-only section
  // is not offered a table by the grammar, but any path that bypasses the
  // grammar (a repaired turn, a differently-served model) can still attach
  // one — and with additionalProperties:false that would drop the ABSTRACT
  // rather than the table. Losing the section is much worse than losing the
  // field, so the unwanted field is removed and the section kept.
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

/**
 * A paragraph the writer emitted as DATA rather than as prose.
 *
 * The section schema asks for an array of strings and the model can satisfy it
 * with strings that are themselves JSON — the grammar only constrains the type
 * and the length, never whether the characters read as English. One generated
 * report's Theoretical Background reached the .docx as three paragraphs:
 * a serialised `{"text": ..., "source": ...}` object, the bare schema key
 * `paragraph_number_indexed_text`, and `]}`. Every one is a valid string of
 * legal length, so nothing upstream could reject them, and they were typeset
 * into a document meant for submission.
 *
 * Salvage the prose where there is any — the object above carried a real
 * sentence under `text` — and drop what is only syntax.
 */
export function salvageParagraph(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  if (/^[[{]/.test(text)) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Truncated JSON: the grammar cut it, and half an object is not prose.
      return null;
    }
    const prose = proseWithin(parsed);
    return prose && prose.trim() ? prose.trim() : null;
  }
  // A loose fragment of JSON syntax: "]}", "},", "]".
  if (/^[\][{}(),;:"'\s]+$/.test(text)) return null;
  // A leaked schema key: one snake_case token, no sentence anywhere in it.
  if (!/\s/.test(text) && /_/.test(text)) return null;
  return text;
}

/** The human sentence inside a decoded object, if it carries one. */
function proseWithin(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    const parts = node.map(proseWithin).filter(Boolean);
    return parts.length ? parts.join(" ") : null;
  }
  if (node && typeof node === "object") {
    // `text` is the key the writer keeps inventing when it wraps a paragraph.
    for (const key of ["text", "paragraph", "content", "body"]) {
      if (typeof node[key] === "string" && node[key].trim()) return node[key];
    }
  }
  return null;
}

/**
 * The link labels a scraped bibliography carries, and a citation never should.
 *
 * PubMed and PMC render every reference with "[DOI] [PubMed] [Google Scholar]"
 * beside it. That text lands in the research notes as part of the citation, and
 * the writer copies it into the reference list — where it is not part of the
 * work being cited. Worse, a run of identical bracketed tokens is exactly the
 * shape constrained decoding loops on: one generated reference ran to 600
 * characters, the real citation followed by "[Google Scholar] [PubMed]" twenty
 * times and a dangling bracket. Stripping the labels removes the artefact and
 * the loop together, because the loop is built out of them.
 */
const LINK_LABELS =
  /\s*\[(?:DOI|PubMed(?:\s+Central)?|PMC(?:\s+free\s+article)?|Google\s+Scholar|CrossRef|Free\s+full\s+text|Abstract|Article)\]/gi;

export function cleanReference(raw) {
  const text = String(raw ?? "")
    .replace(LINK_LABELS, "")
    // A trailing open bracket is where the grammar cut the next label.
    .replace(/\s*\[[^\]]*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text || null;
}

/** Drop the non-prose paragraphs from one section, keeping its other fields. */
function cleanSection(section, name = "") {
  if (!section || typeof section !== "object") return null;
  const out = { ...section };
  // The same rule on the write path: validateSection only returns a verdict,
  // so the strip has to happen where the stored object is built as well.
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

/** Assemble the schema-validated report object from the plan and the written
 *  sections. Sections that produced no valid content are simply absent — the
 *  renderer skips them gracefully, never a bare heading. */
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
    // Written down rather than implied: once a report may carry a section the
    // graded constant has never heard of, its order stops being recoverable
    // from the section names and becomes part of the artefact.
    order,
    content,
  };
}

/* -------------------------------------------------------------- model calls */

async function planReport({ brief, research, deckSections, identity, structure = REPORT_SECTIONS, model, signal, chat }) {
  const subject = identity?.academic?.subject;
  // The report is NOT sized to the team, and the deck planner's rule does not
  // transfer. A talk is divided between the people giving it; a report's
  // structure is set by the institution that grades it, and one author writing
  // up a large project owes the same sections as six.
  //
  // Binding the budget to team size made the substance unreachable. The cap was
  // the TOTAL section count with a floor of four, while the prompt also
  // requires the four-section graded core — so every team of four or fewer
  // spent its whole budget on the frame and Theoretical Background,
  // Application and Future Scope could not be planned at all. A solo author,
  // which is what `report-new` is by construction, could only ever produce
  // Abstract/Introduction/Conclusion/References. That shipped: one report on
  // disk has no body section.
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

  // "Do not repeat wording already used in another section" was in the system
  // prompt while the model was shown no other section: `report.content` was
  // empty for the whole write loop and only the title ever reached the
  // message. The instruction was unfollowable, and near-duplicate sections are
  // exactly what the reports came out with.
  //
  // Two things fix it, and both are cheap. The outline says what the OTHER
  // sections are for, so a writer knows what is not its job — this is the half
  // that helps the section written first, which no amount of history can
  // reach. The openings of what has been written say what has actually been
  // said, in the writer's own words rather than the planner's.
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
  structure = null,
}) {
  if (!REPORT_DEPTHS.includes(depth)) {
    throw new Error(`report depth must be one of ${REPORT_DEPTHS.join(", ")}, got "${depth}"`);
  }

  const deckDir = path.resolve(dir ?? path.join(DECKS, slug ?? ""));
  const { meta, plan, research, identity } = await resolveReportInputs(deckDir, { requirePlan, model });

  // The template that will be rendered onto decides what sections exist, so it
  // is read before anything is planned rather than discovered at render time.
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
      // The running report is what the next section is shown, so only prose
      // that actually passed its grammar becomes something to avoid repeating.
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
