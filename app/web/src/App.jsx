import { useEffect, useState } from "react";
import { api } from "./api.js";
import Decks from "./views/Decks.jsx";
import Themes from "./views/Themes.jsx";
import Identity from "./views/Identity.jsx";
import ChatPanel from "./components/ChatPanel.jsx";

const NAV = [
  { id: "decks", label: "Decks", hint: "Build and preview", icon: LayersIcon },
  { id: "themes", label: "Themes", hint: "Design languages", icon: PaletteIcon },
  { id: "identity", label: "Identity", hint: "Team and subject", icon: IdIcon },
];

/**
 * Application shell with collapsible rails.
 *
 * Left: navigation that collapses to an icon rail. Right: the chat panel —
 * deck-scoped, so it needs to know which deck is open. A chat turn bumps the
 * deck version so the open deck detail re-fetches its previews. Both rails
 * persist their open state.
 */
export default function App() {
  const [view, setView] = useState("decks");
  // The institution comes from config, never from source — src/ must stay free
  // of any one school's details so the tool is reusable.
  const [org, setOrg] = useState("");
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("forge.leftNav") !== "0");
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem("forge.rightRail") === "1");
  const [activeSlug, setActiveSlug] = useState(null);
  const [deckVersion, setDeckVersion] = useState(0);

  useEffect(() => {
    api.identity()
      .then((r) => setOrg(r.identity?.institution?.short ?? ""))
      .catch(() => {});
  }, []);

  useEffect(() => localStorage.setItem("forge.leftNav", leftOpen ? "1" : "0"), [leftOpen]);
  useEffect(() => localStorage.setItem("forge.rightRail", rightOpen ? "1" : "0"), [rightOpen]);

  return (
    <div className="flex h-full">
      <aside
        className={`flex shrink-0 flex-col border-r border-line bg-panel transition-[width] ${
          leftOpen ? "w-[15.5rem]" : "w-[3.75rem]"
        }`}
      >
        <header className="flex items-center gap-2.5 px-3 pb-4 pt-4">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-[13px] font-bold text-white">
            F
          </div>
          {leftOpen && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-semibold tracking-tight">Presentation Forge</div>
              <div className="truncate text-[10px] text-fg-faint">{org ? `local · ${org}` : "local"}</div>
            </div>
          )}
          <button
            onClick={() => setLeftOpen((o) => !o)}
            title={leftOpen ? "Collapse navigation" : "Expand navigation"}
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
          >
            {leftOpen ? <ChevronLeft /> : <ChevronRight />}
          </button>
        </header>

        <nav className="flex flex-col gap-0.5 px-2.5">
          {NAV.map(({ id, label, hint, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                title={leftOpen ? undefined : label}
                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                  leftOpen ? "" : "justify-center"
                } ${active ? "bg-raised" : "hover:bg-hover"}`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition ${
                    active ? "text-accent" : "text-fg-faint group-hover:text-fg-muted"
                  }`}
                />
                {leftOpen && (
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-medium ${active ? "text-fg" : "text-fg-muted group-hover:text-fg"}`}>
                      {label}
                    </span>
                    <span className="block text-[10.5px] text-fg-faint">{hint}</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {leftOpen && (
          <div className="mt-auto border-t border-line px-5 py-4 text-[10.5px] leading-relaxed text-fg-faint">
            Slides render from <code className="text-fg-muted">deck.yaml</code>.
            Themes own the design; content never sets geometry.
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {view === "decks" && (
          <Decks
            onDeckChange={setActiveSlug}
            refreshToken={deckVersion}
          />
        )}
        {view === "themes" && <Themes />}
        {view === "identity" && <Identity />}
      </main>

      {rightOpen ? (
        <section className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[13px] font-semibold text-fg">Chat</span>
            <button
              onClick={() => setRightOpen(false)}
              title="Collapse panel"
              className="grid h-6 w-6 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
            >
              <ChevronRight />
            </button>
          </header>
          <div className="flex-1 overflow-hidden">
            <ChatPanel slug={activeSlug} onDeckChanged={() => setDeckVersion((v) => v + 1)} />
          </div>
        </section>
      ) : (
        <button
          onClick={() => setRightOpen(true)}
          title="Open panel"
          className="flex w-9 shrink-0 flex-col items-center justify-center border-l border-line bg-panel text-fg-faint transition hover:text-fg"
        >
          <ChevronLeft />
        </button>
      )}
    </div>
  );
}

/* Inline icons — a handful of paths beats an icon dependency. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function ChevronLeft(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function ChevronRight(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function LayersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 14 9 5 9-5" />
    </svg>
  );
}
function PaletteIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M12 21a9 9 0 1 1 9-9c0 1.7-1.3 3-3 3h-1.5a2 2 0 0 0-1.4 3.4A2 2 0 0 1 12 21Z" />
      <circle cx="7.5" cy="11.5" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16.5" cy="11.5" r="1" />
    </svg>
  );
}
function IdIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" /><path d="M5.5 16.5c.7-1.6 2-2.4 3.5-2.4s2.8.8 3.5 2.4M15 10h3.5M15 13.5h3.5" />
    </svg>
  );
}
