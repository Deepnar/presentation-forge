import { useEffect, useState } from "react";
import { api } from "./api.js";
import HeaderBar from "./components/HeaderBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import DocsModal from "./components/DocsModal.jsx";
import AuthModal from "./components/AuthModal.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import ParticleField from "./components/ParticleField.jsx";
import ChatView from "./views/ChatView.jsx";
import DeckDetail from "./views/DeckDetail.jsx";
import ReportView from "./views/ReportView.jsx";
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
  const [view, setView] = useState("chat"); // chat | deck | report | themes | identity
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeSlug, setActiveSlug] = useState(null);
  const [decks, setDecks] = useState([]);
  const [deckVersion, setDeckVersion] = useState(0);
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("forge.leftNav") !== "0");
  const [docsOpen, setDocsOpen] = useState(false);
  const [railHover, setRailHover] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(0);

  // Boot: rehydrate the session (a stale token just logs out) and remember the
  // institution. Auth-first — everything else waits for a user.
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
    api.identity().then((r) => { setIdentity(r.identity ?? {}); setOrg(r.identity?.institution?.short ?? ""); }).catch(() => {});
  }, []);

  // A logged-in user gets their own chat list; the first visit starts one
  // empty thread so the landing is already a chat. StrictMode double-fires this
  // effect, so the initial-chat guard reads localStorage, not React state.
  useEffect(() => {
    if (!user) { setChats([]); setActiveChatId(null); return; }
    let list = loadChats(user.email);
    if (!list.length) {
      const c = createChat();
      saveChat(user.email, c);
      list = [c];
    }
    setChats(list);
    setActiveChatId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0].id));
  }, [user?.email]);

  useEffect(() => {
    if (!user) { setDecks([]); return; }
    api.decks().then((r) => setDecks(r.decks)).catch(() => setDecks([]));
  }, [user?.email, deckVersion]);

  useEffect(() => localStorage.setItem("forge.leftNav", leftOpen ? "1" : "0"), [leftOpen]);

  // Ctrl+K focuses the sidebar search, Ctrl+N starts a new chat, Escape closes
  // the docs modal.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFocusSearch((n) => n + 1);
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat();
      } else if (e.key === "Escape" && docsOpen) {
        setDocsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docsOpen, user]);

  const bumpDeck = () => setDeckVersion((v) => v + 1);
  const hasReportFor = (slug) => decks.find((d) => d.slug === slug)?.report ?? false;

  /** The one creation entry: a new chat, empty thread, welcome message. */
  function newChat(kind = "deck") {
    const c = createChat({ kind });
    if (user) saveChat(user.email, c);
    setChats((list) => [c, ...list]);
    setActiveChatId(c.id);
    setView("chat");
  }

  function openChat(id) {
    setActiveChatId(id);
    setView("chat");
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

  const openDeck = (slug) => { setActiveSlug(slug); setView("deck"); };
  const openReport = (slug) => { setActiveSlug(slug); setView("report"); };

  /** Delete a chat thread locally; if it was active, land on another. */
  function handleDeleteChat(id) {
    if (!user) return;
    const remaining = deleteChatStore(user.email, id);
    setChats(remaining);
    if (activeChatId !== id) return;
    const next = remaining[0] ?? null;
    if (next) {
      setActiveChatId(next.id);
      setView("chat");
    } else {
      const c = createChat();
      saveChat(user.email, c);
      setChats([c]);
      setActiveChatId(c.id);
      setView("chat");
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
    if (activeSlug === slug && (view === "deck" || view === "report")) goHome();
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
    setView("chat");
  }

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const goHome = () => setView("chat");

  if (!user) {
    return (
      <div className="relative h-full overflow-hidden">
        <ParticleField className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
        <div className="relative z-10 h-full">
          <LoginScreen onDone={(u) => { setUser(u); setView("chat"); }} />
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
          onOpenDocs={() => setDocsOpen(true)}
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
          <div
            onMouseEnter={() => setRailHover(true)}
            onMouseLeave={() => setRailHover(false)}
            className="flex"
          >
            <Sidebar
              chats={chats}
              decks={decks}
              activeChatId={activeChatId}
              activeSlug={view === "deck" || view === "report" ? activeSlug : null}
              view={view}
              open={leftOpen}
              focusSearch={focusSearch}
              onOpenChat={openChat}
              onOpenDeck={openDeck}
              onOpenReport={openReport}
              onNewChat={newChat}
              onView={setView}
              onDeleteChat={handleDeleteChat}
              onDeleteDeck={handleDeleteDeck}
            />
          </div>

          <main key={view === "chat" ? `chat-${activeChatId ?? "none"}` : view} className="view-in min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
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
                onOpenDeck={(s) => { setActiveSlug(s); bumpDeck(); setView("deck"); }}
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
            {view === "themes" && <Themes />}
            {view === "identity" && (
              <Identity
                user={user}
                onAuthClick={() => setAuthOpen(true)}
              />
            )}
          </main>
        </div>

        {docsOpen && <DocsModal onClose={() => setDocsOpen(false)} />}
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
