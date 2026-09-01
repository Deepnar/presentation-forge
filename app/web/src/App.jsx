import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { parseHash, hashFor } from "./lib/router.js";
import HeaderBar from "./components/HeaderBar.jsx";
import ParticleField from "./components/ParticleField.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AuthModal from "./components/AuthModal.jsx";
import Home from "./views/Home.jsx";
import ChatView from "./views/ChatView.jsx";
import DeckDetail from "./views/DeckDetail.jsx";
import ReportView from "./views/ReportView.jsx";
import ResearchView from "./views/ResearchView.jsx";
import Themes from "./views/Themes.jsx";
import TourThemes from "./views/TourThemes.jsx";
import { Privacy, Terms, Contact, Docs, Usage } from "./views/Legal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ProfileModal from "./components/ProfileModal.jsx";
import Admin from "./views/Admin.jsx";
import { loadChats, saveChat, createChat, deleteChat as deleteChatStore, chatsKey, findEmptyChat, normalizeChat } from "./lib/chats.js";
import { BRIEFING_QUESTIONS } from "./lib/briefing.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

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
  const [pendingChat, setPendingChat] = useState(null);
  const [activeSlug, setActiveSlug] = useState(null);
  const [decks, setDecks] = useState([]);
  const [deckVersion, setDeckVersion] = useState(0);
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("forge.leftNav") !== "0");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // login | register — the landing's auth modal
  const [focusSearch, setFocusSearch] = useState(0);

  // Boot: rehydrate the session (a stale token just logs out) and remember the
  // institution. Auth-first — everything else waits for a user. `user` starts
  // undefined (still checking) so a reload never flashes the landing for an
  // authed visitor; it resolves to the session or null before anything renders.
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  // Identity is per account, and reading it needs a session — institution,
  // department and guide are the personal details the file is gitignored to
  // protect, so an anonymous visitor is not told them. Refetched on sign-in and
  // cleared on sign-out so one account's college never lingers into another's.
  useEffect(() => {
    if (!user) { setIdentity({}); setOrg(""); return; }
    api.identity()
      .then((r) => { setIdentity(r.identity ?? {}); setOrg(r.identity?.institution?.short ?? ""); })
      .catch(() => {});
  }, [user?.email]);

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
    if (!user) { setChats([]); setActiveChatId(null); setPendingChat(null); return; }
    const list = loadChats(user.email);
    setChats(list);
    // If there's a pending chat already, keep it
    if (pendingChat && !pendingChat.topic) return;
    if (!list.length) {
      const c = createChat();
      setPendingChat(c);
      setActiveChatId(c.id);
      return;
    }
    const empty = findEmptyChat(list, "deck");
    if (empty) {
      setActiveChatId(empty.id);
      setPendingChat(null);
      return;
    }
    // No empty chat — show pending new chat as landing, not yet saved
    const c = createChat();
    setPendingChat(c);
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
  // Mirrors the server's isAdmin(): the role, and nothing derived from the
  // address. The Admin routes enforce this server-side regardless.
  const isAdminUser = Boolean(user && user.role === "admin");

  const isTourView = view === "home" || ["privacy","terms","contact","docs","tour-themes","usage"].includes(view);
  const isChatView = view === "chat";
  // Landing header auto-hide on scroll (immersive), reappear at footer — only for home
  useEffect(() => {
    if (view !== "home") return;
    const header = document.querySelector("header");
    if (!header) return;
    header.style.transition = "transform var(--dur-shell) var(--ease-shell)";
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        lastY = y;
        const footer = document.querySelector("footer");
        const footerVisible = footer && footer.getBoundingClientRect().top < window.innerHeight;
        if (footerVisible || y < 80 || delta < 0) {
          header.style.transform = "translateY(0)";
        } else if (delta > 0 && y > 100) {
          header.style.transform = "translateY(-100%)";
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isTourView, view]);

  /**
   * The one creation entry: lazy — don't spawn in the sidebar until the
   * first prompt is sent, so the list doesn't fill with empties.
   */
  function newChat(kind = "deck") {
    if (!user) return;
    if (typeof kind !== "string") kind = "deck";
    if (kind !== "deck" && kind !== "report") kind = "deck";
    if (pendingChat && !pendingChat.topic && pendingChat.kind === kind) {
      setActiveChatId(pendingChat.id);
      navigate("chat", { chatId: pendingChat.id });
      return;
    }
    const list = loadChats(user.email);
    const existing = findEmptyChat(list, kind);
    if (existing) {
      setActiveChatId(existing.id);
      navigate("chat", { chatId: existing.id });
      setChats(list);
      setPendingChat(null);
      return;
    }
    const c = createChat({ kind });
    setPendingChat(c);
    setActiveChatId(c.id);
    navigate("chat", { chatId: c.id });
  }

  function openChat(id) {
    setActiveChatId(id);
    // Leaving a pending new chat without using it — keep it for now, it
    // will be reused on next New chat or discarded on next boot.
    navigate("chat", { chatId: id });
  }

  /** Persist a chat the view changed (briefing progress, produced deck, …). */
  function handleChatChanged(chat) {
    if (!user) return;
    const isPending = pendingChat && chat.id === pendingChat.id;
    const shouldSave = Boolean(chat.topic || chat.produced || chat.plan);
    if (isPending) {
      if (!shouldSave) {
        setPendingChat(chat);
        setActiveChatId(chat.id);
        return;
      }
      setPendingChat(null);
    }
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
      case "tour-themes":
      case "home":
      case "privacy":
      case "terms":
      case "contact":
      case "docs":
      case "usage":
      case "admin":
        setView(r.view);
        break;
      case "chat":
      default:
        setView("chat");
        // use storage-direct check so a fresh hashchange before React commits still finds the chat
        if (r.chatId) {
          let fresh = chats;
          try { if (user?.email) fresh = loadChats(user.email); } catch {}
          if (fresh.some((c) => c.id === r.chatId)) setActiveChatId(r.chatId);
          else if (r.chatId) setActiveChatId(r.chatId); // allow direct navigation even if list lags
        }
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

  const rawActiveChat = chats.find((c) => c.id === activeChatId) ?? (pendingChat?.id === activeChatId ? pendingChat : null);
  const activeChat = rawActiveChat ? normalizeChat(rawActiveChat) : null;
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
    if (pendingChat?.id === id) {
      setPendingChat(null);
    }
    const remaining = deleteChatStore(user.email, id);
    setChats(remaining);
    if (activeChatId !== id) return;
    const next = remaining[0] ?? null;
    if (next) {
      setActiveChatId(next.id);
      navigate("chat", { chatId: next.id });
    } else {
      const c = createChat();
      setPendingChat(c);
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
    // Auth is still resolving — show branded loading, not blank particles. Solid bg, not particle field (tour is solid per request).
    return (
      <div className="grid h-full place-items-center bg-base">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg" alt="" className="h-12 w-12 animate-pulse rounded-xl shadow-sm ring-1 ring-line" />
          <div className="h-1 w-24 overflow-hidden rounded-full bg-line">
            <div className="h-full w-1/2 animate-[shimmer_1s_ease-in-out_infinite] bg-accent" />
          </div>
          <div className="text-[12px] tracking-wide text-fg-faint">Loading Presentation Forge…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    const tourView = parseHash(window.location.hash).view;
    const tourExtra = ["privacy","terms","contact","docs","usage","tour-themes","themes"].includes(tourView) ? tourView : null;
    return (
      <div className="relative min-h-screen bg-base">
        <ParticleField boost={2.2} className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-35" />
        <div className="relative z-10 flex min-h-screen flex-col pt-14">
          <HeaderBar
            leftOpen={leftOpen}
            onToggleLeft={() => setLeftOpen((o) => !o)}
            onOpenSettings={() => setAuthMode("register")}
            onOpenProfile={() => {}}
            user={null}
            view={tourExtra ?? "home"}
            onAuthClick={(mode) => { setAuthMode(mode === "register" ? "register" : "login"); setAuthOpen(true); }}
          />
          <div className="flex-1">
            {tourExtra === "privacy" ? <Privacy /> : tourExtra === "terms" ? <Terms /> : tourExtra === "contact" ? <Contact /> : tourExtra === "docs" ? <Docs /> : tourExtra === "usage" ? <Usage /> : tourExtra === "tour-themes" ? <TourThemes onAuth={() => { setAuthMode("register"); setAuthOpen(true); }} /> : tourExtra === "themes" ? <TourThemes onAuth={() => { setAuthMode("register"); setAuthOpen(true); }} /> : (
              <Home
                user={null}
                onStartChat={() => { setAuthMode("register"); setAuthOpen(true); }}
                // "See the themes" shows the themes. It used to open the
                // register modal, which asks someone to sign up for the thing
                // they were trying to look at.
                onBrowseThemes={() => { window.location.hash = "#/tour-themes"; }}
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
    <div className={`relative bg-base ${isTourView ? "min-h-screen" : "h-screen overflow-hidden overflow-x-hidden"}`}>
      <ParticleField boost={isTourView ? 2.2 : 1} className={`pointer-events-none fixed inset-0 z-0 h-full w-full ${isTourView ? "opacity-35" : "opacity-30"}`} />

      <div className={`relative z-10 flex ${isTourView ? "min-h-screen flex-col pt-14" : "h-full flex-col overflow-x-hidden"}`}>
        {isTourView && (
          <HeaderBar
            leftOpen={leftOpen}
            onToggleLeft={() => setLeftOpen((o) => !o)}
            onHome={goHome}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenProfile={() => setProfileOpen(true)}
            user={user}
            view={view}
            onAuthClick={() => setAuthOpen(true)}
          />
        )}

        <div className={`isolate flex ${isTourView ? "flex-1" : "min-h-0 flex-1"}`}>
          {view !== "home" && !["privacy","terms","contact","docs","tour-themes","usage"].includes(view) && (
            <div className="flex">
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
                onToggleLeft={() => setLeftOpen((o) => !o)}
                isAdmin={isAdminUser}
              />
            </div>
          )}

          <main key={view === "chat" ? `chat-${activeChatId ?? "none"}` : view} className={`view-in relative min-w-0 flex-1 overflow-x-hidden ${isTourView ? "overflow-visible overflow-x-hidden" : "overflow-y-auto"}`}>
            {view === "chat" && activeChat && (
              <ErrorBoundary key={`chat-err-${activeChat.id}`}>
                <ChatView
                  chat={activeChat}
                  identity={identity}
                  onChatChanged={handleChatChanged}
                  leftOpen={leftOpen}
                  onToggleLeft={() => setLeftOpen((o) => !o)}
                  onOpenDeck={openDeck}
                  onOpenReport={openReport}
                  onDeckChanged={bumpDeck}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              </ErrorBoundary>
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
            {view === "themes" && <Themes leftOpen={leftOpen} onToggleLeft={() => setLeftOpen((o) => !o)} />}
            {view === "tour-themes" && <TourThemes onAuth={() => navigate("themes")} authed />}
            {view === "home" && (
              <Home
                user={user}
                onStartChat={newChat}
                onBrowseThemes={() => navigate("tour-themes")}
              />
            )}
            {view === "privacy" && <Privacy />}
            {view === "terms" && <Terms />}
            {view === "contact" && <Contact />}
            {view === "docs" && <Docs />}
            {view === "usage" && <Usage />}
            {view === "admin" && <Admin onBack={goHome} />}
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
          user={user}
          isAdmin={isAdminUser}
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

