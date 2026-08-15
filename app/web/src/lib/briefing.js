/**
 * The guided deck-briefing: nine questions asked one at a time in the thread,
 * each with a sensible default. This is the data model the old NewDeck wizard
 * form had, re-expressed as a conversation — the chat writes the same deck
 * params the pipeline has always consumed.
 */

export const BRIEFING_QUESTIONS = [
  { key: "preset", ask: "Use a saved format, or start fresh?" },
  { key: "title", ask: "What should the deck be called?" },
  { key: "team", ask: "Who is on the team — and who presents?" },
  { key: "guide", ask: "Who is your guide?" },
  { key: "academic", ask: "Which subject and academic year is this for?" },
  { key: "audience", ask: "Who is this for — and what should they take away?" },
  { key: "emphasis", ask: "Which parts matter most?" },
  { key: "theme", ask: "Which visual style should it use?" },
  { key: "maxSlides", ask: "How many slides?" },
  { key: "slidesPerMember", ask: "Slides per presenting member?" },
  { key: "density", ask: "How much text per slide?" },
  { key: "branding", ask: "How much institutional branding should the slides carry?" },
  { key: "research", ask: "Run a research pass over the topic?" },
];

/**
 * The report briefing — the same guided walk, but report-relevant: no theme
 * (the graded template has none), no slide count, and a depth choice instead.
 * Sections scale with the team already, so they are not asked either.
 */
export const REPORT_QUESTIONS = [
  { key: "preset", ask: "Use a saved format, or start fresh?" },
  { key: "title", ask: "What should the report be called?" },
  { key: "team", ask: "Who is on the team?" },
  { key: "guide", ask: "Who is your guide?" },
  { key: "academic", ask: "Which subject and academic year is this for?" },
  { key: "audience", ask: "Who is this for — and what should they take away?" },
  { key: "emphasis", ask: "Which parts matter most?" },
  { key: "depth", ask: "How deep should the report be?" },
  { key: "density", ask: "How much text per section?" },
  { key: "branding", ask: "How much institutional branding should it carry?" },
  { key: "research", ask: "Run a research pass over the topic?" },
];

/** The question list for a product kind — reports walk a different briefing. */
export function questionsFor(kind) {
  return kind === "report" ? REPORT_QUESTIONS : BRIEFING_QUESTIONS;
}

/**
 * The briefing fields a preset fixes. When a preset is picked these questions
 * are treated as answered and skipped; the user still walks the changing bits
 * (title, subject, teacher) and the per-deck choices (audience, emphasis,
 * count, research).
 */
export const PRESET_KEYS = ["team", "theme", "density", "branding", "slidesPerMember"];

/**
 * Pre-fill a briefing from a saved preset, over the identity defaults.
 * The preset's values win on every fixed field; everything else keeps its
 * default so the changing questions still get asked.
 */
export function briefingFromPreset(preset, identity) {
  const b = initialBriefing(identity);
  const p = preset ?? {};
  return {
    ...b,
    team: p.team ?? b.team,
    guide: p.guide ?? b.guide,
    academic: { ...b.academic, ...(p.academic ?? {}) },
    theme: p.theme ?? b.theme,
    density: p.density ?? b.density,
    branding: p.branding ?? b.branding,
    slidesPerMember: p.slidesPerMember ?? b.slidesPerMember,
  };
}

/**
 * Re-fill the fixed briefing fields from a preset without touching the fields
 * the user has already answered in this thread (title, audience, …).
 */
export function applyPresetToBriefing(briefing, preset) {
  const p = preset ?? {};
  return {
    ...briefing,
    team: p.team ?? briefing.team,
    guide: p.guide ?? briefing.guide,
    academic: { ...briefing.academic, ...(p.academic ?? {}) },
    theme: p.theme ?? briefing.theme,
    density: p.density ?? briefing.density,
    branding: p.branding ?? briefing.branding,
    slidesPerMember: p.slidesPerMember ?? briefing.slidesPerMember,
  };
}

/**
 * The briefing walk skips the questions a picked preset already answers, so
 * after "use a saved format" the thread lands straight on the next open
 * question instead of re-asking the fixed fields. A question the user has
 * explicitly rewound to (clicked "change" on) is un-skipped — `unskip` holds
 * those keys — so the fixed fields stay editable, not frozen. `questions` is
 * the per-kind list (deck or report).
 */
export function effectiveBriefStep(briefing, step, questions = BRIEFING_QUESTIONS) {
  if (!briefing?.presetId) return step;
  const unskip = new Set(briefing.unskip ?? []);
  let i = step;
  while (i < questions.length && PRESET_KEYS.includes(questions[i].key) && !unskip.has(questions[i].key)) i++;
  return i;
}

/** The briefing fields a "save as preset" captures. */
export function presetPayload(briefing) {
  const b = briefing ?? {};
  return {
    team: b.team,
    guide: b.guide,
    academic: b.academic,
    theme: b.theme,
    density: b.density,
    branding: b.branding,
    slidesPerMember: b.slidesPerMember,
  };
}

