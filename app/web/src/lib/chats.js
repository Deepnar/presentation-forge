/**
 * The chat store — the new home surface. A chat is a conversation that ends in
 * a deck (or a standalone report); the briefing happens in the thread and the
 * produced artefact's slug links the two. Chats are client-side, persisted per
 * account in localStorage — the deck they produce is server-side and owned by
 * the user, but the conversation itself is pure view state, so it needs no
 * server round-trip.
 */

export const chatsKey = (email) => `forge.chats.${email.toLowerCase()}`;

export function normalizeChat(raw) {
  if (!raw || typeof raw !== "object") return createChat();
  const c = { ...raw };
  c.kind = c.kind === "report" ? "report" : "deck";
  c.title = typeof c.title === "string" && c.title.trim() ? c.title : (typeof c.topic === "string" && c.topic.trim() ? c.topic.trim().slice(0, 48) : "New chat");
  c.topic = typeof c.topic === "string" ? c.topic : "";
  c.briefStep = Number.isFinite(c.briefStep) ? c.briefStep : 0;
  c.createdAt = c.createdAt || c.updatedAt || new Date().toISOString();
  c.updatedAt = c.updatedAt || c.createdAt || new Date().toISOString();
  c.plan = c.plan ?? null;
  c.deckSlug = c.deckSlug ?? null;
  c.turns = Array.isArray(c.turns) ? c.turns : [];
  c.selectedSlides = Array.isArray(c.selectedSlides) ? c.selectedSlides : [];
  c.produced = Boolean(c.produced);
  if (typeof c.error === "string" && c.error.trim()) c.error = c.error;
  else delete c.error;
  if (typeof c.model === "string" && c.model.trim()) c.model = c.model;
  else delete c.model;
  if (Array.isArray(c.deckThumbs)) c.deckThumbs = c.deckThumbs;
  else if (c.deckThumbs != null) delete c.deckThumbs;

  const b = c.briefing && typeof c.briefing === "object" ? { ...c.briefing } : {};
  b.title = typeof b.title === "string" ? b.title : "";
  b.presetId = b.presetId ?? null;
  b.unskip = Array.isArray(b.unskip) ? b.unskip : [];
  const team = b.team && typeof b.team === "object" ? b.team : {};
  b.team = {
    label: typeof team.label === "string" ? team.label : "",
    members: Array.isArray(team.members)
      ? team.members.map((m) => ({
          name: typeof m?.name === "string" ? m.name : "",
          roll: typeof m?.roll === "string" ? m.roll : "",
          presenting: Boolean(m?.presenting),
        }))
      : [],
  };
  const guide = b.guide && typeof b.guide === "object" ? b.guide : {};
  b.guide = {
    name: typeof guide.name === "string" ? guide.name : "",
    designation: typeof guide.designation === "string" ? guide.designation : "",
  };
  const acad = b.academic && typeof b.academic === "object" ? b.academic : {};
  b.academic = {
    subject: typeof acad.subject === "string" ? acad.subject : "",
    year: typeof acad.year === "string" ? acad.year : "",
    semester: typeof acad.semester === "string" ? acad.semester : "",
    exam_type: typeof acad.exam_type === "string" ? acad.exam_type : "",
  };
  b.thesis = typeof b.thesis === "string" ? b.thesis : "";
  b.audience = typeof b.audience === "string" ? b.audience : "";
  b.emphasis = typeof b.emphasis === "string" ? b.emphasis : "";
  b.evidence = typeof b.evidence === "string" ? b.evidence : "";
  b.theme = typeof b.theme === "string" ? b.theme : "";
  b.maxSlides = Number.isFinite(b.maxSlides) ? b.maxSlides : 0;
  b.slidesPerMember = b.slidesPerMember == null ? null : (Number.isFinite(Number(b.slidesPerMember)) ? Number(b.slidesPerMember) : null);
  b.density = ["sparse", "balanced", "dense"].includes(b.density) ? b.density : "balanced";
  b.branding = ["full", "minimal", "none"].includes(b.branding) ? b.branding : "full";
  b.depth = ["full", "brief"].includes(b.depth) ? b.depth : "full";
  if (!["web", "upload", "none"].includes(b.researchSource)) {
    // Migrate old `research` boolean — default remains web
    b.researchSource = "web";
  }
  // Auto image supply is opt-in: a chat written before the question existed
  // reads as "none", which is the behaviour it already had.
  b.imageSupply = b.imageSupply === "auto" ? "auto" : "none";
  b.uploadedSource = b.uploadedSource && typeof b.uploadedSource === "object" ? b.uploadedSource : null;
  b.research = Boolean(b.research);
  b.papers = Boolean(b.papers);
  c.briefing = b;
  return c;
}

export function loadChats(email) {
  if (!email) return [];
  try {
    const raw = localStorage.getItem(chatsKey(email));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    let migrated = false;
    const normalized = list.map((c) => {
      const n = normalizeChat(c);
      // Detect if normalization changed shape — shallow json compare
      if (JSON.stringify(n) !== JSON.stringify(c)) migrated = true;
      return n;
    });
    if (migrated) {
      try { localStorage.setItem(chatsKey(email), JSON.stringify(normalized)); } catch {}
    }
    return normalized;
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
      thesis: "",
      team: { label: "", members: [] },
      guide: { name: "", designation: "" },
      academic: { subject: "", year: "", semester: "", exam_type: "" },
      audience: "",
      emphasis: "",
      evidence: "",
      theme: "",
      maxSlides: 0,        // 0 = auto (legacy, collapsed into density)
      slidesPerMember: null,
      density: "balanced",
      researchSource: "web",
      imageSupply: "none",
      uploadedSource: null,
      research: false,
    },
    plan: null,            // approved outline (title/subtitle/sections/slides)
    deckSlug: null,        // the deck or report this chat produced
    turns: [],             // post-production deck-edit turn log (user/assistant pairs)
  };
}
