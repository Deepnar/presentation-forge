import { chatJSON, authorTransport } from "./ollama.js";
import { buildOpsSchema, applyOps } from "./ops.js";
import { slideCatalog, catalogForType, deckSchema, familyFor, densityBudget, dataAffinityNote } from "./catalog.js";
import { validateDeck } from "../validate.js";
import { DIVIDER_TYPES, presentingNames, targetSections, distributePresenters } from "./team.js";
import { placeholderSlides } from "../placeholders.js";

/**
 * The synthesis-mode note: the writer prompt is written to survive small local
 * models — short conservative bullets, plain phrasing. When the author runs on
 * a cloud model (large context, strong prose) that ceiling is wrong, so the
 * full-strength variant demands genuinely sharper copy. Grounding still runs
 * afterwards either way: every figure must trace to the RESEARCH NOTES.
 */
export function synthesisNote(mode) {
  if (mode !== "full") return "";
  return [
    "",
    "You are writing at full strength — write like a strong writer, not a template:",
    "- Lead with a specific claim, then its evidence: a named mechanism, a dated",
    "  result, a real number from the RESEARCH NOTES. Never paraphrase a section",
    "  heading as a slide.",
    "- Bullets are complete statements (subject + claim + evidence), each with its",
    "  own substance — never three bullets saying the same thing.",
    "- Standfirsts and subtexts carry a real hook or a framing fact, not a",
    "  restatement of the headline.",
    "- Vary sentence structure. No filler openers ('This slide covers…', 'In",
    "  today's world'), no hedging, no template-y phrasing.",
    "- Where the notes carry a figure, date or name, say it. Grounding runs after",
    "  you: every number you write must appear in the RESEARCH NOTES.",
    "- Every field has a hard length cap from the schema — a slide whose field",
    "  overflows is rejected and replaced by a placeholder, so where a field is",
    "  tight (short labels, small nested bodies) a precise short phrase beats a",
    "  long one. Richer prose lives in the generous fields.",
  ].join("\n");
}

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
      // The budget counts CONTENT slides; title, the section dividers and the
      // closing slide are structural and sit on top. Without this headroom a
      // tight cap (11 members × 1-per-person, 11 max) squeezes the structure
      // out of the plan entirely — the observed defect was a deck with no
      // title and no break slides at all.
      maxItems: maxSlides + sectionCap + 2,
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
export async function planDeck({ brief, briefing = "", theme, identity, research = "", maxSlides = 24, slidesPerMember = null, model, signal }) {
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
  // The max-slides budget counts CONTENT slides; the title, section dividers
  // and the closing slide are structural and never count. When the briefing
  // fixes slides-per-member, the deck is sized to the team (N members × M each)
  // so the per-person promise is kept AND the cap cannot squeeze structure out.
  const contentCap = slidesPerMember && presenters.length
    ? Math.min(maxSlides, presenters.length * slidesPerMember)
    : maxSlides;
  const fullStrength = (await authorTransport({ model })) === "cloud";
  const teamNote = presenters.length
    ? `The team of ${presenters.length} presenting members (${presenters.join(", ")}) presents the deck together — one member per part, each member presenting only content slides, never the dividers.`
    : "Plan the deck as three to eight major parts.";
  // The sizing note states the CONTENT budget only when the user set one —
  // an explicit cap, or a per-member promise the deck must honour. Auto (24 is
  // the fallback, not an intent) plans by parts as before, and the loosened
  // schema bound above simply gives structure room without padding the deck.
  const sizingNote = slidesPerMember && presenters.length
    ? `- Size the talk to the team: about ${presenters.length * slidesPerMember} content slides, roughly ${slidesPerMember} per presenting member. The title, section dividers and closing slide are structural and do not count toward that number.`
    : maxSlides < 24
      ? `- Keep the deck to about ${contentCap} content slides; the title, section dividers and closing slide are extra and do not count toward the limit.`
      : "";

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
    "- The deck must be a complete talk, in presentation flow: it opens on the",
    "  title, then an INTRO beat that frames the topic, then the body sections",
    "  in a sensible order, and it CLOSES with a conclusion/closing that lands",
    "  the point. Always include the intro and the closing — do not leave the",
    "  talk to trail off at the last body section, whatever the brief says.",
    ...(fullStrength
      ? [
          "- On this path the `purpose` is the writer's brief at full strength: name the",
          "  specific claim the slide must land, including its key figure when the",
          "  research carries one — still one sentence, still under 180 characters.",
        ]
      : []),
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
    dataAffinityNote(research),
    voice.prefers?.length ? `- Favour: ${voice.prefers.join("; ")}.` : "",
    voice.density ? `- Density: ${voice.density}.` : "",
    sizingNote,
  ].filter(Boolean).join("\n");

  const res = await chatJSON({
    role: "author",
    model,
    signal,
    schema: outlineSchema({ maxSlides: contentCap, sectionCap }),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          research ? `RESEARCH NOTES\n${research}\n` : "",
          `BRIEF\n${brief}`,
          briefing ? `\n${briefing}` : "",
          identity?.academic?.subject ? `\nSubject: ${identity.academic.subject}` : "",
          `\n${teamNote}`,
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  const plan = res.data ?? {};
  // The type field is free-form in the outline schema on purpose — a tight enum
  // here made the model abandon planning to satisfy the grammar. Coerce after.
  let slides = (plan.slides ?? [])
    .map((s) => ({ ...s, type: types.includes(s.type) ? s.type : "bullets" }))
    .filter((s) => s.purpose);

  // The structure contract is enforced here, not asked: title opens, the
  // closing slide ends, and every content-bearing section opens with a divider.
  if (slides.length && slides[0].type !== "title") {
    slides.unshift({ type: "title", purpose: "Open the deck.", section: 0 });
  }
  slides = trimContentToBudget(slides, contentCap);
  slides = ensureStructuralSlides(slides, plan.sections ?? []);
  plan.slides = slides;

  return { plan, stats: { model: res.model, outputTokens: res.evalCount } };
}

/** A headline short enough to render: the purpose's first clause, ≤48 chars,
 *  cut at a word boundary. A hard slice ships clipped mid-word on the slide. */
function shortHeadline(purpose) {
  const clause = String(purpose ?? "").replace(/[.:;,!?][\s\S]*$/, "").trim();
  if (!clause) return "Covered in the full briefing.";
  if (clause.length <= 48) return clause;
  const cut = clause.slice(0, 48);
  const at = cut.lastIndexOf(" ");
  return (at > 20 ? cut.slice(0, at) : cut) + "…";
}

/**
 * The degraded-slide fallback written when a plan slide cannot be generated:
 * the deck must stay whole, and the plan's promised content count must hold.
 * A DIVIDER spec stays a divider (never degrading into a content slide, which
 * would inflate the per-member count); anything else becomes a short bullets
 * slide named by its purpose. Both shapes validate against deck.schema.json.
 */
export function placeholderFor(spec) {
  const purpose = String(spec.purpose ?? "").trim() || "Covered in the full briefing.";
  const headline = shortHeadline(spec.purpose);
  if (DIVIDER_TYPES.has(spec.type)) {
    return { ...spec, headline, quote: purpose.slice(0, 120) };
  }
  return {
    ...spec,
    type: "bullets",
    headline,
    // Four items meets the list-type content floor (minItems 4), so a
    // degraded slide is never the sparse two-liner that reads as content.
    bullets: [
      purpose.slice(0, 160),
      "Details in the full briefing.",
      "This slide's generation was cut short and was not re-attempted.",
      "Regenerate this slide to replace the placeholders above.",
    ],
  };
}

/**
 * The structure contract for a plan, applied after the model so a tight cap can
 * never squeeze it away: title opens, every content-bearing section opens with
 * a divider, the closing slide ends. All three are structural and live OUTSIDE
 * the content budget — the writer treats them as given and writes one slide per
 * entry, so a member's "content slide" promise is kept while the deck still
 * reads as a whole. A named-but-empty section gets no divider (that would just
 * be a blank page), and a section's opener is placed before its first content
 * slide so the deck reads title → divider → content in order.
 */
export function ensureStructuralSlides(slides, sections) {
  const out = [...slides];
  if (!out.length) return out;

  if (out[0].type !== "title") {
    out.unshift({ type: "title", purpose: "Open the deck.", section: 0 });
  }

  const used = new Set();
  for (const s of out) if (!DIVIDER_TYPES.has(s.type)) used.add(s.section ?? 0);

  for (const sec of [...used].sort((a, b) => a - b)) {
    const hasOpener = out.some(
      (s) => s.section === sec && DIVIDER_TYPES.has(s.type) && s.type !== "closing" && s.type !== "title",
    );
    if (hasOpener) continue;
    const first = out.findIndex((s) => s.section === sec && !DIVIDER_TYPES.has(s.type));
    const divider = {
      type: "section",
      purpose: sections[sec] ? `Open the part on ${sections[sec]}.` : `Open part ${sec + 1}.`,
      section: sec,
    };
    if (first === -1) out.push(divider);
    else out.splice(first, 0, divider);
  }

  if (!out.some((s) => s.type === "closing")) {
    const lastContent = [...out].reverse().find((s) => !DIVIDER_TYPES.has(s.type));
    out.push({ type: "closing", purpose: "Close the deck and thank the audience.", section: lastContent?.section ?? 0 });
  }
  return out;
}

/**
 * Keep the plan's CONTENT slides within the budget by dropping trailing content
 * slides. Structural slides (title, dividers, closing) are never counted or
 * dropped — they sit outside the budget by design. Trailing drops keep the
 * early parts whole, so the trimmed plan stays coherent for the outline gate;
 * with slides-per-member the budget is exact (11 members × 1 → 11 content
 * slides), which is what lets generation hand every member their own slide.
 */
export function trimContentToBudget(slides, contentCap) {
  if (!Number.isFinite(contentCap) || contentCap < 0) return slides;
  const out = [...slides];
  let content = out.filter((s) => !DIVIDER_TYPES.has(s.type)).length;
  for (let i = out.length - 1; i >= 0 && content > contentCap; i--) {
    if (DIVIDER_TYPES.has(out[i].type)) continue;
    out.splice(i, 1);
    content--;
  }
  return out;
}

/** Stage 2 — write one slide. Grammar is limited to this type's own fields. */
async function writeSlide({ spec, plan, deck, theme, research, model, signal }) {
  const catalog = await slideCatalog();
  const schema = await deckSchema();
  const isDivider = DIVIDER_TYPES.has(spec.type);
  // Presenters are assigned centrally by distributePresenters after generation —
  // the writer model is not asked to pick one, so a verbose model cannot
  // scatter assignments or hand a slide to someone twice. The field is removed
  // from the grammar for every type (dividers already never carried it).
  const buildOps = buildOpsSchema(schema, {
    slideCount: deck.slides.length,
    onlyTypes: [spec.type],
    excludeProps: ["presenter"],
  });

  const voice = theme?.voice ?? {};
  const fullStrength = (await authorTransport({ model })) === "cloud";
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
    dataAffinityNote(research),
    voice.headline_style ? `Headlines: ${voice.headline_style.trim()}` : "",
    voice.body_style ? `Body: ${voice.body_style.trim()}` : "",
    voice.avoid?.length ? `Avoid: ${voice.avoid.join("; ")}` : "",
    "",
    "Be specific and declarative. Every statistic, number or date must come from the",
    "RESEARCH NOTES below — quote figures verbatim, never approximate or invent one.",
    "If the notes carry no figure for this slide's point, state it qualitatively.",
    "NEVER invent an image path or URL — if this slide's type has an image field",
    "and no real image file exists for it, leave the field out entirely. If the slide",
    "REALLY needs an image, describe what it should show in the slide's `notes` field",
    "prefixed with `[image]` (e.g. \"[image] a diagram of the electrolysis cell\") — the",
    "app then shows an 'add image' prompt on that slide.",
    "No filler, no invented statistics, no rhetorical hedging.",
    "Do not repeat wording already used on an earlier slide.",
    synthesisNote(fullStrength ? "full" : "local"),
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
  brief, briefing = "", theme, identity, research = "", maxSlides = 24, model, signal, onProgress,
  plan: givenPlan, slidesPerMember = null,
}) {
  const schema = await deckSchema();
  const types = schema.definitions.slide.properties.type.enum;

  let plan = givenPlan ? await sanitizePlan(givenPlan, types) : null;
  let stats = {};

  if (!plan) {
    const planned = await planDeck({ brief, briefing, theme, identity, research, maxSlides, model, signal });
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

  let skipped = [];

  for (const [i, spec] of plan.slides.entries()) {
    onProgress?.({ phase: "writing", index: i, total: plan.slides.length, type: spec.type });
    // Retry once with the catalog re-stated explicitly before giving up — a
    // first failure is often the grammar drifting, and a second pass with the
    // contract spelled out recovers most of them. "Usable" means a NEW valid
    // slide actually appeared: a model that emits no append (or a mis-targeted
    // op) would otherwise filter to an empty op list, apply as a no-op, pass
    // validation and silently vanish — shrinking the exact content count the
    // plan promised and stranding the member who owned the slide. A thrown
    // model call is a failure of the same kind.
    let res;
    try {
      const before = deck.slides.length;
      const attempt = async () => {
        const ops = await writeSlide({ spec, plan, deck, theme, research, model, signal });
        const a = applyOps(deck, ops.filter((o) => o.op === "append_slide"));
        const grew = a.ok && a.deck.slides.length > before;
        if (!grew) return { a, ok: false, errors: a.ok ? ["no usable slide written"] : a.errors };
        const v = await validateDeck(a.deck);
        return { a, ok: v.ok, errors: v.errors ?? [] };
      };
      res = await attempt();
      if (!res.ok) res = await attempt();
    } catch (err) {
      res = { ok: false, errors: [err.message.slice(0, 120)] };
    }
    if (!res.ok) {
      // Write a minimal placeholder so the deck stays whole — a degraded slide
      // beats a missing one, and the purpose names the beat. A DIVIDER spec
      // must never degrade into a content slide — that would inflate the
      // content count the plan promised to the members.
      const placeholder = placeholderFor(spec);
      const pApplied = applyOps(deck, [{ op: "append_slide", slide: placeholder }]);
      if (pApplied.ok && (await validateDeck(pApplied.deck)).ok) {
        deck = pApplied.deck;
        skipped.push({ index: i, type: spec.type, reason: `${res.errors.slice(0, 2).join("; ")} — placeholder written` });
        continue;
      }
      skipped.push({ index: i, type: spec.type, reason: res.errors.slice(0, 2).join("; ") });
      continue;
    }
    deck = res.a.deck;
  }

  const { ok, errors } = await validateDeck(deck);
  onProgress?.({ phase: "done", slides: deck.slides.length, skipped: skipped.length });

  // One more regeneration pass over any placeholders that survived the write
  // loop: a placeholder may ship only if a dedicated retry also failed. The
  // loop already retries each slide twice; this third pass is the explicit
  // "do not ship a placeholder without one final attempt" boundary, and it
  // reports each slide it recovers.
  const recovered = [];
  for (const ph of placeholderSlides(deck)) {
    const spec = plan.slides[ph.index];
    if (!spec) continue;
    try {
      const before = deck.slides.length;
      const ops = await writeSlide({ spec, plan, deck, theme, research, model, signal });
      const a = applyOps(deck, [
        { op: "replace_slide", index: ph.index, slide: ops.find((o) => o.op === "append_slide")?.slide },
      ]);
      const rep = ops.find((o) => o.op === "append_slide")?.slide;
      if (!rep) continue;
      const candidate = structuredClone(deck);
      candidate.slides[ph.index] = rep;
      if ((await validateDeck(candidate)).ok) {
        deck = candidate;
        recovered.push(ph.index);
      }
    } catch { /* keep the placeholder — flagged below */ }
  }
  if (recovered.length) {
    skipped = skipped.filter((s) => !recovered.includes(s.index));
  }

  // Flag placeholders into the problems list: a degraded slide must be
  // impossible to miss, and the UI badge + render gate both read this.
  const placeholderProblems = placeholderSlides(deck).map(
    (s) => `slide ${s.index + 1} (${s.type}) is a PLACEHOLDER — its generation failed and it must be regenerated before this deck is presented`,
  );

  // Presenters are decided here, deterministically, not by the writer model:
  // whole sections go to presenting members in order, so every member's slides
  // are one contiguous block and no one is doubled up while another sits idle.
  // Dividers carry no presenter; any stray field the model slipped onto one is
  // stripped first so the distribution cannot assign into a divider.
  for (const s of deck.slides) {
    if (DIVIDER_TYPES.has(s.type)) delete s.presenter;
  }
  const presenters = presentingNames(identity);
  const assignment = distributePresenters(deck.slides, presenters, { slidesPerMember });
  for (let i = 0; i < deck.slides.length; i++) {
    if (assignment[i]) deck.slides[i].presenter = assignment[i];
  }

  return { ok, deck, plan, skipped, errors, stats, problems: placeholderProblems };
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
    const fullStrength = (await authorTransport({ model })) === "cloud";

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
      synthesisNote(fullStrength ? "full" : "local"),
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
    // Same invented-image guard as the type swap: an external image URL renders
    // as a placeholder, so never let a sweep ship one silently.
    const sweptImage = applied.deck.slides[i].image;
    if (sweptImage && /^[a-z][a-z0-9+.-]*:\/\//i.test(sweptImage)) {
      const s = applied.deck.slides[i];
      delete s.image;
      const hint = `[image] ${sweptImage}`;
      s.notes = s.notes ? `${s.notes}\n${hint}` : hint;
    }
    out = applied.deck;
    swept.push({ index: i, type: slide.type });
  }

  return { deck: out, problems, swept };
}

