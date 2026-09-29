import { chatJSON } from "./ollama.js";
import { presentingNames } from "./team.js";

export const MAX_SUBTOPICS = 8;

export const clampSubtopics = (n) => Math.min(MAX_SUBTOPICS, Math.max(1, Math.floor(Number(n) || 0) || 1));

export function subtopicCountFor({ mode, subtopicCount, identity } = {}) {
  if (Number(subtopicCount) > 0) return clampSubtopics(subtopicCount);
  if (mode === "solo") return 6;
  const members = presentingNames(identity).length;
  return clampSubtopics(members || 3);
}

const subtopicSchema = () => ({
  type: "object",
  required: ["title", "subtopics"],
  properties: {
    title: { type: "string", maxLength: 52 },
    subtopics: {
      type: "array",
      minItems: 1,
      maxItems: MAX_SUBTOPICS,
      items: {
        type: "object",
        required: ["title", "focus"],
        properties: {
          title: { type: "string", maxLength: 40 },
          focus: {
            type: "string",
            maxLength: 160,
            description: "What this part must establish. One specific sentence.",
          },
        },
      },
    },
  },
});

export function sanitizeSubtopics(list) {
  const seen = new Set();
  const out = [];
  for (const s of list ?? []) {
    const title = String(s?.title ?? "").trim().slice(0, 40);
    const focus = String(s?.focus ?? "").trim().slice(0, 160);
    if (!title || !focus) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, focus });
  }
  return out.slice(0, MAX_SUBTOPICS);
}

export function ownersFor(subtopics, members) {
  const names = (members ?? []).map(String).filter(Boolean);
  if (!names.length) return subtopics.map(() => null);
  const out = [];
  let m = 0;
  let run = 0;
  for (let i = 0; i < subtopics.length; i++) {
    const remaining = subtopics.length - i;
    const membersLeft = names.length - m;
    const target = Math.max(1, Math.ceil(remaining / membersLeft));
    if (m < names.length - 1 && run >= target) { m++; run = 0; }
    out.push(names[m]);
    run++;
  }
  return out;
}

export async function planSubtopics({ brief, briefing = "", identity, count, model, signal, chat = chatJSON }) {
  const members = presentingNames(identity);
  const want = clampSubtopics(count ?? subtopicCountFor({ identity }));
  const teamNote = members.length
    ? `The team of ${members.length} presenting members (${members.join(", ")}) presents together — parts are shared out whole, one member may own several.`
    : "Plan the talk as three to eight major parts.";

  const system = [
    "You split a presentation topic into ordered subtopics. You do not write slide content, and you do NOT browse — this is your own structuring judgement.",
    "A strong split is judged by one thing: after the last part, the audience remembers the takeaway and can act on it. Split for that.",
    "",
    "Rules:",
    "- Order the parts as a talk flows: open on the topic, then an INTRO part framing it for THIS audience, then the body in a sensible story arc, then a CLOSING part landing the takeaway.",
    "- Titles are short — two to four words each.",
    "- `focus` states what that part must establish — ONE specific sentence under ~140 characters, with a concrete angle, never a restatement of the title.",
    "- If the briefing contains a Thesis/takeaway line, it is the talk's central claim — every part must serve it; the closing lands that sentence.",
    "- The audience and emphasis answers are strategy: the ideas marked 'most important' must own the most parts. Cut anything that doesn't serve the takeaway.",
    `- Split into about ${want} parts.`,
    teamNote,
  ].join("\n");

  const ask = async () => {
    const res = await chat({
      role: "author",
      model,
      signal,
      schema: subtopicSchema(),
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [`BRIEF\n${brief}`, briefing ? `\n${briefing}` : ""].filter(Boolean).join("\n"),
        },
      ],
    });
    return { res, subtopics: sanitizeSubtopics(res.data?.subtopics ?? []) };
  };

  let { res, subtopics } = await ask();
  if (subtopics.length < Math.min(want, MAX_SUBTOPICS)) {
    const retry = await ask();
    if (retry.subtopics.length > subtopics.length) ({ res, subtopics } = retry);
  }
  return { subtopics, stats: { model: res.model, want, planned: subtopics.length } };
}
