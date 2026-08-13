import { chatJSON } from "./ollama.js";
import { buildOpsSchema, applyOps } from "./ops.js";
import { slideCatalog, catalogForType, deckSchema, familyFor, densityBudget } from "./catalog.js";
import { validateDeck } from "../validate.js";
import { DIVIDER_TYPES, presentingNames, targetSections } from "./team.js";

/**
 * Two-stage deck generation: plan the whole deck, then write one slide per call.
 *
 * The single-call approach — one large ops list against a schema unioning every
 * slide field — fails in a specific and instructive way. Constrained decoding
 * masks any token that would violate the grammar, so a large grammar means the
 * model's preferred token is rejected often; enough rejections and it walks off
 * distribution into repetition loops and confabulated content. Observed as
 * `_er_er_er…`, then infinitely nested `patch_details`, then a deck titled
 * ".NET Core 6.0 release notes".
 *
 * Decomposition fixes the cause rather than the symptom. The outline schema has
 * three keys; each fill call is constrained to exactly one slide type, so the
 * grammar stays small and masking stays rare. It also removes the truncation
 * failure — a per-slide call cannot stop early and lose slides 3 through 6.
 */

/**
 * Every collection here is bounded, and every string has a maxLength.
 *
 * An unbounded array in a constrained-decoding schema is a runaway: the grammar
 * never *requires* a closing bracket, so the model can keep appending elements
 * until it hits the token ceiling. Observed as an outline that ran to 8192
 * tokens (done_reason=length) for a six-slide deck. Bounds give the grammar a
 * legal way to stop.
 */
const outlineSchema = ({ maxSlides = 24, sectionCap = 8 } = {}) => ({
  type: "object",
  required: ["title", "sections", "slides"],
  properties: {
    title: { type: "string", maxLength: 90 },
    subtitle: { type: "string", maxLength: 140 },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: sectionCap,
      items: { type: "string", maxLength: 40 },
    },
    slides: {
      type: "array",
      minItems: 3,
      maxItems: maxSlides,
      items: {
        type: "object",
        required: ["type", "purpose"],
        properties: {
          type: { type: "string", maxLength: 16 },
          section: { type: "integer", minimum: 0, maximum: 7 },
          purpose: {
            type: "string",
            maxLength: 180,
            description: "What this slide must convey. One specific sentence.",
          },
        },
      },
    },
  },
});

