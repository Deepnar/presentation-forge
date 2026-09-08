
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
      return rest[0] ? { view: kind, slug: rest[0] } : { view: "chat" };
    case "reset":
    case "verify":
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
