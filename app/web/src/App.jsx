import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { parseHash, hashFor } from "./lib/router.js";
import HeaderBar from "./components/HeaderBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AuthModal from "./components/AuthModal.jsx";
import ParticleField from "./components/ParticleField.jsx";
import Home from "./views/Home.jsx";
import ChatView from "./views/ChatView.jsx";
import DeckDetail from "./views/DeckDetail.jsx";
import ReportView from "./views/ReportView.jsx";
import ResearchView from "./views/ResearchView.jsx";
import Themes from "./views/Themes.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import { loadChats, saveChat, createChat, deleteChat as deleteChatStore, chatsKey, findEmptyChat } from "./lib/chats.js";
import { BRIEFING_QUESTIONS } from "./lib/briefing.js";

/**
 * The chat-first shell. Logging in is the landing; the chat window is the app.
 * Views: chat (the active conversation), deck, report, themes, home. Settings
 * is a MODAL over any view — opened from the profile chip or the sidebar row —
 * holding presets, identity and the account/cloud controls. A chat persists
 * per account and knows the deck it produced; the deck list in the sidebar
 * shows only your decks.
 */
export default function App() {
  const [user, setUser] = useState(undefined); // undefined = auth still checking
  const [identity, setIdentity] = useState(null);
  const [org, setOrg] = useState("");
  const [view, setView] = useState("chat"); // chat | deck | report | research | themes | home
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeSlug, setActiveSlug] = useState(null);
  const [decks, setDecks] = useState([]);
  const [deckVersion, setDeckVersion] = useState(0);
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("forge.leftNav") !== "0");
  const [railHover, setRailHover] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // login | register — the landing's auth modal
  const [focusSearch, setFocusSearch] = useState(0);

  // Boot: rehydrate the session (a stale token just logs out) and remember the
  // institution. Auth-first — everything else waits for a user. `user` starts
  // undefined (still checking) so a reload never flashes the landing for an
  // authed visitor; it resolves to the session or null before anything renders.
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
    api.identity().then((r) => { setIdentity(r.identity ?? {}); setOrg(r.identity?.institution?.short ?? ""); }).catch(() => {});
  }, []);

  // A logged-in user gets their own chat list; the first visit starts one
  // empty thread so the landing is already a chat. StrictMode double-fires this
  // effect, so the initial-chat guard reads localStorage, not React state. The
  // constant landing after login/register is a NEW chat: the account's empty
  // thread is reused if one exists, so repeated logins never stack empties.
  // Only an explicitly-opened artefact deep link (#/deck/<slug>, #/report/…,
  // #/research/…) overrides it — those are honoured by the boot effect below.
  // The "reopen at last position" restore is gone: a stale chat id in the URL
  // is the last route, not a deep link, so it never wins.
  useEffect(() => {
    if (!user) { setChats([]); setActiveChatId(null); return; }
    let list = loadChats(user.email);
    if (!list.length) {
      const c = createChat();
      saveChat(user.email, c);
      list = [c];
    }
    // New chat is the constant landing — reuse the account's empty thread, or
    // mint one so the landing is always a New chat, not the last route or the
    // decks list. StrictMode double-fires this, but the guard reads storage so
    // the second run reuses the thread the first minted.
    const empty = findEmptyChat(list, "deck");
    if (empty) {
      setChats(list);
      setActiveChatId(empty.id);
      return;
    }
    const c = createChat();
    saveChat(user.email, c);
    setChats([c, ...list]);
    setActiveChatId(c.id);
  }, [user?.email]);

  // Cross-tab sync. localStorage fires the `storage` event in every OTHER tab
  // when this one writes the chat list, so a middle-clicked tab that is already
  // mounted stays current: it reloads the list and drops the active chat only
  // if the other tab deleted it. (The tab that made the change does not get the
  // event — it already holds the new state.) A produced chat implies a deck may
  // have appeared, so the deck list refreshes too.
  useEffect(() => {
    if (!user) return;
    const onStorage = (e) => {
      if (e.key !== chatsKey(user.email)) return;
      const list = loadChats(user.email);
      setChats(list);
      if (list.some((c) => c.produced)) bumpDeck();
      setActiveChatId((prev) =>
        list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? null),
      );
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user?.email]);

  const bumpDeck = () => setDeckVersion((v) => v + 1);

  useEffect(() => {
    if (!user) { setDecks([]); return; }
    api.decks().then((r) => setDecks(r.decks)).catch(() => setDecks([]));
  }, [user?.email, deckVersion]);

  useEffect(() => localStorage.setItem("forge.leftNav", leftOpen ? "1" : "0"), [leftOpen]);

  // Ctrl+K focuses the sidebar search, Ctrl+N starts a new chat. The handler
  // reads the live chat list through a ref — it binds once per session, so a
  // stale closure would otherwise miss the empty-chat reuse in newChat.
  const chatsRef = useRef(chats);
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFocusSearch((n) => n + 1);
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat("deck", chatsRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user]);

  const hasReportFor = (slug) => decks.find((d) => d.slug === slug)?.report ?? false;

  /**
   * The one creation entry: a new chat, empty thread, welcome message. If the
   * account already holds an EMPTY chat of that kind (nothing sent, nothing
   * produced), "New chat" returns to it instead of stacking another empty row —
   * repeated New-chat clicks stay one thread until a topic is actually sent.
   */
  function newChat(kind = "deck", from = chats) {
    const existing = user ? findEmptyChat(from ?? chats, kind) : null;
    if (existing) {
      setActiveChatId(existing.id);
      navigate("chat", { chatId: existing.id });
      return;
    }
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
      case "home":
        setView(r.view);
        break;
      case "chat":
      default:
        setView("chat");
        // Back/forward restore: the hash's chat id (if the thread is loaded)
        // wins mid-session; on a fresh login the boot effect replaces the
        // hash with a bare #/chat first, so New chat stays the landing.
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

  // Boot and login: the constant landing is New chat (the chats effect picks
  // the account's empty thread). An EXPLICITLY-opened view hash is honoured
  // instead — #/deck/<slug>, #/report/…, #/research/…, and also #/themes,
  // #/home (a middle-clicked nav link must open ITS view, not spawn a New
  // chat). Only a bare chat route (or a stale chat id, which is the last
  // route, not a deep link) resets to #/chat and New chat wins.
  useEffect(() => {
    if (!user) return;
    const r = parseHash(window.location.hash);
    const explicit = r.view !== "chat";
    if (explicit) { applyHash(); return; }
    window.history.replaceState(null, "", "#/chat");
    applyHash();
  }, [user?.email]);

  // The front door for a visitor is the landing page. An empty hash reads as
  // the tour, not a dead chat route.
  useEffect(() => {
    if (user) return;
    if (!window.location.hash) window.history.replaceState(null, "", "#/home");
  }, [user]);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const goHome = () => navigate("chat");

  /** Logging out is consequential (it clears the session) — the confirm lives
   *  with the ProfileChip that triggers it. */
  async function doLogout() {
    try { await api.logout(); } catch { /* token already gone */ }
    // The front door is the landing page — reset the hash so the next
    // login lands on New chat, not the route they were on.
    window.history.replaceState(null, "", "#/home");
    setUser(null);
  }

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

  if (user === undefined) {
    // Auth is still resolving from /api/me. Render nothing but the shell so a
    // reload for a logged-in user never flashes the landing (or the chat) —
    // the resolved user decides which in the next frame.
    return (
      <div className="relative h-full overflow-hidden bg-base">
        <ParticleField className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
      </div>
    );
  }

  if (!user) {
    // The landing page IS the front door. A visitor lands here whatever the
    // hash — an auth-gated deep link (#/deck/<slug>, #/chat/…) redirects to
    // the landing too, and its hash survives so login can honour it. The
    // landing carries the sign-up/login actions (the auth modal).
    return (
      <div className="relative h-full overflow-hidden">
        <ParticleField boost={1.5} className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
        <div className="relative z-10 h-full overflow-y-auto">
          <Home
            user={null}
            onStartChat={() => { setAuthMode("register"); setAuthOpen(true); }}
            onBrowseThemes={() => { setAuthMode("register"); setAuthOpen(true); }}
            onAuth={(mode) => { setAuthMode(mode); setAuthOpen(true); }}
          />
        </div>
        {authOpen && (
          <AuthModal
            mode={authMode}
            onDone={(u) => { setUser(u); setAuthOpen(false); }}
            onClose={() => setAuthOpen(false)}
          />
        )}
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
          onOpenSettings={() => setSettingsOpen(true)}
          user={user}
          onAuthClick={() => setAuthOpen(true)}
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
                user={user}
                identity={identity}
                onOpenSettings={() => setSettingsOpen(true)}
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
            {view === "home" && (
              <Home
                user={user}
                onStartChat={newChat}
                onBrowseThemes={() => navigate("themes")}
              />
            )}
          </main>
        </div>

        {authOpen && (
          <AuthModal
            mode={authMode}
            onDone={(u) => { setUser(u); setAuthOpen(false); }}
            onClose={() => setAuthOpen(false)}
          />
        )}

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          user={user}
          identity={identity}
          onIdentityChanged={(next) => {
            setIdentity(next);
            setOrg(next?.institution?.short ?? "");
          }}
          onLogout={doLogout}
        />
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
          <span className="font-medium text-fg">cloud key</span> — switch in Settings.
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
