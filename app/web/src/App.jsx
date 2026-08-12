import { useEffect, useState } from "react";
import { api } from "./api.js";
import HeaderBar from "./components/HeaderBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import DocsModal from "./components/DocsModal.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import ParticleField from "./components/ParticleField.jsx";
import { ChatIcon } from "./components/icons.jsx";
import Home from "./views/Home.jsx";
import DeckDetail from "./views/DeckDetail.jsx";
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

  useEffect(() => {
    api.identity()
      .then((r) => setOrg(r.identity?.institution?.short ?? ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.decks().then((r) => setDecks(r.decks)).catch(() => setDecks([]));
  }, [deckVersion]);

  useEffect(() => localStorage.setItem("forge.leftNav", leftOpen ? "1" : "0"), [leftOpen]);
  useEffect(() => localStorage.setItem("forge.rightRail", rightOpen ? "1" : "0"), [rightOpen]);

  const openDeck = (slug) => {
    setActiveSlug(slug);
    setView("deck");
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
        />

        <div className="flex min-h-0 flex-1">
          <div
            onMouseEnter={() => setRailHover(true)}
            onMouseLeave={() => setRailHover(false)}
            className="flex"
          >
            <Sidebar
              decks={decks}
              activeSlug={view === "deck" ? activeSlug : null}
              view={view}
              open={leftOpen}
              onOpenDeck={openDeck}
              onNewDeck={() => setView("new")}
              onView={setView}
            />
          </div>

          <main className="min-w-0 flex-1 overflow-y-auto">
          {view === "home" && (
            <Home
              decks={decks}
              org={org}
              onNewDeck={() => setView("new")}
              onOpenDeck={openDeck}
              onPlanReady={handlePlanReady}
              onReportDone={handleReportDone}
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
          {view === "identity" && <Identity />}
        </main>

        {rightOpen ? (
          <section
            onMouseEnter={() => setRailHover(true)}
            onMouseLeave={() => setRailHover(false)}
            className="flex w-80 shrink-0 flex-col border-l border-line bg-panel"
          >
            <div className="flex-1 overflow-hidden">
              <ChatPanel slug={activeSlug} onDeckChanged={bumpDeck} onClose={() => setRightOpen(false)} />
            </div>
          </section>
        ) : (
          <button
            onClick={() => setRightOpen(true)}
            title="Open chat"
            className="flex w-10 shrink-0 flex-col items-center justify-center gap-1.5 border-l border-line bg-panel text-fg-faint transition hover:text-fg"
          >
            <ChatIcon className="h-4 w-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>
              Chat
            </span>
          </button>
        )}
      </div>

      {docsOpen && <DocsModal onClose={() => setDocsOpen(false)} />}
      </div>
    </div>
  );
}
