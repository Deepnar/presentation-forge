/**
 * Hash-based view routing for the SPA. The whole app is `view` state in the
 * shell; the hash is the only part of the URL that can change without a server
 * round-trip, so it is the natural home for "which view, which deck" — a back
 * press then walks chat → deck → home, and a `#/deck/<slug>` URL reopens the
 * exact view on reload. Pure helpers here are unit-tested; the shell wires them
 * to state via a single `hashchange` listener.
 *
 *   #/chat[/<chatId>]   the active conversation
 *   #/deck/<slug>       deck detail       #/report/<slug>   report view
 *   #/research/<slug>   research view     #/themes          theme gallery
 *   #/identity          identity          #/home            the landing page
 *   (empty)             home = chat
 */

/** A hash string ("#/deck/<slug>") → { view, slug?, chatId? }. Unknown routes
 *  and malformed slugs fall back to the chat view — never a dead screen. */
export function parseHash(hash) {
  const parts = String(hash ?? "")
    .replace(/^#/, "")
    .split("/")
    .filter(Boolean);
  const [kind, ...rest] = parts;
  switch (kind) {
    case "deck":
    case "report":
    case "research":
      return rest[0] ? { view: kind, slug: rest[0] } : { view: "chat" };
    case "themes":
      return { view: "themes" };
    case "identity":
      return { view: "identity" };
    case "home":
      return { view: "home" };
    case "chat":
      return { view: "chat", chatId: rest[0] || null };
    default:
      return { view: "chat" };
  }
}

/** The reverse: a view + optional target → the hash to push. A deck/report/
 *  research view without a slug is meaningless and resolves to home. */
export function hashFor(view, { slug, chatId } = {}) {
  switch (view) {
    case "deck":
      return slug ? `#/deck/${slug}` : "#/chat";
    case "report":
      return slug ? `#/report/${slug}` : "#/chat";
    case "research":
      return slug ? `#/research/${slug}` : "#/chat";
    case "themes":
      return "#/themes";
    case "identity":
      return "#/identity";
    case "home":
      return "#/home";
    case "chat":
    default:
      return chatId ? `#/chat/${chatId}` : "#/chat";
  }
}