/** Stage 1 — the plan. Cheap, reviewable, and the human gate's input. */
export async function planDeck({ brief, theme, identity, research = "", maxSlides = 24, model, signal }) {
  const catalog = await slideCatalog();
  const schema = await deckSchema();
  const types = schema.definitions.slide.properties.type.enum;

  const voice = theme?.voice ?? {};
  // The talk is sized to the team: one meaningful part per presenting member,
  // never fewer than three, never more than the renderer's eight-section
  // ceiling. The schema's sections cap is tightened to the same number so the
  // model cannot casually draft more parts than there are people.
  const sectionCap = targetSections(identity);
  const presenters = presentingNames(identity);
  const teamNote = presenters.length
    ? `The team of ${presenters.length} presenting members (${presenters.join(", ")}) presents the deck together — one member per part, each member presenting only content slides, never the dividers.`
    : "Plan the deck as three to eight major parts.";

  const system = [
    "You plan presentation decks. You do not write slide content yet.",
    "",
    `Available slide types: ${types.join(", ")}.`,
    "",
    catalog,
    "",
    "Rules:",
    "- The first slide is always type `title`.",
    "- Use `section` dividers to open each major part.",
    "- Every slide's `section` is a 0-based index into your `sections` array.",
    "- `purpose` states what that slide must convey — ONE short sentence, under",
    "  ~140 characters. It is a private brief for the writer, never slide text,",
    "  so it must stay brief even if the deck is large.",
    "- `sections` labels are short — two to four words each.",
    "- Vary the types across families. A deck of nothing but `bullets` is a failure.",
    "- Think in terms of what each beat needs: a number → data family, a process →",
    "  flow family, a comparison → comparison family, a definition → definition",
    "  type, a key moment → callout family, a stage in time → timeline family.",
    "- `freeform` renders the whole slide from the writer's HTML — use it sparingly",
    "  for a hero moment, never for a whole deck of text.",
    "- Avoid image-requiring types (`image`, `image-text`, `image-grid`, `hero-image`,",
    "  `split-screen`, `side-by-side`) unless the brief actually names image files —",
    "  the writer has no image to draw from and must not invent one.",
    `- Structure the talk as about ${sectionCap} major parts, each member taking one.`,
    voice.prefers?.length ? `- Favour: ${voice.prefers.join("; ")}.` : "",
    voice.density ? `- Density: ${voice.density}.` : "",
  ].filter(Boolean).join("\n");

  const res = await chatJSON({
    role: "author",
    model,
    signal,
    schema: outlineSchema({ maxSlides, sectionCap }),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          research ? `RESEARCH NOTES\n${research}\n` : "",
          `BRIEF\n${brief}`,
          identity?.academic?.subject ? `\nSubject: ${identity.academic.subject}` : "",
          `\n${teamNote}`,
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  const plan = res.data ?? {};
  // The type field is free-form in the outline schema on purpose — a tight enum
  // here made the model abandon planning to satisfy the grammar. Coerce after.
  plan.slides = (plan.slides ?? [])
    .map((s) => ({ ...s, type: types.includes(s.type) ? s.type : "bullets" }))
    .filter((s) => s.purpose);

  if (plan.slides.length && plan.slides[0].type !== "title") {
    plan.slides.unshift({ type: "title", purpose: "Open the deck.", section: 0 });
  }

  return { plan, stats: { model: res.model, outputTokens: res.evalCount } };
}

/** Stage 2 — write one slide. Grammar is limited to this type's own fields. */
async function writeSlide({ spec, plan, deck, theme, research, model, signal, presenters }) {
  const catalog = await slideCatalog();
  const schema = await deckSchema();
  const isDivider = DIVIDER_TYPES.has(spec.type);
  // A divider is structure, not a member's slide — the presenter field is
  // removed from its grammar so the model cannot assign one. Content slides
  // keep it, and the prompt hands the model the real presenting members so the
  // assignment stays grounded in the actual team rather than invented roles.
  const presenterClause = isDivider
    ? [
        `This slide is a ${spec.type} divider — it announces structure, not content. ` +
          "It is owned by NO single member, so you must not set a `presenter` field.",
      ]
    : presenters?.length
      ? [
          "Assign this content slide's `presenter` field to exactly one of these team members,",
          `picking the next one in the presenting order: ${presenters.join(", ")}. ` +
            "Distribute the deck's content slides evenly across them so each member presents",
          "roughly the same number of slides. Never invent a name outside this list.",
        ]
      : [];
  const buildOps = buildOpsSchema(schema, {
    slideCount: deck.slides.length,
    onlyTypes: [spec.type],
    ...(isDivider ? { excludeProps: ["presenter"] } : {}),
  });

  const voice = theme?.voice ?? {};
  const already = deck.slides
    .map((s, i) => `[${i}] ${s.type}: ${s.headline ?? s.quote ?? "—"}`)
    .join("\n") || "(none yet)";

  // Freeform is the one deliberate exception to the no-layout rule: the model
  // writes the whole slide as HTML, rasterised by headless Chrome. Everything
  // else stays declarative content over the theme.
  const isFreeform = spec.type === "freeform";

  const system = [
    "You write the content of ONE presentation slide.",
    "",
    ...(isFreeform
      ? [
          "This slide is FREEFORM: you write the ENTIRE slide as HTML/CSS in the `html` field. " +
          "Layout, colour and typography are yours here — this is the one exception to the no-layout rule.",
          "The page is 1280x720 (16:9), full-bleed. Write one self-contained slide:",
          "- Inline CSS only, in a <style> tag or style attributes.",
          "- NO <script> tags, no event handlers, no <iframe>, no <link>, no external images or fonts — " +
            "the renderer's sandbox blocks scripts and every network request.",
          "- Text must be real HTML text (it is rasterised, not editable later). Use legible sizes: " +
            "a 44px+ headline, 18-24px body.",
          "- The institution's crest, footer and slide number are drawn on top after you render, " +
            "so keep important content out of the top-right corner and the bottom ~50px.",
          "- One strong hero moment: a headline, one treatment, minimal copy. Impact over density.",
        ]
      : ["Layout, colour, font and spacing are not yours — never mention them."]),
    `Emit exactly one append_slide operation with type "${spec.type}".`,
    "",
    catalog,
    "",
    voice.headline_style ? `Headlines: ${voice.headline_style.trim()}` : "",
    voice.body_style ? `Body: ${voice.body_style.trim()}` : "",
    voice.avoid?.length ? `Avoid: ${voice.avoid.join("; ")}` : "",
    "",
    ...presenterClause,
    "",
    "Be specific and declarative. Every statistic, number or date must come from the",
    "RESEARCH NOTES below — quote figures verbatim, never approximate or invent one.",
    "If the notes carry no figure for this slide's point, state it qualitatively.",
    "NEVER invent an image path or URL — if this slide's type has an image field",
    "and no real image file exists for it, leave the field out entirely.",
    "No filler, no invented statistics, no rhetorical hedging.",
    "Do not repeat wording already used on an earlier slide.",
  ].filter(Boolean).join("\n");

  const res = await chatJSON({
    role: "author",
    model,
    signal,
    schema: buildOps,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          `DECK: ${plan.title}`,
          plan.sections?.length ? `SECTIONS: ${plan.sections.map((s, i) => `${i}=${s}`).join(", ")}` : "",
          research ? `\nRESEARCH NOTES\n${research}\n` : "",
          `SLIDES SO FAR\n${already}`,
          `\nWRITE THIS SLIDE`,
          `type: ${spec.type}`,
          spec.section != null ? `section: ${spec.section}` : "",
          `purpose: ${spec.purpose}`,
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  return res.data?.ops ?? [];
}

/**
 * Coerce a plan into the shape the writer loop needs. Types are free-form in
 * the outline schema on purpose — a tight enum made the model abandon planning
 * to satisfy the grammar — so both the planning output and a human-edited plan
 * from the outline review pass through here.
 */
async function sanitizePlan(plan, types) {
  const slides = (plan.slides ?? [])
    .filter((s) => s?.purpose)
    .map((s) => ({
      type: types.includes(s.type) ? s.type : "bullets",
      section: Number.isInteger(s.section) ? s.section : 0,
      purpose: s.purpose,
    }));
  if (slides.length && slides[0].type !== "title") {
    slides.unshift({ type: "title", purpose: "Open the deck.", section: 0 });
  }
  return { ...plan, slides };
}

/**
 * Full generation. Returns a validated deck plus a per-slide report, so a slide
 * the model could not write degrades that slide rather than failing the deck.
 *
 * `plan` is the human-approved outline; when given, planning is skipped and the
 * plan is written against directly. Without it, planning runs first and its
 * output is the plan — the same path a headless run uses.
 */
export async function generateDeck({
  brief, theme, identity, research = "", maxSlides = 24, model, signal, onProgress, plan: givenPlan,
}) {
  const schema = await deckSchema();
  const types = schema.definitions.slide.properties.type.enum;

  let plan = givenPlan ? await sanitizePlan(givenPlan, types) : null;
  let stats = {};

  if (!plan) {
    const planned = await planDeck({ brief, theme, identity, research, maxSlides, model, signal });
    plan = await sanitizePlan(planned.plan, types);
    stats = planned.stats;
  }

  if (!plan.slides?.length) {
    return { ok: false, errors: ["The model produced no outline."], plan, deck: null };
  }
  onProgress?.({ phase: "planned", slides: plan.slides.length, plan });

  let deck = {
    title: plan.title || brief.slice(0, 80),
    ...(plan.subtitle ? { subtitle: plan.subtitle } : {}),
    ...(theme?.name ? { theme: theme.name } : {}),
    sections: plan.sections ?? [],
    slides: [],
  };

  const skipped = [];
  const presenters = presentingNames(identity);

  for (const [i, spec] of plan.slides.entries()) {
    onProgress?.({ phase: "writing", index: i, total: plan.slides.length, type: spec.type });
    try {
      // Retry once with the catalog re-stated explicitly before giving up — a
      // first failure is often the grammar drifting, and a second pass with the
      // contract spelled out recovers most of them.
      let ops = await writeSlide({ spec, plan, deck, theme, research, model, signal, presenters });
      let applied = applyOps(deck, ops.filter((o) => o.op === "append_slide"));
      if (!applied.ok || !(await validateDeck(applied.deck)).ok) {
        ops = await writeSlide({ spec, plan, deck, theme, research, model, signal, presenters });
        applied = applyOps(deck, ops.filter((o) => o.op === "append_slide"));
      }
      if (!applied.ok) {
        skipped.push({ index: i, type: spec.type, reason: applied.errors.join("; ") });
        continue;
      }
      // Validate incrementally so one bad slide is dropped rather than
      // poisoning the deck and failing everything at the end.
      const { ok, errors } = await validateDeck(applied.deck);
      if (!ok) {
        // Second failure: write a minimal placeholder so the deck stays whole —
        // a degraded slide beats a missing one, and the purpose names the beat.
        const placeholder = { ...spec, type: "bullets", headline: spec.purpose.slice(0, 60), bullets: [spec.purpose] };
        const pApplied = applyOps(deck, [{ op: "append_slide", slide: placeholder }]);
        if (pApplied.ok && (await validateDeck(pApplied.deck)).ok) {
          deck = pApplied.deck;
          skipped.push({ index: i, type: spec.type, reason: `${errors.slice(0, 2).join("; ")} — placeholder written` });
          continue;
        }
        skipped.push({ index: i, type: spec.type, reason: errors.slice(0, 2).join("; ") });
        continue;
      }
      deck = applied.deck;
    } catch (err) {
      skipped.push({ index: i, type: spec.type, reason: err.message.slice(0, 120) });
    }
  }

  const { ok, errors } = await validateDeck(deck);
  onProgress?.({ phase: "done", slides: deck.slides.length, skipped: skipped.length });

  // Belt and braces behind the grammar: whatever the model tried to slip onto a
  // divider, dividers carry no presenter. This runs before validation so a
  // stray field can never ship.
  for (const s of deck.slides) {
    if (DIVIDER_TYPES.has(s.type)) delete s.presenter;
  }

  return { ok, deck, plan, skipped, errors, stats };
}

/**
 * The content-density sweep: rewrite a deck's CONTENT at a chosen density
 * while keeping its structure exactly — same plan, sections, slide types,
 * presenters and order. Only the content fields (bullets, bodies, cards,
 * stat labels) are regenerated, at the per-family budget for the target
 * density. Dividers (title/section/chapter/closing/epigraph) carry no body
 * content and are preserved untouched.
 *
 * This is the deck-level "make it denser / lighter" the user asked for as an
 * explicit control — the opposite of a chat turn, which edits one thing. It
 * runs one scoped call per content slide so each still gets a small grammar,
 * and grounding still applies afterwards: density must come from the research,
 * never from invention.
 */
export async function sweepDeck({
  deck, density = "balanced", theme, research = "", model, signal, onProgress, chat = chatJSON,
}) {
  if (!["sparse", "balanced", "dense"].includes(density)) {
    throw new Error(`density must be one of sparse|balanced|dense, got "${density}"`);
  }
  const schema = await deckSchema();
  const voice = theme?.voice ?? {};
  let out = structuredClone(deck);
  const problems = [];
  const swept = [];

  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i];
    if (DIVIDER_TYPES.has(slide.type)) continue; // dividers carry no body content

    onProgress?.({ status: "sweeping", index: i, total: deck.slides.length, type: slide.type });
    const budget = densityBudget(density, slide.type, familyFor(slide.type));
    const buildOps = buildOpsSchema(schema, { slideCount: deck.slides.length, onlyTypes: [slide.type] });
    // One type's contract, not the whole 75-type catalogue — the slide type is
    // fixed by the sweep, so the model only needs that type's fields.
    const typeCatalog = await catalogForType(slide.type);

    const current = Object.entries(slide)
      .map(([k, v]) => {
        if (k === "notes" || k === "presenter") return null;
        const val = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" | ") : String(v ?? "");
        return val ? `  ${k}: ${val}` : null;
      })
      .filter(Boolean)
      .join("\n");

    const system = [
      "You rewrite the CONTENT of ONE existing slide of a presentation, keeping its type,",
      "presenter and meaning exactly. Layout, colour and font are not yours.",
      `The slide type is "${slide.type}" and it stays "${slide.type}". The presenter stays the same.`,
      "",
      `TARGET DENSITY: ${density}. Content budget for this slide: ${budget}.`,
      density === "sparse"
        ? "You are making the slide LIGHTER: fewer items, shorter phrasing. Trim, do not pad."
        : density === "dense"
          ? "You are making the slide DENSER: more items, fuller sentences. Add real substance."
          : "You are balancing the slide: a normal number of items, each a complete point.",
      "",
      "Emit exactly one update_slide op patching ONLY the content fields — the headline",
      "may be refined, but the type, presenter and section must not change. Do not invent",
      "statistics: every figure must come from the RESEARCH NOTES below, quoted verbatim.",
      typeCatalog,
      "",
      voice.body_style ? `Body: ${voice.body_style.trim()}` : "",
      voice.avoid?.length ? `Avoid: ${voice.avoid.join("; ")}` : "",
    ].filter(Boolean).join("\n");

    let res;
    try {
      res = await chat({
        role: "author",
        model,
        signal,
        schema: buildOps,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              research ? `RESEARCH NOTES\n${research}\n` : "",
              `CURRENT SLIDE [index ${i}]\n${current}`,
              `\nRewrite this slide's content at ${density} density.`,
            ].filter(Boolean).join("\n"),
          },
        ],
      });
    } catch (err) {
      problems.push(`slide ${i + 1} (${slide.type}): ${err.message.slice(0, 120)} — kept original`);
      swept.push({ index: i, type: slide.type, kept: true });
      continue;
    }

    const ops = (res.data?.ops ?? []).filter((o) => o.op === "update_slide" && o.index === i);
    if (!ops.length) {
      problems.push(`slide ${i + 1} (${slide.type}): no usable rewrite — kept original`);
      swept.push({ index: i, type: slide.type, kept: true });
      continue;
    }
    const applied = applyOps(out, ops);
    if (!applied.ok || !(await validateDeck(applied.deck)).ok) {
      problems.push(`slide ${i + 1} (${slide.type}): density rewrite failed — kept original`);
      swept.push({ index: i, type: slide.type, kept: true });
      continue;
    }
    // The grammar allows a patch to change anything; the sweep contract is that
    // type and presenter survive. Re-assert them so a verbose model cannot turn
    // a sweep into a redesign.
    applied.deck.slides[i] = { ...applied.deck.slides[i], type: slide.type, presenter: slide.presenter };
    out = applied.deck;
    swept.push({ index: i, type: slide.type });
  }

  return { deck: out, problems, swept };
}
