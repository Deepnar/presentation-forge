import { useMemo, useState } from "react";
import { dateGroup, relative } from "../lib/time.js";
import DeckThumb from "./DeckThumb.jsx";
import { Button } from "./ui.jsx";
import { ChevronDown, DocIcon, IdIcon, LayersIcon, PaletteIcon, PlusIcon, SearchIcon } from "./icons.jsx";

const GROUPS = ["Today", "Yesterday", "This week", "This month", "Earlier"];

/**
 * Persistent deck navigation. Tabs filter All decks / Reports (a real per-deck
 * flag), search filters title/slug/theme, and the list is grouped by relative
 * date with a cover thumb on every row. Collapses to an icon rail — both states
 * are persisted by App. The deck list is the product's navigation; Themes and
 * Identity are compact rows at the bottom.
 */
export default function Sidebar({ decks, activeSlug, view, open, onOpenDeck, onNewDeck, onView }) {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decks.filter((d) => {
      if (tab === "reports" && !d.report) return false;
      if (!q) return true;
      return (
        d.title?.toLowerCase().includes(q) ||
        d.slug?.toLowerCase().includes(q) ||
        d.theme?.toLowerCase().includes(q)
      );
    });
  }, [decks, tab, query]);

  const grouped = useMemo(() => {
    const out = new Map();
    for (const d of filtered) {
      const g = dateGroup(d.updated);
      if (!out.has(g)) out.set(g, []);
      out.get(g).push(d);
    }
    return out;
  }, [filtered]);

  const reportCount = decks.filter((d) => d.report).length;

  return (
    <aside className={`flex shrink-0 flex-col bg-panel transition-[width] ${open ? "w-64" : "w-14"}`}>
      {open ? (
        <>
          <div className="flex items-center gap-1 px-3 pt-3">
            <TabButton active={tab === "all"} onClick={() => setTab("all")}>All decks</TabButton>
            <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>
              Reports
              {reportCount > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${tab === "reports" ? "bg-hover" : "bg-prompt"}`}>
                  {reportCount}
                </span>
              )}
            </TabButton>
          </div>

          <div className="relative px-3 pt-2.5">
            <SearchIcon className="pointer-events-none absolute left-4.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search decks"
              className="w-full rounded-lg border border-line bg-sunken py-1.5 pl-8 pr-3 text-[12.5px] text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent"
            />
          </div>

          <div className="mt-3 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
            {GROUPS.map((g) => {
              const list = grouped.get(g);
              if (!list?.length) return null;
              return (
                <div key={g}>
                  <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{g}</div>
                  <div className="space-y-0.5">
                    {list.map((d) => (
                      <button
                        key={d.slug}
                        onClick={() => onOpenDeck(d.slug)}
                        title={`${d.title}\n${new Date(d.updated).toLocaleString()}`}
                        className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition ${
                          activeSlug === d.slug ? "bg-raised" : "hover:bg-hover"
                        }`}
                      >
                        <DeckThumb slug={d.slug} title={d.title} theme={d.theme} className="h-9 w-9 shrink-0 rounded-md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-fg">{d.title}</span>
                          <span className="block truncate text-[10.5px] text-fg-faint">
                            {d.slides} slides · {relative(d.updated)}
                          </span>
                        </span>
                        {d.report && <DocIcon className="h-3.5 w-3.5 shrink-0 text-fg-faint" />}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="rounded-card border border-dashed border-line px-3 py-6 text-center text-[11px] leading-relaxed text-fg-faint">
                {tab === "reports"
                  ? "No reports yet — generate one from a deck's Report panel or the home prompt."
                  : query.trim()
                    ? `No decks match "${query.trim()}"`
                    : "No decks yet — start one from the home prompt."}
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-line p-2.5">
            <div className="mb-2 space-y-0.5">
              <NavRow active={view === "themes"} icon={PaletteIcon} label="Themes" onClick={() => onView("themes")} />
              <NavRow active={view === "identity"} icon={IdIcon} label="Identity" onClick={() => onView("identity")} />
            </div>
            <Button variant="primary" className="w-full" onClick={onNewDeck}>
              <PlusIcon className="h-3.5 w-3.5" />
              New deck
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1 py-3">
          <IconButton active={view === "home"} icon={LayersIcon} title="Home" onClick={() => onView("home")} />
          <IconButton active={view === "themes"} icon={PaletteIcon} title="Themes" onClick={() => onView("themes")} />
          <IconButton active={view === "identity"} icon={IdIcon} title="Identity" onClick={() => onView("identity")} />
          <div className="mt-auto" />
          <IconButton icon={PlusIcon} title="New deck" onClick={onNewDeck} />
        </div>
      )}
    </aside>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`pill px-2.5 py-1 text-[12px] font-medium transition ${
        active ? "bg-prompt text-fg" : "text-fg-faint hover:bg-raised hover:text-fg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function NavRow({ active, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
        active ? "bg-raised" : "hover:bg-hover"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-accent" : "text-fg-faint"}`} />
      <span className={`text-[13px] font-medium ${active ? "text-fg" : "text-fg-muted"}`}>{label}</span>
      <ChevronDown className="ml-auto h-3 w-3 -rotate-90 text-fg-faint" />
    </button>
  );
}

function IconButton({ icon: Icon, title, onClick, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-9 w-9 place-items-center rounded-lg transition ${
        active ? "bg-raised text-accent" : "text-fg-faint hover:bg-hover hover:text-fg"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
