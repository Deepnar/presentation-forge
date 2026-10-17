import { useEffect, useMemo, useRef, useState } from "react";
import { dateGroup, relative } from "../lib/time.js";
import { api } from "../api.js";
import ProfileChip from "./ProfileChip.jsx";
import { ChevronDown, DocIcon, GearIcon, IdIcon, PaletteIcon, PanelLeftOpen, PlusIcon } from "./icons.jsx";
import { getModelMode, setModelMode, subscribeModelMode } from "../lib/modelMode.js";

const GROUPS = ["Today", "Yesterday", "This week", "This month", "Earlier"];

function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 4v5c0 4-2.5 7.5-7 9-4.5-1.5-7-5-7-9V7l7-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SidebarToggle({ onOpenSettings }) {
  const [route, setRoute] = useState("auto");
  const [cloudOn, setCloudOn] = useState(false);
  const [autoOn, setAutoOn] = useState(true);
  const [hosted, setHosted] = useState(false);
  useEffect(() => {
    Promise.all([api.autoStatus().catch(() => ({ auto: null })), api.cloud().catch(() => ({ cloud: null }))])
      .then(([a, c]) => {
        const autoData = a.auto ?? a ?? null;
        const cloudData = c.cloud ?? null;
        setAutoOn(Boolean(autoData?.keySet));
        setHosted(Boolean(autoData?.hosted || c.hosted));
        setCloudOn(Boolean(cloudData?.configured && cloudData.keySet));
        const r = cloudData?.route ?? autoData?.route ?? a.route ?? getModelMode();
        setRoute(r);
      })
      .catch(() => {});
    return subscribeModelMode((m) => setRoute(m));
  }, []);
  const isAuto = route === "auto";
  const isCloud = route === "cloud";
  async function setMode(next) {
    if (next === "auto" && hosted && !autoOn) {
      onOpenSettings?.();
      return;
    }
    if (next === "cloud" && !cloudOn) {
      onOpenSettings?.();
      return;
    }
    try {
      await api.cloudRoute(next);
      setRoute(next);
      setModelMode(next);
    } catch {}
  }
  return (
    <button
      onClick={() => setMode(isCloud ? "auto" : "cloud")}
      title={isAuto ? "Auto — click for Cloud" : "Cloud — click for Auto"}
      className="flex items-center gap-1 rounded-full border border-line bg-sunken p-0.5"
    >
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isAuto ? "bg-accent text-on-accent shadow-sm" : "text-fg-faint"}`}>AUTO</span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isCloud ? "bg-accent text-on-accent shadow-sm" : "text-fg-faint"}`}>CLOUD</span>
    </button>
  );
}

export default function Sidebar({
  chats, activeChatId, view, open,
  onOpenChat, onNewChat, onDeleteChat,
  user, identity, onOpenSettings, onOpenProfile, onToggleLeft, isAdmin, onNavigate,
}) {
  const [openMenu, setOpenMenu] = useState(null);

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
          <div className="flex items-center gap-2 border-b border-line/50 px-3 py-2">
            <a href="#/home" className="flex items-center gap-1.5 rounded-md px-1 py-1 transition hover:bg-hover" title="Go to landing">
              <img src="/logo.svg" alt="Presentation Forge" className="h-6 w-6 rounded-md" />
              <span className="text-[12px] font-semibold tracking-tight">Forge</span>
            </a>
            <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="ml-auto grid h-7 w-7 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg" title="GitHub">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.14c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.14c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg>
            </a>
            <button
              onClick={onToggleLeft}
              title="Collapse navigation"
              aria-label="Collapse navigation"
              className="grid h-7 w-7 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m13 8 3 4-3 4" /></svg>
            </button>
          </div>
          <div className="px-4 pt-3 text-xs font-medium text-fg-muted">Chats {chats.length > 0 && <span className="ml-1 tabular-nums">{chats.length}</span>}</div>

          <div className="mt-3 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
              <>
                <button
                  onClick={() => { onNewChat("deck"); onNavigate?.(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-[13px] font-semibold text-on-accent shadow-sm transition hover:bg-accent-hi"
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
                              onClick={(e) => { if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) { e.preventDefault(); onOpenChat(c.id); onNavigate?.(); } }}
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
                {/* One line, not a second empty state. The screen already
                    carries a full one in the middle, and this card competed
                    with it while pointing "below" at a New chat button that is
                    directly above. */}
                {chats.length === 0 && (
                  <div className="px-2.5 py-3 text-[11.5px] leading-relaxed text-fg-faint">
                    Your chats will appear here.
                  </div>
                )}
              </>
          </div>

          <div className="mt-auto border-t border-line p-2.5">
            <div className="mb-2 space-y-0.5">
              <NavRow active={view === "projects" || view === "project"} icon={DocIcon} label="Projects" href="#/projects" />
              <NavRow active={view === "themes"} icon={PaletteIcon} label="Themes" href="#/themes" />
              <SettingsRow icon={GearIcon} label="Settings" onClick={onOpenSettings} />
              {isAdmin && <NavRow active={view === "admin"} icon={ShieldIcon} label="Admin" href="#/admin" />}
            </div>
            <div className="mt-2 border-t border-line/60 pt-2">
              <ProfileChip
                user={user}
                identity={identity}
                onOpenSettings={onOpenProfile ?? onOpenSettings}
              />
            </div>
            {/* Privacy, terms and the issue tracker existed only in the landing
                page's footer, which never renders once you are signed in — so a
                user working in the app had no route to the policy describing
                what happens to their decks, nor anywhere to report a fault. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 text-[10.5px] text-fg-faint">
              <a href="#/privacy" className="transition hover:text-fg">Privacy</a>
              <span aria-hidden="true">·</span>
              <a href="#/terms" className="transition hover:text-fg">Terms</a>
              <span aria-hidden="true">·</span>
              <a
                href="https://github.com/Deepnar/presentation-forge/issues/new"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-fg"
              >
                Report an issue
              </a>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center gap-1 py-3">
          <IconButton icon={PanelLeftOpen} title="Expand navigation" onClick={onToggleLeft} />
          <IconButton icon={PlusIcon} title="New chat" onClick={() => { onNewChat("deck"); onNavigate?.(); }} />
          <IconButton active={view === "projects" || view === "project"} icon={DocIcon} title="Projects" href="#/projects" />
          <IconButton active={view === "themes"} icon={PaletteIcon} title="Themes" href="#/themes" />
          <IconButton icon={GearIcon} title="Settings" onClick={onOpenSettings} />
          {isAdmin && <IconButton active={view === "admin"} icon={ShieldIcon} title="Admin" href="#/admin" />}
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

    </aside>
  );
}

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

function NavRow({ active, icon: Icon, label, href }) {
  return (
    <a
      href={href}
      onClick={(e) => {
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

function SettingsRow({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-haspopup="dialog"
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-hover"
    >
      <Icon className="h-4 w-4 shrink-0 text-fg-faint" />
      <span className="text-[13px] font-medium text-fg-muted">{label}</span>
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
