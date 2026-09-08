
const REQUIRED = "required";
const OPTIONAL = "optional";

export const BRIEFING_QUESTIONS = [
  { key: "preset", tier: REQUIRED, ask: "Use a saved format, or start fresh?" },
  { key: "theme", tier: REQUIRED, ask: "Which visual style should it use?" },
  { key: "maxSlides", tier: REQUIRED, ask: "How many slides?" },
  { key: "density", tier: REQUIRED, ask: "How much text per slide?" },
  { key: "research", tier: REQUIRED, ask: "Run a research pass over the topic?" },
  { key: "images", tier: REQUIRED, ask: "Find images for slides that ask for one?" },

  { key: "title", tier: OPTIONAL, ask: "What should the deck be called?" },
  { key: "thesis", tier: OPTIONAL, ask: "What is the ONE thing the audience must remember or do after your last slide? (your thesis in one sentence)" },
  { key: "audience", tier: OPTIONAL, ask: "Who will be in the room, what do they already know, and what must they remember or do after your last slide?" },
  { key: "emphasis", tier: OPTIONAL, ask: "Which 2–3 ideas must own the most slides and the strongest evidence — and why do they matter to this audience?" },
  { key: "evidence", tier: OPTIONAL, ask: "What figures, sources, or limits must we respect — or must NOT invent? (leave blank if none)" },
  { key: "team", tier: OPTIONAL, ask: "Who is on the team — and who presents?" },
  { key: "guide", tier: OPTIONAL, ask: "Who is your guide?" },
  { key: "academic", tier: OPTIONAL, ask: "Which subject and academic year is this for?" },
  { key: "slidesPerMember", tier: OPTIONAL, ask: "Slides per presenting member?" },
  { key: "branding", tier: OPTIONAL, ask: "How much institutional branding should the slides carry?" },
];

export const REPORT_QUESTIONS = [
  { key: "preset", tier: REQUIRED, ask: "Use a saved format, or start fresh?" },
  { key: "depth", tier: REQUIRED, ask: "How deep should the report be?" },
  { key: "density", tier: REQUIRED, ask: "How much text per section?" },
  { key: "research", tier: REQUIRED, ask: "Run a research pass over the topic?" },

  { key: "title", tier: OPTIONAL, ask: "What should the report be called?" },
  { key: "thesis", tier: OPTIONAL, ask: "What is the ONE thing the reader must remember or do after reading? (your thesis in one sentence)" },
  { key: "audience", tier: OPTIONAL, ask: "Who is this for — and what should they take away?" },
  { key: "emphasis", tier: OPTIONAL, ask: "Which parts matter most — and why?" },
  { key: "evidence", tier: OPTIONAL, ask: "What figures, sources, or limits must we respect — or must NOT invent? (leave blank if none)" },
  { key: "team", tier: OPTIONAL, ask: "Who is on the team?" },
  { key: "guide", tier: OPTIONAL, ask: "Who is your guide?" },
  { key: "academic", tier: OPTIONAL, ask: "Which subject and academic year is this for?" },
  { key: "branding", tier: OPTIONAL, ask: "How much institutional branding should it carry?" },
];

export function questionsFor(kind) {
  return kind === "report" ? REPORT_QUESTIONS : BRIEFING_QUESTIONS;
}

export function tierQuestions(kind, tier, briefing = {}, presets = null) {
  const unskip = new Set(briefing.unskip ?? []);
  return questionsFor(kind).filter((q) => {
    if (q.tier !== tier) return false;
    if (q.key === "preset") return Array.isArray(presets) ? presets.length > 0 : true;
    if (briefing.presetId && PRESET_KEYS.includes(q.key) && !unskip.has(q.key)) return false;
    return true;
  });
}

export function briefTier(kind, step) {
  const len = questionsFor(kind).length;
  if (!(step > 0)) return "required";
  if (step >= len) return "done";
  return "optional";
}

export function stepForTier(kind, tier) {
  if (tier === "required") return 0;
  if (tier === "optional") return 1;
  return questionsFor(kind).length;
}

export function isAnswered(briefing, key) {
  const v = (briefing ?? {})[key];
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (key === "team") return (v.members ?? []).some((m) => m.name?.trim());
  if (key === "guide") return Boolean(v.name?.trim());
  if (key === "academic") return Object.values(v).some((x) => String(x ?? "").trim());
  return true;
}

export function optionalAnswered(kind, briefing = {}, baseline = null) {
  return questionsFor(kind)
    .filter((q) => q.tier === OPTIONAL && isAnswered(briefing, q.key))
    .filter((q) => !baseline || JSON.stringify(briefing?.[q.key]) !== JSON.stringify(baseline?.[q.key]))
    .length;
}

export const PRESET_KEYS = ["team", "maxSlides", "slidesPerMember", "density", "theme", "branding"];

export const PRESET_KEYS_LEGACY = ["team", "maxSlides", "slidesPerMember", "density", "theme", "branding"];

export function briefingFromPreset(preset, identity) {
  const b = initialBriefing(identity);
  const p = preset ?? {};
  return {
    ...b,
    team: p.team ?? b.team,
    maxSlides: p.maxSlides ?? b.maxSlides,
    theme: p.theme ?? b.theme,
    density: p.density ?? b.density,
    branding: p.branding ?? b.branding,
    slidesPerMember: p.slidesPerMember ?? b.slidesPerMember,
  };
}

