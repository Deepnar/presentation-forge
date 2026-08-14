/**
 * The chat store — the new home surface. A chat is a conversation that ends in
 * a deck (or a standalone report); the briefing happens in the thread and the
 * produced artefact's slug links the two. Chats are client-side, persisted per
 * account in localStorage — the deck they produce is server-side and owned by
 * the user, but the conversation itself is pure view state, so it needs no
 * server round-trip.
 */

export const chatsKey = (email) => `forge.chats.${email.toLowerCase()}`;

export function loadChats(email) {
  if (!email) return [];
  try {
    const raw = localStorage.getItem(chatsKey(email));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(email, chats) {
  try {
    localStorage.setItem(chatsKey(email), JSON.stringify(chats));
  } catch { /* storage full or blocked — the conversation is best-effort */ }
}

export function saveChat(email, chat) {
  const chats = loadChats(email);
  const i = chats.findIndex((c) => c.id === chat.id);
  if (i === -1) chats.unshift(chat);
  else chats[i] = chat;
  persist(email, chats);
  return chats;
}

export function deleteChat(email, id) {
  const chats = loadChats(email).filter((c) => c.id !== id);
  persist(email, chats);
  return chats;
}

export function touchChat(email, chat) {
  return saveChat(email, { ...chat, updatedAt: new Date().toISOString() });
}

/**
 * The thread already in hand for this product: an empty chat (nothing sent,
 * nothing produced) that "New chat" should return to rather than stacking
 * another empty row. Only a chat of the same kind is reusable — "New chat"
 * must not land a user in a half-broken report thread.
 */
export function findEmptyChat(chats, kind = "deck") {
  return (chats ?? []).find((c) => c.kind === kind && !c.topic && !c.produced) ?? null;
}

/** A fresh empty thread. Nothing touches the network until the topic is sent. */
export function createChat({ kind = "deck" } = {}) {
  const now = new Date().toISOString();
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    kind,
    title: "New chat",
    topic: "",
    createdAt: now,
    updatedAt: now,
    briefStep: 0,          // briefing questions completed (0..9)
    briefing: {
      title: "",
      team: { label: "", members: [] },
      guide: { name: "", designation: "" },
      academic: { subject: "", year: "", semester: "", exam_type: "" },
      audience: "",
      emphasis: "",
      theme: "",
      maxSlides: 0,        // 0 = auto
      slidesPerMember: null,
      density: "balanced",
      research: false,
    },
    plan: null,            // approved outline (title/subtitle/sections/slides)
    deckSlug: null,        // the deck or report this chat produced
    turns: [],             // post-production deck-edit turn log (user/assistant pairs)
  };
}
