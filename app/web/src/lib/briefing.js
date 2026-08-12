/**
 * The guided deck-briefing: nine questions asked one at a time in the thread,
 * each with a sensible default. This is the data model the old NewDeck wizard
 * form had, re-expressed as a conversation — the chat writes the same deck
 * params the pipeline has always consumed.
 */

export const BRIEFING_QUESTIONS = [
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
  { key: "research", ask: "Run a research pass over the topic?" },
];

/** Pre-fill from config/identity.yaml — the remembered defaults, not truth. */
export function initialBriefing(identity) {
  const id = identity ?? {};
  const acad = id.academic ?? {};
  const guide = id.guide ?? {};
  const team = id.team ?? {};
  return {
    title: "",
    team: {
      label: team.label ?? "",
      members: (team.members ?? []).map((m) => ({ name: m.name ?? "", roll: m.roll ?? "", presenting: Boolean(m.presenting) })),
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
    theme: "",
    maxSlides: 0,        // 0 = auto
    slidesPerMember: null,
    density: "balanced",
    research: false,
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
    case "research": return b.research ? "research on" : "no research";
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
    case "research": {
      if (/^(on|yes|y)/i.test(t)) return { briefing: { ...b, research: true }, echo: "research on" };
      if (/^(off|no|n)/i.test(t)) return { briefing: { ...b, research: false }, echo: "no research" };
      return null;
    }
    default: return null;
  }
}
