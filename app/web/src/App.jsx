import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { parseHash, hashFor } from "./lib/router.js";
import { useNarrow } from "./lib/viewport.js";
import HeaderBar from "./components/HeaderBar.jsx";
import ParticleField from "./components/ParticleField.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AuthModal from "./components/AuthModal.jsx";
import RecoveryScreen from "./components/RecoveryScreen.jsx";
import VerifyBanner from "./components/VerifyBanner.jsx";
import { defaultProjectPage } from "./components/ProjectNav.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ProfileModal from "./components/ProfileModal.jsx";
import { loadChats, saveChat, createChat, deleteChat as deleteChatStore, chatsKey, findEmptyChat, normalizeChat } from "./lib/chats.js";
import { BRIEFING_QUESTIONS } from "./lib/briefing.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const Home = lazy(() => import("./views/Home.jsx"));
const ChatView = lazy(() => import("./views/ChatView.jsx"));
const DeckDetail = lazy(() => import("./views/DeckDetail.jsx"));
const ReportView = lazy(() => import("./views/ReportView.jsx"));
const ResearchView = lazy(() => import("./views/ResearchView.jsx"));
const ScriptView = lazy(() => import("./views/ScriptView.jsx"));
const Themes = lazy(() => import("./views/Themes.jsx"));
const TourThemes = lazy(() => import("./views/TourThemes.jsx"));
const Admin = lazy(() => import("./views/Admin.jsx"));
const legalView = (name) => lazy(() => import("./views/Legal.jsx").then((module) => ({ default: module[name] })));
const Privacy = legalView("Privacy");
const Terms = legalView("Terms");
const Contact = legalView("Contact");
const Docs = legalView("Docs");
const Usage = legalView("Usage");