export function applyPresetToBriefing(briefing, preset) {
  const p = preset ?? {};
  return {
    ...briefing,
    team: p.team ?? briefing.team,
    maxSlides: p.maxSlides ?? briefing.maxSlides,
    theme: p.theme ?? briefing.theme,
    density: p.density ?? briefing.density,
    branding: p.branding ?? briefing.branding,
    slidesPerMember: p.slidesPerMember ?? briefing.slidesPerMember,
  };
}

export function effectiveBriefStep(briefing, step, questions = BRIEFING_QUESTIONS) {
  if (!briefing?.presetId) return step;
  const unskip = new Set(briefing.unskip ?? []);
  let i = step;
  while (i < questions.length && PRESET_KEYS.includes(questions[i].key) && !unskip.has(questions[i].key)) i++;
  return i;
}

export function nextBriefStep(briefing, step, questions = BRIEFING_QUESTIONS) {
  return Math.min(effectiveBriefStep(briefing, step, questions) + 1, questions.length);
}

export function presetPayload(briefing) {
  const b = briefing ?? {};
  return {
    team: b.team,
    maxSlides: b.maxSlides ?? null,
    theme: b.theme,
    density: b.density,
    branding: b.branding,
    slidesPerMember: b.slidesPerMember,
  };
}

export function briefingAnsweredText(briefing, label = (t) => t) {
  const b = briefing ?? {};
  const team = b.team ?? {};
  const members = (team.members ?? []).filter((m) => m.name?.trim());
  const acad = b.academic ?? {};
  const lines = [];

  const put = (key, value) => {
    const v = String(value ?? "").trim();
    if (v) lines.push(`- ${key}: ${v}`);
  };

  put("Title", b.title);
  put("Thesis", b.thesis);
  if (b.thesis?.trim() && !b.takeaway?.trim()) {
  }
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
  put("Evidence / constraints", b.evidence);
  if (b.theme) lines.push(`- Theme: ${label(b.theme)}`);
  put("Slide count", b.maxSlides ? `${b.maxSlides}` : "auto");
  put("Slides per member", b.slidesPerMember ? `${b.slidesPerMember}` : "auto");
  put("Density", b.density);
  if (b.depth) put("Depth", b.depth);
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

export function initialBriefing(identity) {
  const id = identity ?? {};
  const guide = id.guide ?? {};
  return {
    title: "",
    presetId: null,    // set when the briefing starts from a saved format
    team: { label: "", members: [] },
    guide: { name: guide.name ?? "", designation: guide.designation ?? "" },
    academic: {
      subject: "",
      year: "",
      semester: "",
      exam_type: "",
    },
    thesis: "",
    audience: "",
    emphasis: "",
    evidence: "",
    theme: (() => {
      try { return localStorage.getItem("forge.defaultTheme") ?? ""; } catch { return ""; }
    })(),
    maxSlides: 0,        // 0 = auto (collapsed into density; kept for preset compat)
    slidesPerMember: null, // collapsed into density; kept for preset compat
    density: "balanced",
    branding: "full",   // full | minimal | none
    depth: "full",      // report only: full | brief
    researchSource: "web",
    uploadedSource: null, // { token, name, words } — the staged briefing document
    research: false,
    papers: false,      // also search arXiv + Crossref for academic papers
  };
}

export function suggestTitle(topic) {
  const t = String(topic ?? "").trim();
  if (!t) return "";
  return t.split(/[:.;!?]/, 1)[0].replace(/\s+/g, " ").trim().slice(0, 80);
}

export function echoAnswer(briefing, key, opts = {}) {
  const b = briefing ?? {};
  switch (key) {
    case "preset": {
      const name = opts.presetLabel?.(b.presetId) ?? (b.presetId ? b.presetId : "none");
      return b.presetId ? `Preset: ${name}` : "Fresh briefing";
    }
    case "title": return b.title?.trim() || "(untitled)";
    case "thesis": return b.thesis?.trim() || "no thesis set";
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
    case "evidence": return b.evidence?.trim() || "no constraints set";
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

export function applyFreeText(briefing, key, text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const b = briefing ?? {};
  switch (key) {
    case "preset":
      if (/^(none|fresh|new|no)/i.test(t)) return { briefing: { ...b, presetId: null }, echo: "Fresh briefing" };
      return { briefing: { ...b, presetId: t }, echo: `Preset: ${t}` };
    case "title":
      return { briefing: { ...b, title: t }, echo: t };
    case "thesis":
      return { briefing: { ...b, thesis: t }, echo: `Thesis: ${t}` };
    case "team": {
      const name = t.replace(/^add\s+/i, "").trim();
      if (!name) return null;
      return {
        briefing: {
          ...b,
          team: { ...(b.team ?? {}), members: [...((b.team?.members) ?? []), { name, roll: "", presenting: false }] },
        },
        echo: `Added ${name}`,
      };
    }
    case "guide": {
      const [name, ...rest] = t.split(",").map((s) => s.trim());
      if (!name) return null;
      return {
        briefing: { ...b, guide: { ...(b.guide ?? {}), name, designation: rest.join(",").trim() || b.guide?.designation } },
        echo: `Guide: ${name}`,
      };
    }
    case "academic":
      return { briefing: { ...b, academic: { ...(b.academic ?? {}), subject: t } }, echo: `Subject: ${t}` };
    case "audience":
      return { briefing: { ...b, audience: t }, echo: `For: ${t}` };
    case "emphasis":
      return { briefing: { ...b, emphasis: t }, echo: `Emphasis: ${t}` };
    case "evidence":
      return { briefing: { ...b, evidence: t }, echo: `Evidence: ${t}` };
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