/**
 * The full briefing record as explicit text for the plan prompt — "The user
 * answered: …". Every guided question the user actually answered must reach
 * the planner verbatim; a plan built from the topic sentence alone ignores
 * the team, the guide, the audience, the emphasis, the branding. Only
 * non-empty answers are listed, so a skipped question (defaulted) reads as
 * "not stated" rather than inventing a value. `label` supplies human theme
 * names when the caller has them.
 */
export function briefingAnsweredText(briefing, label = (t) => t) {
  const b = briefing ?? {};
  const team = b.team ?? {};
  const members = (team.members ?? []).filter((m) => m.name?.trim());
  const presenting = members.filter((m) => m.presenting);
  const acad = b.academic ?? {};
  const lines = [];

  const put = (key, value) => {
    const v = String(value ?? "").trim();
    if (v) lines.push(`- ${key}: ${v}`);
  };

  put("Title", b.title);
  if (members.length) {
    const names = members.map((m) => `${m.name}${m.roll ? ` (${m.roll})` : ""}${m.presenting ? " — presents" : ""}`).join(", ");
    const teamLine = `- Team: ${names}`;
    lines.push(teamLine + (team.label ? ` — ${team.label}` : ""));
  }
  put("Guide", b.guide?.name ? [b.guide.name, b.guide.designation].filter(Boolean).join(", ") : "");
  put("Subject", acad.subject);
  put("Academic year", acad.year);
  put("Semester", acad.semester);
  put("Exam type", acad.exam_type);
  put("Audience", b.audience);
  put("Emphasis", b.emphasis);
  if (b.theme) lines.push(`- Theme: ${label(b.theme)}`);
  put("Slide count", b.maxSlides ? `${b.maxSlides}` : "auto");
  put("Slides per member", b.slidesPerMember ? `${b.slidesPerMember}` : "auto");
  put("Density", b.density);
  put("Branding", b.branding === "none" ? "no institutional branding" : b.branding === "minimal" ? "minimal branding" : "full branding");
  if (b.researchSource === "upload") {
    lines.push(`- Research source: my uploaded file${b.uploadedSource?.name ? ` (${b.uploadedSource.name})` : ""} — no web search`);
  } else if (b.researchSource === "web") {
    lines.push(`- Research source: web search${b.papers ? " + academic papers" : ""}`);
  } else {
    lines.push("- Research source: none — write from the topic alone");
  }

  if (!lines.length) return "";
  return `The user answered:\n${lines.join("\n")}`;
}

/** Pre-fill from config/identity.yaml — the remembered defaults, not truth. */
export function initialBriefing(identity) {
  const id = identity ?? {};
  const acad = id.academic ?? {};
  const guide = id.guide ?? {};
  const team = id.team ?? {};
  return {
    title: "",
    presetId: null,    // set when the briefing starts from a saved format
    team: {
      label: team.label ?? "",
      members: (team.members ?? [])
        .filter((m) => m.name?.trim())
        .map((m) => ({ name: m.name ?? "", roll: m.roll ?? "", presenting: Boolean(m.presenting) })),
    },
    guide: { name: guide.name ?? "", designation: guide.designation ?? "" },
    academic: {
      subject: acad.subject ?? "",
      year: acad.year ?? "",
      semester: acad.semester ?? "",
      exam_type: acad.exam_type ?? "",
    },
    audience: "",
    emphasis: "",
    // The remembered default theme (set from the Themes gallery) wins over the
    // generic default; a saved preset overrides it on pick.
    theme: (() => {
      try { return localStorage.getItem("forge.defaultTheme") ?? ""; } catch { return ""; }
    })(),
    maxSlides: 0,        // 0 = auto
    slidesPerMember: null,
    density: "balanced",
    branding: "full",   // full | minimal | none
    depth: "full",      // report only: full | brief
    // Where the content comes from: web | upload | none. "upload" means the
    // user's own document is the ONLY source — the research pass is skipped
    // and the file becomes notes.md.
    researchSource: "web",
    uploadedSource: null, // { token, name, words } — the staged briefing document
    research: false,
    papers: false,      // also search arXiv + Crossref for academic papers
  };
}

/** "Green hydrogen: how electrolysis works" → "Green hydrogen". */
export function suggestTitle(topic) {
  const t = String(topic ?? "").trim();
  if (!t) return "";
  return t.split(/[:.;!?]/, 1)[0].replace(/\s+/g, " ").trim().slice(0, 80);
}

