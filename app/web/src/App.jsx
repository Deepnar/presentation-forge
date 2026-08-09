import { useState } from "react";
import Decks from "./views/Decks.jsx";
import Themes from "./views/Themes.jsx";
import Identity from "./views/Identity.jsx";

const NAV = [
  { id: "decks", label: "Decks", hint: "Build and preview", icon: LayersIcon },
  { id: "themes", label: "Themes", hint: "Design languages", icon: PaletteIcon },
  { id: "identity", label: "Identity", hint: "Team and subject", icon: IdIcon },
];

export default function App() {
  const [view, setView] = useState("decks");

  return (
    <div className="flex h-full">
      <aside className="flex w-[15.5rem] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-white">
            F
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">Presentation Forge</div>
            <div className="text-[10px] text-fg-faint">local · TCET</div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-2.5">
          {NAV.map(({ id, label, hint, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`group flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                  active ? "bg-raised" : "hover:bg-hover"
                }`}
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 transition ${
                    active ? "text-accent" : "text-fg-faint group-hover:text-fg-muted"
                  }`}
                />
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] font-medium ${
                      active ? "text-fg" : "text-fg-muted group-hover:text-fg"
                    }`}
                  >
                    {label}
                  </span>
                  <span className="block text-[10.5px] text-fg-faint">{hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-line px-5 py-4 text-[10.5px] leading-relaxed text-fg-faint">
          Slides render from <code className="text-fg-muted">deck.yaml</code>.
          Themes own the design; content never sets geometry.
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {view === "decks" && <Decks />}
        {view === "themes" && <Themes />}
        {view === "identity" && <Identity />}
      </main>
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
