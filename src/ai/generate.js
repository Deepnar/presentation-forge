import { chatJSON, authorTransport } from "./ollama.js";
import { buildOpsSchema, applyOps, slideFromOps } from "./ops.js";
import { selectResearch, slideQuery, CALL_RESEARCH_CHARS } from "./retrieve.js";
import { imageSeat } from "./images.js";
import { slideCatalog, catalogForType, deckSchema, familyFor, FAMILY_TYPES, densityBudget, dataAffinityNote, numericFactCount } from "./catalog.js";
import { validateDeck } from "../validate.js";
import { DIVIDER_TYPES, FRONT_MATTER_TYPES, presentingNames, targetSections, assignPresenters } from "./team.js";
import { placeholderSlides } from "../placeholders.js";

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

const outlineSchema = ({ maxSlides = 24, sectionCap = 8, minSlides = 3, typeMax = 24 } = {}) => ({
  type: "object",
  required: ["title", "sections", "slides"],
  properties: {
    title: { type: "string", maxLength: 52 },
    subtitle: { type: "string", maxLength: 140 },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: sectionCap,
      items: { type: "string", maxLength: 40 },
    },
    slides: {
      type: "array",
      minItems: Math.min(minSlides, maxSlides + sectionCap + 2),
      maxItems: maxSlides + sectionCap + 2,
      items: {
        type: "object",
        required: ["type", "purpose"],
        properties: {
          type: { type: "string", maxLength: typeMax },
          section: { type: "integer", minimum: 0, maximum: Math.max(0, sectionCap - 1) },
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

const SEATABLE_TYPES = new Set(["bullets", "numbered-list", "stacked-list", "icon-list"]);

const SHOWABLE = /\b(?:bus(?:es)?|vehicle|fleet|charger|charging|depot|station|plant|site|facility|equipment|hardware|device|panel|battery|batteries|cell|module|grid|installation|prototype|machine|sensor|robot|building|campus|laboratory|lab|field|factory|assembly|component|architecture|layout|diagram|map|network|infrastructure)\b/i;

export function seatIllustratedBeats(slides, { max = 3 } = {}) {
  const out = [...slides];
  const seatedSections = new Set();
  let seated = 0;
  for (let i = 0; i < out.length && seated < max; i++) {
    const s = out[i];
    if (!SEATABLE_TYPES.has(s.type)) continue;
    if (!SHOWABLE.test(String(s.purpose ?? ""))) continue;
    const sec = s.section ?? 0;
    if (seatedSections.has(sec)) continue;
    out[i] = { ...s, type: "illustrated-points" };
    seatedSections.add(sec);
    seated++;
  }
  return out;
}

export function planTypeMaxLength(types) {
  return types.reduce((n, t) => Math.max(n, t.length), 0);
}

export async function planDeck({ brief, briefing = "", theme, identity, research = "", maxSlides = 24, slidesPerMember = null, model, signal, chat = chatJSON }) {
  const catalog = await slideCatalog();
  const schema = await deckSchema();
  const types = schema.definitions.slide.properties.type.enum;

  const voice = theme?.voice ?? {};
  const sectionCap = targetSections(identity);
  const presenters = presentingNames(identity);
  const contentCap = slidesPerMember && presenters.length
    ? Math.min(maxSlides, presenters.length * slidesPerMember)
    : maxSlides;
  const fullStrength = (await authorTransport({ model })) === "cloud";
  const teamNote = presenters.length
    ? `The team of ${presenters.length} presenting members (${presenters.join(", ")}) presents the deck together — one member per part, each member presenting only content slides, never the dividers.`
    : "Plan the deck as three to eight major parts.";
  const sizingNote = slidesPerMember && presenters.length
    ? `- Size the talk to the team: about ${presenters.length * slidesPerMember} content slides, roughly ${slidesPerMember} per presenting member. The title, section dividers and closing slide are structural and do not count toward that number.`
    : maxSlides < 24
      ? `- Keep the deck to about ${contentCap} content slides; the title, section dividers and closing slide are extra and do not count toward the limit.`
      : "";

  const system = [
    "You plan presentation decks. You do not write slide content yet.",
    "A strong deck is judged by one thing: after the last slide, the audience",
    "remembers the takeaway and can act on it. Plan for that.",
    "",
    `Available slide types: ${types.join(", ")}.`,
    "",
    catalog,
    "",
    "Rules:",
    "- The first slide is always type `title`.",
    "- Use `section` dividers to open each major part.",
    "- Every slide's `section` is a 0-based index into your `sections` array.",
    "- `purpose` states what that slide must convey — ONE specific sentence, under",
    "  ~140 characters, with a concrete claim when the research carries one. It is",
    "  a private brief for the writer, never slide text, so it must stay brief.",
    "- If the briefing contains a Thesis/takeaway line, it is the deck's central claim — every major part and the closing must prove it; the closing lands that sentence.",
    "- Respect the Evidence / constraints line — never invent figures beyond it, and the research must cover it.",
    "- The audience and emphasis answers are strategy: every slide must serve the",
    "  stated takeaway, and the ideas marked 'most important' must own the most",
    "  slides and the strongest evidence. Cut anything that doesn't.",
    "- The deck must be a complete talk, in presentation flow: it opens on the",
    "  title, then an INTRO beat that frames the topic for THIS audience, then",
    "  the body sections in a sensible story arc, and it CLOSES with a conclusion",
    "  that lands the takeaway. Always include the intro and the closing — do not",
    "  leave the talk to trail off at the last body section, whatever the brief says.",
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
    "- Avoid image-REQUIRING types (`image`, `image-text`, `image-grid`, `hero-image`,",
    "  `split-screen`, `side-by-side`) unless the brief actually names image files —",
    "  the writer has no image to draw from and must not invent one.",
    "- `illustrated-points` is NOT one of those and the rule above does not apply",
    "  to it: it is a LIST type whose image field is OPTIONAL, so choosing it",
    "  commits you to nothing. Use it for a beat where a photograph or diagram",
    "  would genuinely help — a physical thing, a place, a piece of equipment.",
    `- Structure the talk as about ${sectionCap} major parts, each member taking one.`,
    dataAffinityNote(research),
    voice.prefers?.length ? `- Favour: ${voice.prefers.join("; ")}.` : "",
    voice.density ? `- Density: ${voice.density}.` : "",
    sizingNote,
  ].filter(Boolean).join("\n");

  const contentFloor = slidesPerMember && presenters.length
    ? Math.min(contentCap, presenters.length * slidesPerMember)
    : Math.min(contentCap, Math.max(presenters.length, sectionCap));

  const askOutline = async () => {
    const res = await chat({
      role: "author",
      model,
      signal,
      schema: outlineSchema({
        maxSlides: contentCap,
        sectionCap,
        minSlides: contentFloor + 2,
        typeMax: planTypeMaxLength(types),
      }),
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
    const slides = normalisePlanSections(
      (plan.slides ?? [])
        .map((s) => ({ ...s, type: types.includes(s.type) ? s.type : "bullets" }))
        .filter((s) => s.purpose),
    );
    return { res, plan, slides };
  };

  let { res, plan, slides } = await askOutline();
  const planned = (list) => list.filter((s) => !DIVIDER_TYPES.has(s.type)).length;
  if (planned(slides) * 2 < contentFloor) {
    const retry = await askOutline();
    if (planned(retry.slides) > planned(slides)) ({ res, plan, slides } = retry);
  }
  const plannedByModel = planned(slides);

  if (numericFactCount(research) < 2) {
    slides = slides.map((s) => (s.type === "chart" ? { ...s, type: "cards" } : s));
  }

  if (slides.length && slides[0].type !== "title") {
    slides.unshift({ type: "title", purpose: "Open the deck.", section: 0 });
  }
  slides = trimContentToBudget(slides, contentCap);
  slides = mintContentSlides(slides, plan.sections ?? [], contentCap, {
    members: presenters.length,
    slidesPerMember,
  });
  slides = ensureStructuralSlides(slides, plan.sections ?? []);
  slides = seatIllustratedBeats(slides);
  plan.slides = slides;

  return {
    plan,
    stats: {
      model: res.model,
      outputTokens: res.evalCount,
      plannedByModel,
      minted: Math.max(0, planned(slides) - plannedByModel),
    },
  };
}

function shortHeadline(purpose) {
  const clause = String(purpose ?? "").replace(/[.:;,!?][\s\S]*$/, "").trim();
  if (!clause) return "Covered in the full briefing.";
  if (clause.length <= 48) return clause;
  const cut = clause.slice(0, 48);
  const at = cut.lastIndexOf(" ");
  return (at > 20 ? cut.slice(0, at) : cut) + "…";
}

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
    bullets: [
      purpose.slice(0, 160),
      "Details in the full briefing.",
      "This slide's generation was cut short and was not re-attempted.",
      "Regenerate this slide to replace the placeholders above.",
    ],
  };
}

export function normalisePlanSections(slides) {
  const out = slides.map((s) => ({ ...s }));
  const previous = (i) => {
    for (let j = i - 1; j >= 0; j--) if (Number.isInteger(out[j].section)) return out[j].section;
    return 0;
  };
  for (let i = 0; i < out.length; i++) {
    if (Number.isInteger(out[i].section)) continue;
    if (DIVIDER_TYPES.has(out[i].type)) {
      const opens = out.slice(i + 1).find((s) => !DIVIDER_TYPES.has(s.type) && Number.isInteger(s.section));
      out[i].section = opens?.section ?? previous(i);
    } else {
      out[i].section = previous(i);
    }
  }
  return out;
}

export function ensureStructuralSlides(slides, sections) {
  const out = [...slides];
  if (!out.length) return out;

  if (out[0].type !== "title") {
    out.unshift({ type: "title", purpose: "Open the deck.", section: 0 });
  }

  const isFrontMatter = (s) => FRONT_MATTER_TYPES.has(s.type);
  const isContent = (s) => !DIVIDER_TYPES.has(s.type) && !isFrontMatter(s);

  const used = new Set();
  for (const s of out) if (isContent(s)) used.add(s.section ?? 0);

  for (const sec of [...used].sort((a, b) => a - b)) {
    const hasOpener = out.some(
      (s) => s.section === sec && DIVIDER_TYPES.has(s.type) && s.type !== "closing" && s.type !== "title",
    );
    if (hasOpener) continue;
    const first = out.findIndex((s) => s.section === sec && isContent(s));
    const divider = {
      type: "section",
      purpose: sections[sec] ? `Open the part on ${sections[sec]}.` : `Open part ${sec + 1}.`,
      section: sec,
    };
    if (first === -1) out.push(divider);
    else out.splice(first, 0, divider);
  }

  if (!out.some((s) => s.type === "closing")) {
    const lastContent = [...out].reverse().find((s) => isContent(s));
    out.push({ type: "closing", purpose: "Close the deck and thank the audience.", section: lastContent?.section ?? 0 });
  }
  return out;
}

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

export function mintContentSlides(slides, sections, contentCap, { members = 0, slidesPerMember = null } = {}) {
  const content = slides.filter((s) => !DIVIDER_TYPES.has(s.type));
  const n = Math.max(0, members);
  const desired = slidesPerMember ? n * slidesPerMember : (content.length < n ? n : content.length);
  const target = Number.isFinite(contentCap) ? Math.min(contentCap, desired) : desired;
  const deficit = Math.max(0, target - content.length);
  if (!deficit) return slides;

  const out = [...slides];
  const contentSections = [...new Set(content.map((s) => s.section ?? 0))];
  if (!contentSections.length) {
    for (let i = 0; i < deficit; i++) out.push(mintedSpec(sections, 0));
    return out;
  }
  for (let i = 0; i < deficit; i++) {
    const sec = contentSections[contentSections.length - 1 - (i % contentSections.length)];
    const spec = mintedSpec(sections, sec);
    let at = out.length;
    for (let j = out.length - 1; j >= 0; j--) {
      if (!DIVIDER_TYPES.has(out[j].type) && (out[j].section ?? 0) === sec) { at = j + 1; break; }
    }
    out.splice(at, 0, spec);
  }
  return out;
}

function mintedSpec(sections, sec) {
  const label = sections?.[sec];
  return {
    type: "bullets",
    section: sec,
    purpose: label
      ? `Continue the "${label}" part: one more concrete point developing the section's argument, drawn from the research, extending the slide before it.`
      : "Continue the part: one more concrete point developing the section's argument, drawn from the research, extending the slide before it.",
  };
}

async function writeSlide({ spec, plan, deck, theme, research, model, signal, chat = chatJSON }) {
  const catalog = await slideCatalog();
  const schema = await deckSchema();
  const isDivider = DIVIDER_TYPES.has(spec.type);
  const buildOps = buildOpsSchema(schema, {
    slideCount: deck.slides.length,
    onlyTypes: [spec.type],
    excludeProps: ["presenter"],
  });

  const voice = theme?.voice ?? {};
  const fullStrength = (await authorTransport({ model })) === "cloud";
  const slideResearch = selectResearch(research, slideQuery({ spec, plan }), { budget: CALL_RESEARCH_CHARS });
  const already = deck.slides
    .map((s, i) => `[${i}] ${s.type}: ${s.headline ?? s.quote ?? "—"}`)
    .join("\n") || "(none yet)";

  const isFreeform = spec.type === "freeform";

  const imageSeatable = Boolean(await imageSeat(spec.type));

  const system = [
    "You write the content of ONE presentation slide for a live talk — the",
    "audience just heard the previous slide and will remember only the claim",
    "and one number from this one. Be short, specific, and memorable.",
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
    "and no real image file exists for it, leave the field out entirely.",
    ...(imageSeatable
      ? [
          "This slide's type CAN carry a picture. Leave the image field out — there is",
          "no file yet — and describe what it should show in `notes`, prefixed with",
          "`[image]` (e.g. \"[image] a diagram of the electrolysis cell\"). The picture",
          "is then supplied into the space this layout already keeps for it.",
        ]
      : [
          "This slide's type CANNOT carry a picture, so do not ask for one: an",
          "`[image]` note here can never be filled and the slide ships with a request",
          "nobody can honour. Write the point in words instead.",
        ]),
    "No filler, no invented statistics, no rhetorical hedging.",
    "Do not repeat wording already used on an earlier slide.",
    "",
    "Every slide must SERVE THIS DECK's topic and section. The headline is a claim,",
    "the body is its support, and a presenter must be able to voice the 'so what'",
    "from the slide alone. If a researched fact does not serve THIS deck's argument,",
    "do not use it — even if it is grounded in the notes.",
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
          `DECK: ${plan.title}`,
          plan.sections?.length ? `SECTIONS: ${plan.sections.map((s, i) => `${i}=${s}`).join(", ")}` : "",
          slideResearch ? `\nRESEARCH NOTES\n${slideResearch}\n` : "",
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

export async function generateDeck({
  brief, briefing = "", theme, identity, research = "", maxSlides = 24, model, signal, onProgress,
  plan: givenPlan, slidesPerMember = null,
  baseDeck = null, fromIndex = 0, onSlide = null, chat = chatJSON,
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

  let deck = baseDeck ?? {
    title: plan.title || brief.slice(0, 80),
    ...(plan.subtitle ? { subtitle: plan.subtitle } : {}),
    ...(theme?.name ? { theme: theme.name } : {}),
    sections: plan.sections ?? [],
    slides: [],
  };

  let skipped = [];

  const noNumbers = numericFactCount(research) < 2;
  const planSlides = noNumbers
    ? plan.slides.map((s) => (s.type === "chart" ? { ...s, type: "cards" } : s))
    : plan.slides;

  for (const [i, rawSpec] of planSlides.entries()) {
    const spec = rawSpec;
    if (i < fromIndex) continue;
    onProgress?.({ phase: "writing", index: i, total: plan.slides.length, type: spec.type });
    let res;
    try {
      const before = deck.slides.length;
      const attempt = async () => {
        const ops = await writeSlide({ spec, plan, deck, theme, research, model, signal, chat });
        const a = applyOps(deck, ops.filter((o) => o.op === "append_slide"));
        const grew = a.ok && a.deck.slides.length > before;
        if (!grew) return { a, ok: false, errors: a.ok ? ["no usable slide written"] : a.errors };
        const v = await validateDeck(a.deck);
        return { a, ok: v.ok, errors: v.errors ?? [] };
      };
      res = await attempt();
      if (!res.ok) res = await attempt();
    } catch (err) {
      if (err.name === "AbortError") throw err;
      res = { ok: false, errors: [err.message.slice(0, 120)] };
    }
    if (!res.ok) {
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
    const written = deck.slides[deck.slides.length - 1];
    if (written && spec.section != null) written.section = spec.section;
    onSlide?.(deck, i + 1, plan.slides.length);
  }

  const { ok, errors } = await validateDeck(deck);
  onProgress?.({ phase: "done", slides: deck.slides.length, skipped: skipped.length });

  const recovered = [];
  for (const ph of placeholderSlides(deck)) {
    const spec = plan.slides[ph.index];
    if (!spec) continue;
    try {
      const before = deck.slides.length;
      const ops = await writeSlide({ spec, plan, deck, theme, research, model, signal, chat });
      const a = applyOps(deck, [
        { op: "replace_slide", index: ph.index, slide: ops.find((o) => o.op === "append_slide")?.slide },
      ]);
      const rep = ops.find((o) => o.op === "append_slide")?.slide;
      if (!rep) continue;
      const candidate = structuredClone(deck);
      candidate.slides[ph.index] = rep;
      if (spec.section != null) candidate.slides[ph.index].section = spec.section;
      if ((await validateDeck(candidate)).ok) {
        deck = candidate;
        recovered.push(ph.index);
      }
    } catch (err) {
      if (err.name === "AbortError") throw err;
    }
  }
  if (recovered.length) {
    skipped = skipped.filter((s) => !recovered.includes(s.index));
  }

  const placeholderProblems = placeholderSlides(deck).map(
    (s) => `slide ${s.index + 1} (${s.type}) is a PLACEHOLDER — its generation failed and it must be regenerated before this deck is presented`,
  );

  assignPresenters(deck, identity, slidesPerMember);

  return { ok, deck, plan, skipped, errors, stats, problems: placeholderProblems };
}

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
      "This is the ONLY slide you see and the ONLY slide you touch. Do not copy or carry",
      "content from any other slide — rewrite THIS slide's content against the research",
      "alone, so each slide stays distinct and nothing from a neighbouring slide leaks in.",
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

    const got = slideFromOps(res.data?.ops, i);
    if (!got) {
      problems.push(`slide ${i + 1} (${slide.type}): no usable rewrite — kept original`);
      swept.push({ index: i, type: slide.type, kept: true });
      continue;
    }
    const next = structuredClone(out);
    if (got.kind === "patch") {
      next.slides[i] = { ...next.slides[i], ...got.patch };
    } else {
      next.slides[i] = got.slide;
    }
    next.slides[i] = { ...next.slides[i], type: slide.type, presenter: slide.presenter, section: slide.section };
    const { ok } = await validateDeck(next);
    if (!ok) {
      problems.push(`slide ${i + 1} (${slide.type}): density rewrite failed — kept original`);
      swept.push({ index: i, type: slide.type, kept: true });
      continue;
    }
    out = next;
    const sweptImage = out.slides[i].image;
    if (sweptImage && /^[a-z][a-z0-9+.-]*:\/\//i.test(sweptImage)) {
      const s = out.slides[i];
      delete s.image;
      const hint = `[image] ${sweptImage}`;
      s.notes = s.notes ? `${s.notes}\n${hint}` : hint;
    }
    swept.push({ index: i, type: slide.type });
  }

  return { deck: out, problems, swept };
}

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

const STRUCTURAL = new Set([...DIVIDER_TYPES, ...FRONT_MATTER_TYPES, "references", "contact", "attribution", "team-grid"]);

export function chooseInsertType(deck, after, { exclude = [] } = {}) {
  const slides = deck?.slides ?? [];
  const neighbours = [slides[after]?.type, slides[after + 1]?.type].filter(Boolean);
  const neighbourFamilies = new Set(neighbours.map(familyFor).filter(Boolean));

  const used = new Map();
  for (const s of slides) {
    const f = familyFor(s.type);
    if (f) used.set(f, (used.get(f) ?? 0) + 1);
  }

  const candidates = [...FAMILY_TYPES.entries()]
    .filter(([family]) => family !== "Foundation")
    .map(([family, types]) => ({
      family,
      types: types.filter((t) => !STRUCTURAL.has(t) && !exclude.includes(t) && !neighbours.includes(t)),
    }))
    .filter((c) => c.types.length)
    .sort((a, b) => {
      const aNew = neighbourFamilies.has(a.family) ? 1 : 0;
      const bNew = neighbourFamilies.has(b.family) ? 1 : 0;
      if (aNew !== bNew) return aNew - bNew;
      return (used.get(a.family) ?? 0) - (used.get(b.family) ?? 0);
    });

  return candidates[0]?.types[0] ?? "bullets";
}

export function insertPurpose(deck, plan, after) {
  const slides = deck?.slides ?? [];
  const before = slides[after];
  const next = slides[after + 1];
  const sec = before?.section ?? next?.section ?? 0;
  const label = plan?.sections?.[sec];
  const said = (s) => s?.headline ?? s?.quote ?? s?.title ?? null;

  const between = [said(before), said(next)].filter(Boolean);
  const context = between.length === 2
    ? `It follows "${between[0]}" and is followed by "${between[1]}" — carry the argument from the first toward the second without restating either.`
    : between.length === 1
      ? `It follows "${between[0]}" — take that point further rather than restating it.`
      : "";

  return {
    section: sec,
    purpose: [
      label
        ? `Develop the "${label}" part with one more concrete point drawn from the research.`
        : "Add one more concrete point drawn from the research.",
      context,
    ].filter(Boolean).join(" "),
  };
}

export async function insertSlide({
  deck, plan, after, theme, research = "", type = null, purpose = null, model, signal, chat = chatJSON,
}) {
  const slides = deck?.slides ?? [];
  const at = Number(after);
  if (!Number.isInteger(at) || at < -1 || at >= slides.length) {
    throw new Error(`cannot insert after slide ${at + 1} — the deck has ${slides.length}`);
  }

  const derived = insertPurpose(deck, plan, at);
  const spec = {
    type: type ?? chooseInsertType(deck, at),
    section: derived.section,
    purpose: purpose?.trim() || derived.purpose,
  };

  const upTo = { ...deck, slides: slides.slice(0, at + 1) };
  const ops = await writeSlide({ spec, plan: plan ?? { title: deck.title, sections: [] }, deck: upTo, theme, research, model, signal, chat });
  const slide = ops.find((o) => o.op === "append_slide")?.slide
    ?? ops.find((o) => o.op === "replace_slide" || o.op === "insert_slide")?.slide
    ?? null;
  if (!slide) throw new Error("The model produced no slide to insert.");

  slide.type = slide.type ?? spec.type;
  if (slide.section == null && spec.section != null) slide.section = spec.section;
  delete slide.presenter;

  const nextSlides = [...slides.slice(0, at + 1), slide, ...slides.slice(at + 1)];
  return { slide, index: at + 1, deck: { ...deck, slides: nextSlides }, spec };
}

export async function convertSlide({
  deck, index, targetType, theme, research = "", model, signal, chat = chatJSON,
}) {
  const slide = deck.slides[index];
  if (!slide) throw new Error(`no slide at index ${index}`);

  const remapped = compatibleRemap(slide, targetType);
  if (remapped) {
    const { ok } = await validateDeck({ ...deck, slides: deck.slides.map((s, i) => (i === index ? remapped : s)) });
    if (ok) return { slide: remapped, method: "remap" };
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

  const got = slideFromOps(res.data?.ops, index);
  if (!got || got.kind !== "slide") return { slide: null, method: "model", errors: ["no usable op"] };
  const candidate = { ...got.slide, type: targetType };

  if (isDivider) delete candidate.presenter;
  else candidate.presenter = slide.presenter;
  candidate.section = slide.section;

  const imageField = candidate.image;
  if (imageField && /^[a-z][a-z0-9+.-]*:\/\//i.test(imageField)) {
    delete candidate.image;
    const hint = `[image] ${imageField}`;
    candidate.notes = candidate.notes ? `${candidate.notes}\n${hint}` : hint;
  }

  const withSanitized = { ...deck, slides: deck.slides.map((s, i) => (i === index ? candidate : s)) };
  const { ok } = await validateDeck(withSanitized);
  return ok
    ? { slide: candidate, method: "model" }
    : { slide: null, method: "model", errors: [] };
}
