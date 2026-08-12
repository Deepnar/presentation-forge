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
