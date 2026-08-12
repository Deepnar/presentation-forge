import { useEffect, useState } from "react";
import { api } from "./api.js";
import HeaderBar from "./components/HeaderBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import DocsModal from "./components/DocsModal.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import AuthModal from "./components/AuthModal.jsx";
import ParticleField from "./components/ParticleField.jsx";
import { ChatIcon } from "./components/icons.jsx";
import Home from "./views/Home.jsx";
import DeckDetail from "./views/DeckDetail.jsx";
import ReportView from "./views/ReportView.jsx";
import NewDeck from "./views/NewDeck.jsx";
import Outline from "./views/Outline.jsx";
import Themes from "./views/Themes.jsx";
import Identity from "./views/Identity.jsx";

/**
 * Application shell: header bar on top; below it the sidebar (persistent deck
 * list), the active view, and the chat rail. Both rails persist their open
 * state. The deck list lives here — the sidebar and home carousel share it, and
 * a chat turn or report flow bumps the version so both re-fetch. The particle
 * field sits behind the whole shell as ambience, and pauses whenever the
 * pointer enters either rail so it never competes with navigation.
 *
 * Auth is a local single-install gate: the header's account entry opens
 * Login/Register, and the session (a bearer token in localStorage) unlocks the
 * Cloud-key section. Everything else stays open.
 */
export default function App() {
  const [view, setView] = useState("home"); // home | deck | new | outline | themes | identity
  // The institution comes from config, never from source — src/ must stay free
  // of any one school's details so the tool is reusable.
  const [org, setOrg] = useState("");
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("forge.leftNav") !== "0");
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem("forge.rightRail") === "1");
  const [activeSlug, setActiveSlug] = useState(null);
  const [decks, setDecks] = useState([]);
  const [deckVersion, setDeckVersion] = useState(0);
  const [draft, setDraft] = useState(null); // approved outline handoff
  const [docsOpen, setDocsOpen] = useState(false);
  const [railHover, setRailHover] = useState(false); // pause particles over a rail
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    api.identity()
      .then((r) => setOrg(r.identity?.institution?.short ?? ""))
      .catch(() => {});
  }, []);

  // Rehydrate the session on boot: a stored token that no longer resolves is
  // simply forgotten, leaving the user logged out.
  useEffect(() => {
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    api.decks().then((r) => setDecks(r.decks)).catch(() => setDecks([]));
  }, [deckVersion]);

  useEffect(() => localStorage.setItem("forge.leftNav", leftOpen ? "1" : "0"), [leftOpen]);
  useEffect(() => localStorage.setItem("forge.rightRail", rightOpen ? "1" : "0"), [rightOpen]);

  const openDeck = (slug) => {
    // A report-only deck (no deck.yaml yet) opens the Report view; a deck with
    // slides opens the deck detail. The chat rail edits deck.yaml, so it only
    // exists on the deck view.
    const entry = decks.find((d) => d.slug === slug);
    setActiveSlug(slug);
    setView(entry && entry.report && !entry.deck ? "report" : "deck");
  };

  // The sidebar's Reports tab is about the document, not the deck: clicking a
  // report opens its full-document view even when the deck also has slides.
  const openReport = (slug) => {
    setActiveSlug(slug);
    setView("report");
  };

  const handlePlanReady = ({ slug, plan, theme }) => {
    setDraft({ slug, plan, theme });
    setView("outline");
  };

  // A report generate wrote report.yaml server-side; refetch the list so the
  // Reports tab and the deck's Report panel reflect the new file.
  const handleReportDone = (slug) => {
    setDeckVersion((v) => v + 1);
    openDeck(slug);
  };

  const bumpDeck = () => setDeckVersion((v) => v + 1);
  const hasReportFor = (slug) => decks.find((d) => d.slug === slug)?.report ?? false;

  return (
    <div className="relative h-full overflow-hidden">
      {/* A canvas is a replaced element with an intrinsic size, so inset-0 alone
          leaves it at 300x150 — it needs an explicit fill to cover the shell. */}
      <ParticleField paused={railHover} className="pointer-events-none fixed inset-0 z-0 h-full w-full" />

      <div className="relative z-10 flex h-full flex-col">
        <HeaderBar
          leftOpen={leftOpen}
          onToggleLeft={() => setLeftOpen((o) => !o)}
          onOpenDocs={() => setDocsOpen(true)}
          onHome={() => setView("home")}
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
              decks={decks}
              activeSlug={view === "deck" || view === "report" ? activeSlug : null}
              view={view}
              open={leftOpen}
              onOpenDeck={openDeck}
              onOpenReport={openReport}
              onNewDeck={() => setView("new")}
              onView={setView}
            />
          </div>

          <main key={view} className="view-in min-w-0 flex-1 overflow-y-auto">
          {view === "home" && (
            <Home
              decks={decks}
              org={org}
              onNewDeck={() => setView("new")}
              onOpenDeck={openDeck}
              onPlanReady={handlePlanReady}
              onReportDone={handleReportDone}
              onStandaloneReport={(slug) => { setDeckVersion((v) => v + 1); openDeck(slug); }}
            />
          )}
          {view === "deck" && activeSlug && (
            <DeckDetail
              slug={activeSlug}
              hasReport={hasReportFor(activeSlug)}
              refreshToken={deckVersion}
              onBack={() => setView("home")}
              onDeckChanged={bumpDeck}
            />
          )}
          {view === "report" && activeSlug && (
            <ReportView
              slug={activeSlug}
              refreshToken={deckVersion}
              onBack={() => setView("home")}
              onPlanReady={(plan) => { setDraft({ slug: activeSlug, plan, theme: "" }); setView("outline"); }}
            />
          )}
          {view === "new" && <NewDeck onPlanned={handlePlanReady} onBack={() => setView("home")} />}
          {view === "outline" && draft && (
            <Outline
              slug={draft.slug}
              plan={draft.plan}
              initialTheme={draft.theme}
              onDone={(slug) => { bumpDeck(); openDeck(slug); }}
              onBack={() => setView("new")}
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

        {/* The chat rail belongs to a deck — it edits deck.yaml. With no deck
            open there is nothing to talk to, so the rail (and its edge tab) only
            exists on the deck view and the main column goes full-width. The
            section stays mounted and animates its width so collapsing reads as
            one fluid motion, not a mount/unmount pop. */}
        {view === "deck" && (
          <section
            onMouseEnter={() => setRailHover(true)}
            onMouseLeave={() => setRailHover(false)}
            className={`flex shrink-0 flex-col border-l border-line bg-panel transition-[width] duration-[var(--dur-shell)] ease-[var(--ease-shell)] ${
              rightOpen ? "w-80" : "w-10"
            }`}
          >
            {rightOpen ? (
              <div className="flex-1 overflow-hidden">
                <ChatPanel slug={activeSlug} onDeckChanged={bumpDeck} onClose={() => setRightOpen(false)} />
              </div>
            ) : (
              <button
                onClick={() => setRightOpen(true)}
                title="Open chat"
                className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-fg-faint transition hover:text-fg"
              >
                <ChatIcon className="h-4 w-4" />
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>
                  Chat
                </span>
              </button>
            )}
          </section>
        )}
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
