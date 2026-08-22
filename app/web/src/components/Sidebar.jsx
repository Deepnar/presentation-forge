import { useEffect, useMemo, useRef, useState } from "react";
import { dateGroup, relative } from "../lib/time.js";
import { api } from "../api.js";
import DeckThumb from "./DeckThumb.jsx";
import ProfileChip from "./ProfileChip.jsx";
import { Button } from "./ui.jsx";
import { ChevronDown, DocIcon, IdIcon, LayersIcon, PaletteIcon, PanelLeftOpen, PlusIcon, SearchIcon } from "./icons.jsx";

const GROUPS = ["Today", "Yesterday", "This week", "This month", "Earlier"];

/**
 * The per-user navigation. Two tabs: Chats (the conversation threads that end
 * in decks or reports) and Decks (your actual artefacts). Search filters the
 * deck list and greps content server-side; the chats need no search yet. The
 * one creation entry app-wide lives here — "+ New chat". Collapses to an icon
 * rail; Themes and Settings are compact rows at the bottom. Each row carries a
 * "⋯" menu on hover — delete a chat (local) or open/delete a deck (server-side,
 * behind a confirm modal). Settings opens the modal, not a view.
 */
export default function Sidebar({
  chats, decks, activeChatId, activeSlug, view, open, focusSearch,
  onOpenChat, onOpenDeck, onOpenReport, onNewChat, onDeleteChat, onDeleteDeck,
  user, identity, onOpenSettings, onOpenProfile, onToggleLeft,
}) {
  const [tab, setTab] = useState("chats"); // chats | projects
  const [query, setQuery] = useState("");
  const [contentHits, setContentHits] = useState([]);
  const [openMenu, setOpenMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setContentHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.searchDecks(q);
        setContentHits(r.hits ?? []);
      } catch { /* offline or API down — keep local results */ }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // Ctrl+K lands here from anywhere: switch to the Projects tab and focus search.
  useEffect(() => {
    if (focusSearch > 0) {
      setTab("projects");
      requestAnimationFrame(() => {
        document.querySelector("input[placeholder='Search projects']")?.focus();
      });
    }
  }, [focusSearch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = decks.filter((d) => {
      if (!q) return true;
      return (
        d.title?.toLowerCase().includes(q) ||
        d.slug?.toLowerCase().includes(q) ||
        d.theme?.toLowerCase().includes(q)
      );
    });
    const bySlug = new Map(decks.map((d) => [d.slug, d]));
    const extra = contentHits
      .map((s) => bySlug.get(s))
      .filter(Boolean)
      .filter((d) => !local.includes(d));
    return [...local, ...extra];
  }, [decks, query, contentHits]);

  const grouped = useMemo(() => {
    const out = new Map();
    for (const c of chats) {
      const g = dateGroup(c.updatedAt);
      if (!out.has(g)) out.set(g, []);
      out.get(g).push(c);
    }
    return out;
  }, [chats]);

  return (
    <aside className={`flex shrink-0 flex-col bg-panel transition-[width] duration-[var(--dur-shell)] ease-[var(--ease-shell)] ${open ? "w-64" : "w-14"}`}>
      {open ? (
        <>
          <div className="flex items-center gap-1 px-3 pt-3">
            <TabButton active={tab === "chats"} onClick={() => setTab("chats")}>
              Chats
              {chats.length > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${tab === "chats" ? "bg-hover" : "bg-prompt"}`}>
                  {chats.length}
                </span>
              )}
            </TabButton>
            <TabButton active={tab === "projects"} onClick={() => setTab("projects")}>Projects</TabButton>
            <button
              onClick={onToggleLeft}
              title="Collapse navigation"
              aria-label="Collapse navigation"
              className="ml-auto grid h-7 w-7 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m13 8 3 4-3 4" /></svg>
            </button>
          </div>

          {tab === "projects" && (
            <div className="relative px-3 pt-2.5">
              <SearchIcon className="pointer-events-none absolute left-4.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                className="w-full rounded-lg border border-line bg-sunken py-1.5 pl-8 pr-3 text-[12.5px] text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent"
              />
            </div>
          )}

          <div className="mt-3 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
            {tab === "chats" && (
              <>
                <div className="flex items-center gap-2 border-b border-line/50 pb-2">
                  <a href="#/home" className="flex items-center gap-1.5 rounded-md px-1 py-1 transition hover:bg-hover" title="Go to landing">
                    <img src="/logo.svg" alt="Presentation Forge" className="h-6 w-6 rounded-md" />
                    <span className="text-[12px] font-semibold tracking-tight">Forge</span>
                  </a>
                  <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="ml-auto grid h-7 w-7 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg" title="GitHub">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.14c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.14c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg>
                  </a>
                </div>
                <button
                  onClick={() => onNewChat("deck")}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-accent-hi"
                >
                  <PlusIcon className="h-4 w-4" />
                  New chat
                </button>
                {GROUPS.map((g) => {
                  const list = grouped.get(g);
                  if (!list?.length) return null;
                  return (
                    <div key={g}>
                      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{g}</div>
                      <div className="space-y-0.5">
                        {list.map((c) => (
                          <div key={c.id} className="group relative">
                            <a
                              href={`#/chat/${c.id}`}
                              onClick={(e) => { if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) { e.preventDefault(); onOpenChat(c.id); } }}
                              title={c.title}
                              className={`flex w-full items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-8 text-left transition ${
                                activeChatId === c.id
                                  ? "bg-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                                  : "hover:bg-hover"
                              }`}
                            >
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-sunken">
                                <span className="h-2.5 w-2.5 rounded-full bg-accent/60"></span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] font-medium text-fg">{c.title}</span>
                                <span className="block truncate text-[10.5px] text-fg-faint">
                                  {c.kind === "report" ? "report" : "deck"} · {c.produced ? "ready · " : ""}{relative(c.updatedAt)}
                                </span>
                              </span>
                            </a>
                            <RowMenu
                              open={openMenu === `c-${c.id}`}
                              onToggle={(v) => setOpenMenu(v ? `c-${c.id}` : null)}
                              items={[
                                { label: "Delete chat", danger: true, onClick: () => onDeleteChat(c.id) },
                              ]}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {chats.length === 0 && (
                  <div className="empty-state-mini rounded-card border border-dashed border-line px-3 py-6 text-[11px] leading-relaxed text-fg-faint">
                    <div className="empty-ring h-8 w-8">
                      <PlusIcon className="h-3.5 w-3.5" />
                    </div>
                    <div>No chats yet — start one below. The machine drafts, you do the final touches.</div>
                  </div>
                )}
              </>
            )}

            {tab === "projects" && (
              <>
                <div className="space-y-0.5">
                  {filtered.map((d) => (
                    <div key={d.slug} className="group relative">
                      <a
                        href={`#/deck/${d.slug}`}
                        onClick={(e) => { if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) { e.preventDefault(); onOpenDeck(d.slug); } }}
                        title={d.title}
                        className={`flex w-full items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-8 text-left transition ${
                          activeSlug === d.slug
                            ? "bg-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                            : "hover:bg-hover"
                        }`}
                      >
                        <DeckThumb slug={d.slug} title={d.title} theme={d.theme} className="h-9 w-9 shrink-0 rounded-md" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-fg">{d.title}</span>
                          <span className="block truncate text-[10.5px] text-fg-faint">
                            {d.report ? "report" : `${d.slides} slides`} · {relative(d.updated)}
                          </span>
                        </span>
                        {d.report && <DocIcon className="h-3.5 w-3.5 shrink-0 text-fg-faint" />}
                      </a>
                      <RowMenu
                        open={openMenu === `d-${d.slug}`}
                        onToggle={(v) => setOpenMenu(v ? `d-${d.slug}` : null)}
                        items={[
                          { label: "Open", onClick: () => onOpenDeck(d.slug) },
                          { label: "Delete project", danger: true, onClick: () => setConfirmDelete(d) },
                        ]}
                      />
                    </div>
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div className="empty-state-mini rounded-card border border-dashed border-line px-3 py-6 text-[11px] leading-relaxed text-fg-faint">
                    <div className="empty-ring h-8 w-8">
                      <SearchIcon className="h-3.5 w-3.5" />
                    </div>
                    {query.trim()
                      ? <div>No projects match <span className="text-fg-muted">“{query.trim()}”</span></div>
                      : <div>No projects yet — one starts from a chat. The machine drafts, you do the final touches.</div>}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-auto border-t border-line p-2.5">
            <div className="mb-2 space-y-0.5">
              <NavRow active={view === "themes"} icon={PaletteIcon} label="Themes" href="#/themes" />
              <SettingsRow icon={IdIcon} label="Settings" onClick={onOpenSettings} />
            </div>
            <div className="mt-2 border-t border-line/60 pt-2">
              <ProfileChip
                user={user}
                identity={identity}
                onOpenSettings={onOpenProfile ?? onOpenSettings}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center gap-1 py-3">
          <IconButton icon={PanelLeftOpen} title="Expand navigation" onClick={onToggleLeft} />
          <IconButton icon={PlusIcon} title="New chat" onClick={() => onNewChat("deck")} />
          <IconButton
            icon={LayersIcon}
            title="Projects"
            onClick={() => {
              setTab("projects");
              if (!open && onToggleLeft) onToggleLeft();
            }}
          />
          <IconButton active={view === "themes"} icon={PaletteIcon} title="Themes" href="#/themes" />
          <IconButton icon={IdIcon} title="Settings" onClick={onOpenSettings} />
          <div className="mt-auto flex w-full flex-col items-center gap-1 border-t border-line pt-2">
            <ProfileChip
              collapsed
              user={user}
              identity={identity}
              onOpenSettings={onOpenProfile ?? onOpenSettings}
            />
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          deck={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { onDeleteDeck(confirmDelete.slug); setConfirmDelete(null); }}
        />
      )}
    </aside>
  );
}

/** The hover "⋯" popover on a sidebar row. Outside click closes it. */
function RowMenu({ open, onToggle, items }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onToggle(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onToggle]);

  return (
    <div ref={ref} className="absolute right-1.5 top-1/2 z-20 -translate-y-1/2">
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(!open); }}
        title="More"
        aria-label="More"
        className={`grid h-6 w-6 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg ${
          open ? "bg-hover text-fg opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <span className="text-[14px] leading-none">⋯</span>
      </button>
      {open && (
        <div className="absolute right-0 top-7 min-w-36 rounded-card border border-line bg-panel py-1 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.8)]">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onToggle(false); it.onClick?.(); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition ${
                it.danger ? "text-danger hover:bg-hover" : "text-fg-muted hover:bg-hover hover:text-fg"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Deck-delete confirmation — deleting decks/<slug> server-side is irreversible. */
function ConfirmModal({ deck, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-sunken/95 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-card border border-line bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[14px] font-semibold text-fg">Delete this deck?</div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
          Removes <code className="font-mono">decks/{deck.slug}</code> from the server —
          slides, research and render included. This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-danger px-2.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90 active:translate-y-px"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
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

function NavRow({ active, icon: Icon, label, href }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        // These are pure view anchors (#/themes): let the hash change — the
        // App's hashchange listener switches the view. Middle-click and
        // copy-link keep working. (preventDefault here used to swallow the
        // navigation entirely, leaving the view stuck.)
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      }}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
        active ? "bg-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" : "hover:bg-hover"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-accent" : "text-fg-faint"}`} />
      <span className={`text-[13px] font-medium ${active ? "text-fg" : "text-fg-muted"}`}>{label}</span>
      <ChevronDown className="ml-auto h-3 w-3 -rotate-90 text-fg-faint" />
    </a>
  );
}

/** Settings is a modal, not a view — the row opens it rather than routing. */
function SettingsRow({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-hover"
    >
      <Icon className="h-4 w-4 shrink-0 text-fg-faint" />
      <span className="text-[13px] font-medium text-fg-muted">{label}</span>
      <ChevronDown className="ml-auto h-3 w-3 -rotate-90 text-fg-faint" />
    </button>
  );
}

function IconButton({ icon: Icon, title, onClick, href, active }) {
  const inner = (
    <>
      <Icon className="h-4 w-4" />
    </>
  );
  const cls = `grid h-9 w-9 place-items-center rounded-lg transition ${
    active ? "bg-raised text-accent" : "text-fg-faint hover:bg-hover hover:text-fg"
  }`;
  if (href) {
    return (
      <a
        href={href}
        title={title}
        aria-label={title}
        onClick={(e) => {
          // Pure view anchors — let the hash change; the App's hashchange
          // listener switches the view (see NavRow).
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        }}
        className={cls}
      >
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} title={title} aria-label={title} className={cls}>
      {inner}
    </button>
  );
}
