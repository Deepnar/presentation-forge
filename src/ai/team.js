/**
 * Team-facing facts derived from the merged identity. Shared by the deck
 * planner (generate.js) and the report planner (report.js) so both size their
 * structure to the same team and neither re-derives the "who presents" rule.
 *
 * The placeholder members in a fresh config/identity.yaml have empty names —
 * they exist only to pad the team card — so every helper filters by name
 * before counting, or a default identity would look like an eleven-person
 * team.
 */

/** The member names who present — or every named member when nobody is ticked. */
export function presentingNames(identity) {
  const members = identity?.team?.members ?? [];
  const named = members.filter((m) => m.name?.trim());
  const presenting = named.filter((m) => m.presenting);
  return (presenting.length ? presenting : named).map((m) => m.name.trim());
}

/** How many people this deck is for, in a planning sense. */
export function teamSize(identity) {
  const members = identity?.team?.members ?? [];
  return members.filter((m) => m.name?.trim()).length || 1;
}

/**
 * How many major parts a deck/report should have. One meaningful section per
 * member is the user's rule, capped at the renderer's 8-section ceiling and
 * never lower than `min` (3 for a deck, 4 for a report — the graded core).
 */
export function targetSections(identity, { min = 3, max = 8 } = {}) {
  return Math.min(max, Math.max(min, teamSize(identity)));
}

/**
 * The slide types that are structure, not content. Dividers announce the next
 * part (or close the deck) and are never owned by one member — the presenter
 * split must skip them so an 11-person group with 11 slides does not hand a
 * divider to somebody.
 */
export const DIVIDER_TYPES = new Set(["title", "section", "chapter", "closing", "epigraph"]);

/**
 * Distribute presenting members across a deck's CONTENT slides so every
 * member's slides form one contiguous block.
 *
 * The old approach asked the writer model to "pick the next presenter" per
 * slide, which scattered: one member got two separated slides, another got one
 * section here and another later. This is the single source of truth now —
 * presenter assignment is deterministic and centralised.
 *
 * Rules:
 * - Dividers (title/section/chapter/closing/epigraph) never carry a presenter.
 * - Content slides are grouped by their `section` index (in order of first
 *   appearance) and whole sections are assigned to members IN ORDER, so a
 *   member's slides are the contiguous run from their section's divider to the
 *   next divider.
 * - With at least as many members as sections, each section goes to its own
 *   member (member i takes section i) — nobody is doubled up while another
 *   member sits idle when the section count allows.
 * - With fewer members than sections, the sections are partitioned into
 *   contiguous blocks sized as evenly as whole sections allow — block sizes
 *   differ by at most one slide where the section sizes permit.
 * - A briefing `slidesPerMember` overrides the automatic split's per-member
 *   target but still produces contiguous blocks; the residual (more or fewer
 *   slides than members × target) lands at the end.
 *
 * Returns a parallel array over `slides`: the presenter name or null.
 */
export function distributePresenters(slides, members, { slidesPerMember = null } = {}) {
  const names = (members ?? []).map(String).filter(Boolean);
  const out = new Array(slides.length).fill(null);
  if (!names.length) return out;

  // Group content slides by section, in order of first appearance. A slide
  // with no section index defaults to 0 so CLI-authored decks stay coherent.
  const order = [];
  const bySection = new Map();
  for (let i = 0; i < slides.length; i++) {
    if (DIVIDER_TYPES.has(slides[i].type)) continue;
    const sec = slides[i].section ?? 0;
    if (!bySection.has(sec)) { bySection.set(sec, []); order.push(sec); }
    bySection.get(sec).push(i);
  }
  if (!order.length) return out;

  const n = names.length;
  const sizes = order.map((sec) => bySection.get(sec).length);
  const total = sizes.reduce((a, b) => a + b, 0);

  // Which member owns each section. Whole sections never split.
  const memberOf = new Array(order.length).fill(-1);
  if (order.length <= n) {
    // One section per member, in order; extra members stay silent. This is the
    // "5 sections, 5 members → each presents their own section" case.
    order.forEach((_, i) => { memberOf[i] = i; });
  } else {
    const targets = slidesPerMember
      ? names.map(() => slidesPerMember)
      : (() => { const base = Math.floor(total / n); const rem = total % n; return names.map((_, i) => (i < rem ? base + 1 : base)); })();
    let m = 0;
    let run = 0;
    for (let i = 0; i < order.length; i++) {
      // Start the next member once this section would push the current one past
      // its target — but never strand the last member, and only cut after the
      // current member has something.
      if (m < n - 1 && run > 0 && run + sizes[i] > targets[m]) { m++; run = 0; }
      memberOf[i] = m;
      run += sizes[i];
    }
  }

  for (let i = 0; i < order.length; i++) {
    const name = names[memberOf[i]];
    for (const idx of bySection.get(order[i])) out[idx] = name;
  }
  return out;
}
