
const focus = new Map(); // slug -> { index, at }

export const deckContext = {
  focusSlide(slug, index) {
    focus.set(slug, { index, at: Date.now() });
  },
  focusedSlide(slug) {
    return focus.get(slug) ?? null;
  },
};
