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
 *   appearance) and sections are assigned to members IN ORDER, so a member's
 *   slides are the contiguous run from their section's divider to the next
 *   divider.
 * - With more sections than members, whole sections are partitioned into
 *   contiguous blocks sized as evenly as whole sections allow — block sizes
 *   differ by at most one slide where the section sizes permit, and a section
 *   is never split.
 * - With at least as many members as sections, the CONTENT SLIDES themselves
 *   are the unit: every presenting member gets at least one slide when the
 *   count allows, block sizes stay within one slide of each other, and a
 *   section's slides may be shared between adjacent members so nobody is
 *   stranded without a section of their own. The one exception is exactly as
 *   many members as sections and no briefing target — then member i takes
 *   section i, whole, which is the "each member presents their own part" rule.
 * - A briefing `slidesPerMember` overrides the automatic per-member target in
 *   BOTH branches but still produces contiguous blocks; the residual (more or
 *   fewer slides than members × target) distributes at balance ≤1, never
 *   stranding a member who could present.
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

  if (order.length > n) {
    // More sections than members: whole sections never split. Members own
    // contiguous runs of sections, sized as evenly as whole sections allow.
    const targets = slidesPerMember
      ? names.map(() => slidesPerMember)
      : balancedTargets(total, n);
    let m = 0;
    let run = 0;
    for (let i = 0; i < order.length; i++) {
      // Start the next member once this section would push the current one past
      // its target — but never strand the last member, and only cut after the
      // current member has something.
      if (m < n - 1 && run > 0 && run + sizes[i] > targets[m]) { m++; run = 0; }
      const name = names[m];
      for (const idx of bySection.get(order[i])) out[idx] = name;
      run += sizes[i];
    }
  } else if (order.length === n && !slidesPerMember) {
    // Exactly as many members as sections and no briefing target: member i
    // takes section i, whole — the "each member presents their own part" rule,
    // and nobody is doubled up while another sits idle.
    order.forEach((sec, i) => {
      for (const idx of bySection.get(sec)) out[idx] = names[i];
    });
  } else {
    // More members than sections (or a slidesPerMember briefing): distribute
    // the CONTENT SLIDES themselves so every member gets at least one when the
    // count allows, as contiguous runs sized within one slide of each other.
    // A section is a planning hint here, not a boundary — a member with no
    // section of their own takes a contiguous share of a neighbouring
    // section's slides rather than staying silent.
    //
    // The balanced split is what honours slidesPerMember here: a deck sized to
    // the briefing (11 members × 1-per-person → 11 content slides) hands every
    // member exactly their target, and a surplus distributes at balance ≤1
    // instead of piling the residual onto the trailing members.
    const targets = balancedTargets(total, n);
    let m = 0;
    let run = 0;
    for (const idx of contentOrder(bySection, order)) {
      // Start the next member once the current one has hit its target — but
      // never strand the last member, and only move on when the current member
      // already has something.
      if (m < n - 1 && run > 0 && run >= targets[m]) { m++; run = 0; }
      out[idx] = names[m];
      run++;
    }
  }
  return out;
}

/** The maximally-balanced per-member slide counts: differ by at most one. */
function balancedTargets(total, n) {
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => (i < rem ? base + 1 : base));
}

/** The content slide indices in deck order, flattened from the section map. */
function contentOrder(bySection, order) {
  return order.flatMap((sec) => bySection.get(sec));
}

/**
 * Apply the deterministic presenter split to a whole deck: strip any stray
 * presenter a model slipped onto a divider, then distribute the presenting
 * members across the content slides and write the assignment back onto the
 * deck's slides. This is the ONE place the split is decided — generateDeck,
 * the resume continuation and finalizeDeck all call it, so a deck reaches
 * "ready" presenter-complete no matter which path completed it.
 */
export function assignPresenters(deck, identity, slidesPerMember = null) {
  for (const s of deck.slides) {
    if (DIVIDER_TYPES.has(s.type)) delete s.presenter;
  }
  const presenters = presentingNames(identity);
  const assignment = distributePresenters(deck.slides, presenters, { slidesPerMember });
  for (let i = 0; i < deck.slides.length; i++) {
    if (assignment[i]) deck.slides[i].presenter = assignment[i];
  }
  return deck;
}
