// The arrangements a person can pick for a compiled slide, as changes to
// the slide's semantic intent — never coordinates. The compiler still lays
// the slide out; a choice only says how its blocks relate (a sequence, a
// hierarchy, a comparison) and, for some families, how they are arranged.
// A choice is kept on the scene (`layoutChoice`) so that undo, History and
// a theme change all see the same slide the person picked.

export const LAYOUT_CHOICES = [
  { key: "cards", label: "Cards", choice: { relationship: "part-whole" } },
  { key: "compare", label: "Side by side", choice: { relationship: "comparison" } },
  { key: "steps", label: "Steps", choice: { relationship: "sequence", flowDirection: "across" } },
  { key: "steps-down", label: "Steps down", choice: { relationship: "sequence", flowDirection: "down" } },
  { key: "cycle", label: "Cycle", choice: { relationship: "cycle" } },
  { key: "tiers", label: "Tiers", choice: { relationship: "hierarchy", arrangement: "tiers" } },
  { key: "hub", label: "Hub", choice: { relationship: "hierarchy", arrangement: "radial" } },
  { key: "bands", label: "Bands", choice: { relationship: "hierarchy", arrangement: "layers" } },
  { key: "funnel", label: "Funnel", choice: { relationship: "hierarchy", arrangement: "funnel" } },
  { key: "pyramid", label: "Pyramid", choice: { relationship: "hierarchy", arrangement: "pyramid" } },
  { key: "quadrants", label: "Quadrants", choice: { arrangement: "quadrants" } },
  { key: "venn", label: "Overlap", choice: { arrangement: "venn" } },
];

const KEYS = ["relationship", "arrangement", "flowDirection"];

export function sameChoice(a, b) {
  return KEYS.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}

export function choiceKey(choice) {
  if (!choice || KEYS.every((k) => choice[k] === undefined)) return "auto";
  return LAYOUT_CHOICES.find((c) => sameChoice(c.choice, choice))?.key ?? null;
}

// The slide intent with the choice applied. A choice replaces the intent's
// own structural hints outright — a stored recipe or arrangement would
// otherwise outrank the relationship it names.
export function withLayoutChoice(slide, choice) {
  if (!choice || KEYS.every((k) => choice[k] === undefined)) return slide;
  const out = structuredClone(slide);
  const hint = { ...(out.layoutHint ?? {}) };
  delete hint.recipe;
  delete hint.arrangement;
  delete hint.flowDirection;
  if (choice.arrangement !== undefined) hint.arrangement = choice.arrangement;
  if (choice.flowDirection !== undefined) hint.flowDirection = choice.flowDirection;
  if (choice.relationship !== undefined) out.relationship = choice.relationship;
  else delete out.relationship;
  if (Object.keys(hint).length) out.layoutHint = hint; else delete out.layoutHint;
  return out;
}
