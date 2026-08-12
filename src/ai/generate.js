import { chatJSON } from "./ollama.js";
import { buildOpsSchema, applyOps } from "./ops.js";
import { slideCatalog, deckSchema } from "./catalog.js";
import { validateDeck } from "../validate.js";
import { DIVIDER_TYPES, presentingNames } from "./team.js";

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
const outlineSchema = ({ maxSlides = 24 } = {}) => ({
  type: "object",
  required: ["title", "sections", "slides"],
  properties: {
    title: { type: "string", maxLength: 90 },
    subtitle: { type: "string", maxLength: 140 },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 8,
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
    "- `purpose` states what that slide must convey — specific, one sentence.",
    "  It is a brief for the writer, not slide text.",
    "- Vary the types across families. A deck of nothing but `bullets` is a failure.",
    "- Think in terms of what each beat needs: a number → data family, a process →",
    "  flow family, a comparison → comparison family, a definition → definition",
    "  type, a key moment → callout family, a stage in time → timeline family.",
    "- `freeform` renders the whole slide from the writer's HTML — use it sparingly",
    "  for a hero moment, never for a whole deck of text.",
    voice.prefers?.length ? `- Favour: ${voice.prefers.join("; ")}.` : "",
    voice.density ? `- Density: ${voice.density}.` : "",
  ].filter(Boolean).join("\n");

  const res = await chatJSON({
    role: "author",
    model,
    signal,
    schema: outlineSchema({ maxSlides }),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          research ? `RESEARCH NOTES\n${research}\n` : "",
          `BRIEF\n${brief}`,
          identity?.academic?.subject ? `\nSubject: ${identity.academic.subject}` : "",
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