/**
 * A content-compatible type map for the type swap: when the target type can
 * carry the current slide's content unchanged in shape, remap instead of asking
 * the model. bullets → any list type keeps `bullets`; cards → feature-grid
 * keeps card bodies. Returns a slide with the same content under the new type
 * when the mapping is lossless, else null (meaning: the model rewrites).
 */
const COMPATIBLE_TYPES = {
  bullets: ["numbered-list", "checklist", "icon-list", "stacked-list"],
  "numbered-list": ["bullets", "checklist", "icon-list", "stacked-list"],
  checklist: ["bullets", "numbered-list", "icon-list", "stacked-list"],
  "feature-grid": ["cards", "grid-items"],
  cards: ["feature-grid", "grid-items"],
  "grid-items": ["feature-grid", "cards"],
  "icon-list": ["bullets", "numbered-list", "checklist", "stacked-list"],
  "stacked-list": ["bullets", "numbered-list", "checklist", "icon-list"],
};

export function compatibleRemap(slide, targetType) {
  const from = COMPATIBLE_TYPES[slide.type];
  if (!from || !from.includes(targetType)) return null;

  const out = { ...slide, type: targetType };
  const src = slide.bullets ?? slide.items ?? slide.rows ?? [];

  // List-ish targets all take an `items` array but with different item shapes:
  // numbered-list takes plain strings, checklist/icon-list take {text},
  // stacked-list takes {title, body, tag}.
  if (targetType === "numbered-list") {
    out.items = src.map((s) => (typeof s === "string" ? s : s.text ?? s.title ?? s.detail ?? ""));
    delete out.bullets; delete out.rows;
  } else if (targetType === "checklist" || targetType === "icon-list") {
    out.items = src.map((s) => ({ text: typeof s === "string" ? s : s.text ?? s.title ?? s.detail ?? "", ...(targetType === "icon-list" ? { icon: "" } : {}) }));
    delete out.bullets; delete out.rows;
  } else if (targetType === "stacked-list") {
    out.items = src.map((s) => {
      const t = typeof s === "string" ? s : s.title ?? s.text ?? "";
      const b = typeof s === "string" ? "" : s.detail ?? s.body ?? "";
      return { title: t.slice(0, 30), ...(b ? { body: b.slice(0, 120) } : {}) };
    });
    delete out.bullets; delete out.rows;
  } else if (targetType === "feature-grid") {
    out.items = (slide.cards ?? slide.items ?? []).map((c) => ({
      title: (c.title ?? c.headline ?? "").slice(0, 60),
      body: (c.body ?? c.text ?? "").slice(0, 220),
    }));
    delete out.cards;
  } else if (targetType === "grid-items") {
    out.items = (slide.cards ?? slide.items ?? []).map((c, i) => ({
      label: (c.title ?? c.headline ?? `Item ${i + 1}`).slice(0, 20),
      value: (c.body ?? c.text ?? "").slice(0, 60),
    }));
    delete out.cards;
  }

  delete out.image;
  return out;
}

