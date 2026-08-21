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
import { Privacy, Terms, Contact } from "./views/Legal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ProfileModal from "./components/ProfileModal.jsx";
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
  const [profileOpen, setProfileOpen] = useState(false);
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

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFocusSearch((n) => n + 1);
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat("deck");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user]);

  const hasReportFor = (slug) => decks.find((d) => d.slug === slug)?.report ?? false;

  /**
   * The one creation entry: always check storage directly, not React state,
   * so double-clicks or stale closures cannot stack empty chats.
   */
  function newChat(kind = "deck") {
    if (!user) return;
    const list = loadChats(user.email);
    const existing = findEmptyChat(list, kind);
    if (existing) {
      setActiveChatId(existing.id);
      navigate("chat", { chatId: existing.id });
      // keep React state in sync if storage had an empty we didn't know about
      setChats(list);
      return;
    }
    const c = createChat({ kind });
    saveChat(user.email, c);
    setChats([c, ...list]);
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
      case "privacy":
      case "terms":
      case "contact":
        setView(r.view);
        break;
      case "chat":
      default:
        setView("chat");
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
    const tourView = parseHash(window.location.hash).view;
    const tourLegal = ["privacy","terms","contact"].includes(tourView) ? tourView : null;
    return (
      <div className="relative h-full overflow-hidden bg-base">
        <ParticleField boost={1.8} className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-80" />
        <div className="relative z-10 flex h-full flex-col">
          <TourHeader onAuth={(mode) => { setAuthMode(mode); setAuthOpen(true); }} />
          <div className="flex-1 overflow-y-auto">
            {tourLegal === "privacy" ? <Privacy /> : tourLegal === "terms" ? <Terms /> : tourLegal === "contact" ? <Contact /> : (
              <Home
                user={null}
                onStartChat={() => { setAuthMode("register"); setAuthOpen(true); }}
                onBrowseThemes={() => { setAuthMode("register"); setAuthOpen(true); }}
                onAuth={(mode) => { setAuthMode(mode); setAuthOpen(true); }}
              />
            )}
          </div>
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
          view={view}
          onAuthClick={() => setAuthOpen(true)}
        />

        <div className="isolate flex min-h-0 flex-1">
          {view !== "home" && !["privacy","terms","contact"].includes(view) && (
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
                onOpenProfile={() => setProfileOpen(true)}
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
            {view === "privacy" && <Privacy />}
            {view === "terms" && <Terms />}
            {view === "contact" && <Contact />}
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
          identity={identity}
          onIdentityChanged={(next) => {
            setIdentity(next);
            setOrg(next?.institution?.short ?? "");
          }}
        />
        <ProfileModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          user={user}
          onLogout={doLogout}
        />
      </div>
    </div>
  );
}

function TourHeader({ onAuth }) {
  const [dark, setDark] = useState(() => {
    try {
      const s = localStorage.getItem("forge.theme");
      if (s === "dark" || s === "light") return s === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { localStorage.setItem("forge.theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel/95 px-4 backdrop-blur-md shadow-sm">
      <a href="#/home" className="flex items-center gap-2.5">
        <img src="/logo.svg" alt="Presentation Forge" className="h-8 w-8 rounded-lg shadow-sm ring-1 ring-line/60" />
        <span className="text-[14px] font-semibold tracking-tight">Presentation Forge</span>
      </a>
      <nav className="ml-6 hidden items-center gap-1 sm:flex">
        <a href="#/home" className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-fg bg-sunken">Tour</a>
        <a href="#/themes" onClick={(e) => { e.preventDefault(); onAuth?.("register"); }} className="rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-hover hover:text-fg">Themes</a>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={() => setDark((v) => !v)} aria-label="Toggle theme" className="grid h-8 w-8 place-items-center rounded-md text-fg-faint hover:bg-hover hover:text-fg">
          {dark ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          )}
        </button>
        <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-md text-fg-faint hover:bg-hover hover:text-fg">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 4.42 2.87 8.17 6.84 9.5.5.08.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.1-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.33.85 0 1.7.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.67.92.67 1.85v2.74c0 .26.18.57.69.47A10.02 10.02 0 0 0 22 12.06c0-5.53-4.5-10.02-10-10.02z" /></svg>
        </a>
        <button onClick={() => onAuth?.("login")} className="rounded-full border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">Log in</button>
        <button onClick={() => onAuth?.("register")} className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-hi">Sign up</button>
      </div>
    </header>
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
