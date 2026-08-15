/**
 * Module-level "where was the user looking" for decks, keyed by slug — the
 * bridge between the deck view's lightbox and the chat's edit turns. When the
 * user opens the deck, steps to slide 7 in the lightbox, and returns to the
 * chat to type "make THIS punchier", the chat reads the focused slide from
 * here and names it in the turn context. Module state survives view mounts
 * (same tab, same session), which is exactly the lifetime this needs.
 */

const focus = new Map(); // slug -> { index, at }

export const deckContext = {
  focusSlide(slug, index) {
    focus.set(slug, { index, at: Date.now() });
  },
  focusedSlide(slug) {
    return focus.get(slug) ?? null;
  },
};