/**
 * The type-swap conversion: change ONE slide to a new type, preserving its
 * section and presenter. When the content maps cleanly (bullets → numbered
 * list, cards → feature grid), the slide is remapped locally and no model runs.
 * Otherwise a scoped model call rewrites the slide's content for the target
 * type, grounded in the deck's research like the density sweep. Returns the
 * converted slide (validated) or null.
 */
export async function convertSlide({
  deck, index, targetType, theme, research = "", model, signal, chat = chatJSON,
}) {
  const slide = deck.slides[index];
  if (!slide) throw new Error(`no slide at index ${index}`);

  const remapped = compatibleRemap(slide, targetType);
  if (remapped) {
    // Validate the remap: if it happens to satisfy the schema, ship it.
    const { ok } = await validateDeck({ ...deck, slides: deck.slides.map((s, i) => (i === index ? remapped : s)) });
    if (ok) return { slide: remapped, method: "remap" };
    // fall through to the model — a lossless-looking map can still need a field.
  }

  const schema = await deckSchema();
  const typeCatalog = await catalogForType(targetType);
  const buildOps = buildOpsSchema(schema, { slideCount: deck.slides.length, onlyTypes: [targetType] });
  const isDivider = DIVIDER_TYPES.has(targetType);
  const voice = theme?.voice ?? {};
  const fullStrength = (await authorTransport({ model })) === "cloud";
  const current = Object.entries(slide)
    .map(([k, v]) => (k === "notes" ? null : `${k}: ${Array.isArray(v) ? v.join(" | ") : v}`))
    .filter(Boolean)
    .join("\n");

  const system = [
    `You convert ONE slide of a presentation to type "${targetType}".`,
    "Rewrite its content to fit the new type naturally — reuse the ideas and facts",
    "already on the slide, at the same density. Layout, colour and font are not yours.",
    isDivider
      ? "This is a divider slide: it announces structure. Keep it minimal, no presenter."
      : `Keep the presenter exactly as it was (${slide.presenter ?? "none"}), and keep the section.`,
    "",
    "Emit exactly one replace_slide op at the slide's index with type \"" + targetType + "\".",
    "Every statistic must come from the RESEARCH NOTES below — never invent one.",
    typeCatalog,
    "",
    voice.body_style ? `Body: ${voice.body_style.trim()}` : "",
    voice.avoid?.length ? `Avoid: ${voice.avoid.join("; ")}` : "",
    synthesisNote(fullStrength ? "full" : "local"),
  ].filter(Boolean).join("\n");

  const res = await chat({
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
          `CURRENT SLIDE [index ${index}]\n${current}`,
          `\nConvert this slide to type ${targetType}.`,
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  const ops = (res.data?.ops ?? []).filter((o) => o.op === "replace_slide" && o.index === index);
  if (!ops.length) return { slide: null, method: "model", errors: ["no usable op"] };

  const applied = applyOps(deck, ops);
  const candidate = applied.ok ? applied.deck.slides[index] : null;
  if (!candidate) return { slide: null, method: "model", errors: applied.errors };

  // Preserve section + presenter contract unless it's a divider.
  if (isDivider) delete candidate.presenter;
  else candidate.presenter = slide.presenter;
  candidate.section = slide.section;

  // A model will still try to invent an image (a real unsplash URL, an
  // example.com stub). Never ship it silently: an external URL resolves to null
  // and renders a placeholder anyway, so strip it and record what the slide
  // WANTS as an [image] note the UI turns into an "add image" prompt.
  const imageField = candidate.image;
  if (imageField && /^[a-z][a-z0-9+.-]*:\/\//i.test(imageField)) {
    delete candidate.image;
    const hint = `[image] ${imageField}`;
    candidate.notes = candidate.notes ? `${candidate.notes}\n${hint}` : hint;
  }

  // Validate against a deck that carries the SANITISED candidate — a model that
  // invented a URL may have left a type whose required image field is now gone,
  // in which case the conversion failed cleanly rather than shipping a stub.
  const withSanitized = { ...applied.deck, slides: applied.deck.slides.map((s, i) => (i === index ? candidate : s)) };
  const { ok } = await validateDeck(withSanitized);
  return ok
    ? { slide: candidate, method: "model" }
    : { slide: null, method: "model", errors: [] };
}