function AppContent() {
  const [user, setUser] = useState(undefined); // undefined = auth still checking
  const [authConfig, setAuthConfig] = useState(undefined);
  const [verifyRequired, setVerifyRequired] = useState(false);
  const [hash, setHash] = useState(() => window.location.hash);
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
  const narrow = useNarrow();
  useEffect(() => { if (narrow) setLeftOpen(false); }, [narrow]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // login | register — the landing's auth modal
  const [focusSearch, setFocusSearch] = useState(0);

  useEffect(() => {
    Promise.all([
      api.me().catch(() => ({ user: null, verifyRequired: false })),
      api.authConfig().catch(() => null),
    ]).then(([me, config]) => {
      setUser(me.user);
      setVerifyRequired(me.verifyRequired === true);
      setAuthConfig(config);
    });
  }, []);

  useEffect(() => {
    if (!user) { setIdentity({}); setOrg(""); return; }
    api.identity()
      .then((r) => { setIdentity(r.identity ?? {}); setOrg(r.identity?.institution?.short ?? ""); })
      .catch(() => {});
  }, [user?.email]);

  useEffect(() => {
    if (!user) { setChats([]); setActiveChatId(null); setPendingChat(null); return; }
    const list = loadChats(user.email);
    setChats(list);
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
    const c = createChat();
    setPendingChat(c);
    setActiveChatId(c.id);
  }, [user?.email]);

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

  const isAdminUser = Boolean(user && user.role === "admin");

  const isTourView = view === "home" || ["privacy","terms","contact","docs","tour-themes","usage"].includes(view);
  const isChatView = view === "chat";
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
    navigate("chat", { chatId: id });
  }

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

  function navigate(view, opts = {}) {
    const h = hashFor(view, opts);
    if (window.location.hash === h) return applyHash();
    window.location.hash = h; // pushes a history entry and fires hashchange
  }

  function applyHash() {
    const r = parseHash(window.location.hash);
    switch (r.view) {
      case "deck":
      case "report":
      case "research":
      case "script":
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
        if (r.chatId) {
          let fresh = chats;
          try { if (user?.email) fresh = loadChats(user.email); } catch {}
          if (fresh.some((c) => c.id === r.chatId)) setActiveChatId(r.chatId);
          else if (r.chatId) setActiveChatId(r.chatId); // allow direct navigation even if list lags
        }
        break;
    }
  }

  const applyHashRef = useRef(applyHash);
  applyHashRef.current = applyHash;
  useEffect(() => {
    const onHash = () => applyHashRef.current();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!user) return;
    const r = parseHash(window.location.hash);
    const explicit = r.view !== "chat";
    if (explicit) { applyHash(); return; }
    window.history.replaceState(null, "", "#/chat");
    applyHash();
  }, [user?.email]);

  useEffect(() => {
    if (user) return;
    if (!window.location.hash) window.history.replaceState(null, "", "#/home");
  }, [user]);

  const rawActiveChat = chats.find((c) => c.id === activeChatId) ?? (pendingChat?.id === activeChatId ? pendingChat : null);
  const activeChat = rawActiveChat ? normalizeChat(rawActiveChat) : null;
  const goHome = () => navigate("chat");
  const openProjectPage = (page) => navigate(page, { slug: activeSlug });

  async function doLogout() {
    try { await api.logout(); } catch { /* token already gone */ }
    window.history.replaceState(null, "", "#/home");
    setUser(null);
  }

  const openDeck = (slug) => {
    const entry = decks.find((d) => d.slug === slug);
    navigate(defaultProjectPage(entry), { slug });
  };
  const openReport = (slug) => navigate("report", { slug });
  const openResearch = (slug) => navigate("research", { slug });

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

  const recovery = parseHash(hash);
  if (recovery.view === "reset" || recovery.view === "verify") {
    return (
      <RecoveryScreen
        kind={recovery.view}
        token={recovery.token}
        onDone={() => api.me().then((r) => setUser(r.user)).catch(() => {})}
        onSignIn={() => {
          window.location.hash = "#/home";
          setHash("#/home");
          setAuthMode("login");
          setAuthOpen(true);
        }}
      />
    );
  }

  if (user === undefined) {
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
    const localAuthMode = authConfig?.localOwner
      ? (authConfig.ownerConfigured ? "login" : "register")
      : null;
    const openAuth = (preferred = "login") => {
      setAuthMode(localAuthMode ?? preferred);
      setAuthOpen(true);
    };
    const tourView = parseHash(window.location.hash).view;
    const tourExtra = ["privacy","terms","contact","docs","usage","tour-themes","themes"].includes(tourView) ? tourView : null;
    return (
      <div className="relative min-h-screen bg-base">
        <ParticleField boost={2.6} className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-50" />
        <div className="relative z-10 flex min-h-screen flex-col pt-14">
          <HeaderBar
            leftOpen={leftOpen}
            onToggleLeft={() => setLeftOpen((o) => !o)}
            onOpenSettings={() => setAuthMode("register")}
            onOpenProfile={() => {}}
            user={null}
            view={tourExtra ?? "home"}
            authConfig={authConfig}
            onAuthClick={(mode) => openAuth(mode === "register" ? "register" : "login")}
          />
          <div className="flex-1">
            {tourExtra === "privacy" ? <Privacy /> : tourExtra === "terms" ? <Terms /> : tourExtra === "contact" ? <Contact /> : tourExtra === "docs" ? <Docs /> : tourExtra === "usage" ? <Usage /> : tourExtra === "tour-themes" ? <TourThemes onAuth={() => openAuth("register")} /> : tourExtra === "themes" ? <TourThemes onAuth={() => openAuth("register")} /> : (
              <Home
                user={null}
                authConfig={authConfig}
                onStartChat={() => openAuth("register")}
                onBrowseThemes={() => { window.location.hash = "#/tour-themes"; }}
                onAuth={openAuth}
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
      <ParticleField boost={isTourView ? 2.6 : 1.4} className={`pointer-events-none fixed inset-0 z-0 h-full w-full ${isTourView ? "opacity-50" : "opacity-38"}`} />

      <div className={`relative z-10 flex ${isTourView ? "min-h-screen flex-col pt-14" : "h-full flex-col overflow-x-hidden"}`}>
        {/* An unconfirmed account can read everything and create nothing. The
            state lasts the whole session, so it is a strip at the top of the
            shell rather than a toast that disappears before the refusal it
            explains. */}
        {verifyRequired && user && !user.verified && <VerifyBanner email={user.email} />}
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
            <>
            {narrow && leftOpen && (
              <div
                className="fade-in fixed inset-0 z-30 bg-[var(--color-overlay)]"
                onClick={() => setLeftOpen(false)}
                aria-hidden
              />
            )}
            <div
              className={
                narrow
                  ? `fixed inset-y-0 left-0 z-40 flex transition-transform duration-[var(--dur-shell)] ease-[var(--ease-shell)] ${
                      leftOpen ? "translate-x-0" : "-translate-x-full"
                    }`
                  : "flex"
              }
            >
              <Sidebar
                chats={chats}
                decks={decks}
                activeChatId={activeChatId}
                activeSlug={view === "deck" || view === "report" || view === "research" ? activeSlug : null}
                view={view}
                open={narrow ? true : leftOpen}
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
                onNavigate={narrow ? () => setLeftOpen(false) : undefined}
                isAdmin={isAdminUser}
              />
            </div>
            </>
          )}

          {/* A tour view scrolls the DOCUMENT, and its landing scenes hold
              themselves in place with position: sticky. That needs NO overflow
              property here at all — not even the "visible" this used to try to
              set alongside overflow-x-hidden, because one axis hidden and the
              other visible is invalid CSS: the browser promotes the visible
              axis to auto, which makes this a scroll container, which makes
              the scenes stick to IT instead of the viewport. Signed out the
              landing was fine and signed in it scrolled past every pinned
              frame into blank page. */}
          <main
            key={view === "chat" ? `chat-${activeChatId ?? "none"}` : view}
            className={`view-in relative min-w-0 flex-1 ${isTourView ? "" : "overflow-x-hidden overflow-y-auto"}`}
          >
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
                  unverified={verifyRequired && !user.verified}
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
                refreshToken={deckVersion}
                onBack={goHome}
                onDeckChanged={bumpDeck}
                onOpenDeck={(s) => { navigate("deck", { slug: s }); bumpDeck(); }}
                onNavigate={openProjectPage}
              />
            )}
            {view === "report" && activeSlug && (
              <ReportView
                slug={activeSlug}
                refreshToken={deckVersion}
                onBack={goHome}
                onDeckChanged={bumpDeck}
                onPlanReady={(plan) => startCompanionChat(activeSlug, plan)}
                onNavigate={openProjectPage}
              />
            )}
            {view === "research" && activeSlug && (
              <ResearchView
                slug={activeSlug}
                refreshToken={deckVersion}
                onBack={goHome}
                onNavigate={openProjectPage}
              />
            )}
            {view === "script" && activeSlug && (
              <ScriptView
                slug={activeSlug}
                refreshToken={deckVersion}
                onBack={goHome}
                onNavigate={openProjectPage}
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
export default function App() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-fg-muted">Loading…</div>}>
      <AppContent />
    </Suspense>
  );
}
