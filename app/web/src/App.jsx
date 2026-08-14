import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { parseHash, hashFor } from "./lib/router.js";
import HeaderBar from "./components/HeaderBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AuthModal from "./components/AuthModal.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import ParticleField from "./components/ParticleField.jsx";
import Home from "./views/Home.jsx";
import ChatView from "./views/ChatView.jsx";
import DeckDetail from "./views/DeckDetail.jsx";
import ReportView from "./views/ReportView.jsx";
import ResearchView from "./views/ResearchView.jsx";
import Themes from "./views/Themes.jsx";
import Identity from "./views/Identity.jsx";
import { loadChats, saveChat, createChat, deleteChat as deleteChatStore } from "./lib/chats.js";
import { BRIEFING_QUESTIONS } from "./lib/briefing.js";

/**
 * The chat-first shell. Logging in is the landing; the chat window is the app.
 * Views: chat (the active conversation), deck, report, themes, identity. A
 * chat persists per account and knows the deck it produced; the deck list in
 * the sidebar shows only your decks. The old wizard form and the standalone
 * outline view are gone — the briefing and the outline gate both live in the
 * chat thread.
 */
export default function App() {
  const [user, setUser] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [org, setOrg] = useState("");
  const [view, setView] = useState("chat"); // chat | deck | report | research | themes | identity | home
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeSlug, setActiveSlug] = useState(null);
  const [decks, setDecks] = useState([]);
  const [deckVersion, setDeckVersion] = useState(0);
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("forge.leftNav") !== "0");
  const [railHover, setRailHover] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(0);
  // A chat id asked for by the hash before the chat list has loaded (a deep
  // link on a cold start) — the chats effect resolves it once the list is in.
  const pendingChatIdRef = useRef(null);

  // Boot: rehydrate the session (a stale token just logs out) and remember the
  // institution. Auth-first — everything else waits for a user.
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
    api.identity().then((r) => { setIdentity(r.identity ?? {}); setOrg(r.identity?.institution?.short ?? ""); }).catch(() => {});
  }, []);

  // A logged-in user gets their own chat list; the first visit starts one
  // empty thread so the landing is already a chat. StrictMode double-fires this
  // effect, so the initial-chat guard reads localStorage, not React state. The
  // hash's chat id (a deep link, or a back-press restore) wins over the
  // previously active chat once the list is in.
  useEffect(() => {
    if (!user) { setChats([]); setActiveChatId(null); return; }
    let list = loadChats(user.email);
    if (!list.length) {
      const c = createChat();
      saveChat(user.email, c);
      list = [c];
    }
    setChats(list);
    setActiveChatId((prev) => {
      // The hash's chat id wins (a deep link, or a back-press restore). It may
      // not have reached the ref yet on a cold-start login — read the hash too.
      const want = pendingChatIdRef.current ?? parseHash(window.location.hash).chatId;
      if (want && list.some((c) => c.id === want)) return want;
      return prev && list.some((c) => c.id === prev) ? prev : list[0].id;
    });
  }, [user?.email]);

  useEffect(() => {
    if (!user) { setDecks([]); return; }
    api.decks().then((r) => setDecks(r.decks)).catch(() => setDecks([]));
  }, [user?.email, deckVersion]);

  useEffect(() => localStorage.setItem("forge.leftNav", leftOpen ? "1" : "0"), [leftOpen]);

  // Ctrl+K focuses the sidebar search, Ctrl+N starts a new chat.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFocusSearch((n) => n + 1);
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user]);

  const bumpDeck = () => setDeckVersion((v) => v + 1);
  const hasReportFor = (slug) => decks.find((d) => d.slug === slug)?.report ?? false;

  /** The one creation entry: a new chat, empty thread, welcome message. */
  function newChat(kind = "deck") {
    const c = createChat({ kind });
    if (user) saveChat(user.email, c);
    setChats((list) => [c, ...list]);
    setActiveChatId(c.id);
    navigate("chat", { chatId: c.id });
  }

  function openChat(id) {
    setActiveChatId(id);
    navigate("chat", { chatId: id });
  }

  /** Persist a chat the view changed (briefing progress, produced deck, …). */
  function handleChatChanged(chat) {
    if (!user) return;
    saveChat(user.email, chat);
    setChats((list) => {
      const i = list.findIndex((c) => c.id === chat.id);
      return i === -1 ? [chat, ...list] : list.map((c) => (c.id === chat.id ? chat : c));
    });
    if (chat.produced && chat.deckSlug) bumpDeck();
  }

  /**
   * The one place view changes meet the URL. Every navigation pushes a hash
   * entry, so the browser back button walks the same route the user walked
   * forward (chat → deck → home) instead of exiting the site. Non-navigation
   * actions (toggles, modals, renders) never call this.
   */
  function navigate(view, opts = {}) {
    pendingChatIdRef.current = null;
    const h = hashFor(view, opts);
    if (window.location.hash === h) return applyHash();
    window.location.hash = h; // pushes a history entry and fires hashchange
  }

  /** Hash → shell state. The single consumer of the URL for both navigation
   *  pushes and back/forward restores, so the two can never drift apart. */
  function applyHash() {
    const r = parseHash(window.location.hash);
    switch (r.view) {
      case "deck":
      case "report":
      case "research":
        if (r.slug) {
          setActiveSlug(r.slug);
          setView(r.view);
        } else {
          setView("chat");
        }
        break;
      case "themes":
      case "identity":
      case "home":
        setView(r.view);
        break;
      case "chat":
      default:
        setView("chat");
        pendingChatIdRef.current = r.chatId || null;
        // The list is already loaded most of the time (back/forward); the
        // chats effect resolves the id when this runs before it is.
        if (r.chatId && chats.some((c) => c.id === r.chatId)) setActiveChatId(r.chatId);
        break;
    }
  }

  // Back/forward and manual hash edits restore the view they name.
  useEffect(() => {
    const onHash = () => applyHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });

  // Boot and login: an empty hash gets the home route (without a history
  // entry), and any hash — a deep link the user opened while logged out
  // included — is applied once there is a session to apply it to.
  useEffect(() => {
    if (!user) return;
    if (!window.location.hash) window.history.replaceState(null, "", "#/chat");
    applyHash();
  }, [user?.email]);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const goHome = () => navigate("chat");

  const openDeck = (slug) => navigate("deck", { slug });
  const openReport = (slug) => navigate("report", { slug });
  const openResearch = (slug) => navigate("research", { slug });

  /** Delete a chat thread locally; if it was active, land on another. */
  function handleDeleteChat(id) {
    if (!user) return;
    const remaining = deleteChatStore(user.email, id);
    setChats(remaining);
    if (activeChatId !== id) return;
    const next = remaining[0] ?? null;
    if (next) {
      setActiveChatId(next.id);
      navigate("chat", { chatId: next.id });
    } else {
      const c = createChat();
      saveChat(user.email, c);
      setChats([c]);
      setActiveChatId(c.id);
      navigate("chat", { chatId: c.id });
    }
  }

  /** Delete decks/<slug> server-side, then leave it if it was open. */
  async function handleDeleteDeck(slug) {
    try {
      await api.deleteDeck(slug);
    } catch (err) {
      window.alert(`Could not delete deck: ${err.message}`);
      return;
    }
    bumpDeck();
    if (activeSlug === slug && (view === "deck" || view === "report" || view === "research")) goHome();
  }

  /**
   * The reverse flow's chat: a report's plan arrives already made, so the chat
   * skips the briefing and lands straight on the outline gate — same surface,
   * same approve step, no second wizard.
   */
  function startCompanionChat(slug, plan, theme = "") {
    const c = createChat();
    const now = new Date().toISOString();
    const companion = {
      ...c,
      title: plan.title ?? "Companion deck",
      topic: plan.title ?? "Companion deck",
      briefStep: BRIEFING_QUESTIONS.length,
      briefing: { ...c.briefing, theme, title: plan.title ?? "" },
      plan,
      deckSlug: slug,
      updatedAt: now,
    };
    if (user) saveChat(user.email, companion);
    setChats((list) => [companion, ...list]);
    setActiveChatId(companion.id);
    navigate("chat", { chatId: companion.id });
  }

  if (!user) {
    const route = parseHash(window.location.hash);
    // The landing page is public — full-bleed, no auth gate. Any other route
    // (or an empty hash) is the login screen.
    if (route.view === "home") {
      return (
        <div className="relative h-full overflow-hidden">
          <ParticleField boost={1.5} className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
          <div className="relative z-10 h-full overflow-y-auto">
            <Home
              onStartChat={() => { navigate("chat"); }}
              onBrowseThemes={() => navigate("themes")}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="relative h-full overflow-hidden">
        <ParticleField boost={1.5} className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
        <div className="relative z-10 h-full">
          <LoginScreen onDone={(u) => setUser(u)} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      <ParticleField paused={railHover} className="pointer-events-none fixed inset-0 z-0 h-full w-full" />

      <div className="relative z-10 flex h-full flex-col">
        <HeaderBar
          leftOpen={leftOpen}
          onToggleLeft={() => setLeftOpen((o) => !o)}
          onHome={goHome}
          onOpenIdentity={() => setView("identity")}
          user={user}
          onAuthClick={() => setAuthOpen(true)}
          onLogout={async () => {
            try { await api.logout(); } catch { /* token already gone */ }
            setUser(null);
          }}
        />

        <div className="isolate flex min-h-0 flex-1">
          {view !== "home" && (
            <div
              onMouseEnter={() => setRailHover(true)}
              onMouseLeave={() => setRailHover(false)}
              className="flex"
            >
              <Sidebar
                chats={chats}
                decks={decks}
                activeChatId={activeChatId}
                activeSlug={view === "deck" || view === "report" || view === "research" ? activeSlug : null}
                view={view}
                open={leftOpen}
                focusSearch={focusSearch}
                onOpenChat={openChat}
                onOpenDeck={openDeck}
                onOpenReport={openReport}
                onNewChat={newChat}
                onDeleteChat={handleDeleteChat}
                onDeleteDeck={handleDeleteDeck}
              />
            </div>
          )}

          <main key={view === "chat" ? `chat-${activeChatId ?? "none"}` : view} className="view-in relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <FirstRunHint userEmail={user.email} />
            {view === "chat" && activeChat && (
              <ChatView
                chat={activeChat}
                identity={identity}
                onChatChanged={handleChatChanged}
                onOpenDeck={openDeck}
                onOpenReport={openReport}
                onDeckChanged={bumpDeck}
                onIdentityChanged={(next) => {
                  setIdentity(next);
                  setOrg(next?.institution?.short ?? "");
                }}
              />
            )}
            {view === "chat" && !activeChat && (
              <div className="flex h-full items-center justify-center">
                <button onClick={() => newChat()} className="pill px-3 py-1.5 text-[12px] text-fg-muted transition hover:bg-hover hover:text-fg">
                  Start a new chat
                </button>
              </div>
            )}
            {view === "deck" && activeSlug && (
              <DeckDetail
                slug={activeSlug}
                hasReport={hasReportFor(activeSlug)}
                refreshToken={deckVersion}
                onBack={goHome}
                onDeckChanged={bumpDeck}
                onOpenDeck={(s) => { navigate("deck", { slug: s }); bumpDeck(); }}
                onOpenResearch={openResearch}
                onOpenReport={openReport}
              />
            )}
            {view === "report" && activeSlug && (
              <ReportView
                slug={activeSlug}
                refreshToken={deckVersion}
                onBack={goHome}
                onDeckChanged={bumpDeck}
                onPlanReady={(plan) => startCompanionChat(activeSlug, plan)}
              />
            )}
            {view === "research" && activeSlug && (
              <ResearchView
                slug={activeSlug}
                refreshToken={deckVersion}
                onBack={goHome}
              />
            )}
            {view === "themes" && <Themes />}
            {view === "identity" && (
              <Identity
                user={user}
                onAuthClick={() => setAuthOpen(true)}
              />
            )}
            {view === "home" && (
              <Home
                onStartChat={newChat}
                onBrowseThemes={() => navigate("themes")}
              />
            )}
          </main>
        </div>

        {authOpen && (
          <AuthModal
            onDone={(u) => { setUser(u); setAuthOpen(false); }}
            onClose={() => setAuthOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * A one-time, dismissible first-run toast explaining where models come from —
 * the only setup a fresh server needs. Shown once per account (localStorage),
 * never again, and never a wizard.
 */
function FirstRunHint({ userEmail }) {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(`forge.hint.models.${userEmail ?? ""}`) !== "1";
    } catch {
      return true;
    }
  });
  const dismiss = () => {
    try { localStorage.setItem(`forge.hint.models.${userEmail ?? ""}`, "1"); } catch {}
    setShow(false);
  };
  if (!show) return null;
  return (
    <div className="toast-in absolute right-4 top-3 z-30">
      <div className="flex items-center gap-2.5 rounded-full border border-line-strong bg-panel py-1.5 pl-3.5 pr-1.5 shadow-[var(--shadow-float)]">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-tint text-accent">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" />
          </svg>
        </span>
        <span className="whitespace-nowrap text-[12px] text-fg-muted">
          Models come from <span className="font-medium text-fg">Ollama</span> or your{" "}
          <span className="font-medium text-fg">cloud key</span> — switch in Identity.
        </span>
        <button
          onClick={dismiss}
          className="grid h-6 w-6 place-items-center rounded-full text-fg-faint transition hover:bg-hover hover:text-fg"
          title="Dismiss"
          aria-label="Dismiss first-run hint"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