/** One-line echo of a recorded answer, shown in the thread under the card. */
export function echoAnswer(briefing, key, opts = {}) {
  const b = briefing;
  switch (key) {
    case "preset": {
      const name = opts.presetLabel?.(b.presetId) ?? (b.presetId ? b.presetId : "none");
      return b.presetId ? `Preset: ${name}` : "Fresh briefing";
    }
    case "title": return b.title?.trim() || "(untitled)";
    case "team": {
      const n = (b.team?.members ?? []).length;
      const presenting = (b.team?.members ?? []).filter((m) => m.presenting && m.name?.trim()).length;
      return `${n} member${n === 1 ? "" : "s"}${presenting ? `, ${presenting} presenting` : ""}`;
    }
    case "guide": {
      const name = b.guide?.name?.trim();
      if (!name) return "no guide set";
      return b.guide.designation?.trim() ? `${name}, ${b.guide.designation.trim()}` : name;
    }
    case "academic": {
      const s = b.academic?.subject?.trim();
      return s || "no subject set";
    }
    case "audience": return b.audience?.trim() || "no audience set";
    case "emphasis": return b.emphasis?.trim() || "no emphasis set";
    case "theme": return opts.themeLabel?.(b.theme) || "Default";
    case "maxSlides": return b.maxSlides ? `${b.maxSlides} slides` : "auto";
    case "slidesPerMember": return b.slidesPerMember ? `${b.slidesPerMember} per presenting member` : "auto — split evenly";
    case "density": return b.density;
    case "depth": return b.depth === "brief" ? "brief — headline + 3 sentences" : "full — 3-6 paragraphs + table";
    case "branding": return b.branding === "none" ? "no branding" : b.branding === "minimal" ? "minimal branding" : "full branding";
    case "research": {
      if (b.researchSource === "upload") return `my uploaded file (${b.uploadedSource?.name ?? "no file"}) — no web search`;
      if (b.researchSource === "web") return b.papers ? "web search + academic papers" : "web search";
      return "no research";
    }
    default: return "";
  }
}

/**
 * Answer the current question with free text from the input bar. Returns
 * `{ briefing, echo }` when the text maps to the question, or null to signal
 * "this does not answer the question — let the card handle it". Adding a team
 * member is a pure local state change: nothing here touches the network.
 */
export function applyFreeText(briefing, key, text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const b = briefing;
  switch (key) {
    case "preset":
      // Free text names a preset to use, or "none"/"fresh" to start clean.
      if (/^(none|fresh|new|no)/i.test(t)) return { briefing: { ...b, presetId: null }, echo: "Fresh briefing" };
      return { briefing: { ...b, presetId: t }, echo: `Preset: ${t}` };
    case "title":
      return { briefing: { ...b, title: t }, echo: t };
    case "team": {
      const name = t.replace(/^add\s+/i, "").trim();
      if (!name) return null;
      return {
        briefing: {
          ...b,
          team: { ...b.team, members: [...(b.team.members ?? []), { name, roll: "", presenting: false }] },
        },
        echo: `Added ${name}`,
      };
    }
    case "guide": {
      const [name, ...rest] = t.split(",").map((s) => s.trim());
      if (!name) return null;
      return {
        briefing: { ...b, guide: { ...b.guide, name, designation: rest.join(",").trim() || b.guide.designation } },
        echo: `Guide: ${name}`,
      };
    }
    case "academic":
      return { briefing: { ...b, academic: { ...b.academic, subject: t } }, echo: `Subject: ${t}` };
    case "audience":
      return { briefing: { ...b, audience: t }, echo: `For: ${t}` };
    case "emphasis":
      return { briefing: { ...b, emphasis: t }, echo: `Emphasis: ${t}` };
    case "maxSlides": {
      const n = /^\d+$/.test(t) ? Number(t) : /auto/i.test(t) ? 0 : NaN;
      if (Number.isNaN(n)) return null;
      return { briefing: { ...b, maxSlides: n }, echo: n ? `${n} slides` : "auto" };
    }
    case "slidesPerMember": {
      const n = /^\d+$/.test(t) ? Number(t) : /auto/i.test(t) ? null : NaN;
      if (Number.isNaN(n)) return null;
      return { briefing: { ...b, slidesPerMember: n }, echo: n ? `${n} each` : "auto — split evenly" };
    }
    case "density": {
      const m = /sparse|balanced|dense/i.exec(t);
      if (!m) return null;
      return { briefing: { ...b, density: m[0].toLowerCase() }, echo: m[0].toLowerCase() };
    }
    case "depth": {
      const m = /full|brief/i.exec(t);
      if (!m) return null;
      return { briefing: { ...b, depth: m[0].toLowerCase() }, echo: m[0].toLowerCase() };
    }
    case "branding": {
      const m = /none|minimal|full/i.exec(t);
      if (!m) return null;
      const v = m[0].toLowerCase();
      return { briefing: { ...b, branding: v }, echo: v === "none" ? "no branding" : `${v} branding` };
    }
    case "research": {
      if (/upload|my file|file/i.test(t)) return { briefing: { ...b, researchSource: "upload", research: false }, echo: "my uploaded file" };
      if (/^(on|yes|y)/i.test(t)) return { briefing: { ...b, researchSource: "web", research: true }, echo: "web search" };
      if (/^(off|no|n|skip)/i.test(t)) return { briefing: { ...b, researchSource: "none", research: false }, echo: "no research" };
      return null;
    }
    default: return null;
  }
}
