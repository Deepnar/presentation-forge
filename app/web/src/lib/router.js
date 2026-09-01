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
 *   #/research/<slug>   research view     #/script/<slug>   speaker script
 *   #/themes            theme gallery
 *   #/home              the landing page
 *   #/reset/<token>     set a new password  #/verify/<token>  confirm an address
 *   (empty)             home = chat
 *
 * The two token routes are the only ones a signed-OUT visitor is sent to by
 * name — they arrive from an email, and the whole point is that the person
 * cannot sign in. They carry the token in the fragment because a fragment is
 * never sent to the server and never lands in an access log.
 *
 * Settings is not a route — it is a modal over whatever view is open, opened
 * from the profile chip or the sidebar row. An old #/identity hash resolves to
 * the chat view like any unknown route.
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
    case "script":
      // The four faces of one project. Each is a route rather than local
      // state so a link into any of them survives a reload and the back
      // button walks between them.
      return rest[0] ? { view: kind, slug: rest[0] } : { view: "chat" };
    case "reset":
    case "verify":
      // A link with no token is a mangled email, not a view — say so on the
      // screen that can do something about it rather than silently going home.
      return { view: kind, token: rest[0] ?? null };
    case "themes":
      return { view: "themes" };
    case "tour-themes":
      return { view: "tour-themes" };
    case "home":
      return { view: "home" };
    case "privacy":
      return { view: "privacy" };
    case "terms":
      return { view: "terms" };
    case "contact":
      return { view: "contact" };
    case "docs":
      return { view: "docs" };
    case "usage":
      return { view: "usage" };
    case "chat":
      return { view: "chat", chatId: rest[0] || null };
    case "admin":
      return { view: "admin" };
    default:
      return { view: "chat" };
  }
}

/** The reverse: a view + optional target → the hash to push. A deck/report/
 *  research view without a slug is meaningless and resolves to home. */
export function hashFor(view, { slug, chatId, token } = {}) {
  switch (view) {
    case "deck":
      return slug ? `#/deck/${slug}` : "#/chat";
    case "report":
      return slug ? `#/report/${slug}` : "#/chat";
    case "research":
      return slug ? `#/research/${slug}` : "#/chat";
    case "script":
      return slug ? `#/script/${slug}` : "#/chat";
    case "reset":
    case "verify":
      return token ? `#/${view}/${token}` : "#/chat";
    case "themes":
      return "#/themes";
    case "tour-themes":
      return "#/tour-themes";
    case "home":
      return "#/home";
    case "privacy":
      return "#/privacy";
    case "terms":
      return "#/terms";
    case "contact":
      return "#/contact";
    case "docs":
      return "#/docs";
    case "usage":
      return "#/usage";
    case "admin":
      return "#/admin";
    case "chat":
    default:
      return chatId ? `#/chat/${chatId}` : "#/chat";
  }
}
