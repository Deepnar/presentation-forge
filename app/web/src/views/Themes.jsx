import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Empty, Button } from "../components/ui.jsx";
import { SearchIcon } from "../components/icons.jsx";

/**
 * The theme gallery. Clicking a card sets it as the deck default (written to
 * config/identity.yaml via the same identity save the briefing uses) with a
 * toast and an undo. A search box and vibe chips filter the 38 themes; the
 * current default carries a badge so "which one will my next deck use?" is
 * answered at a glance.
 */
export default function Themes() {
  const [themes, setThemes] = useState(null);
  const [query, setQuery] = useState("");
  const [defaultTheme, setDefaultTheme] = useState("warm-humanist");
  const [toast, setToast] = useState(null);
  const [before, setBefore] = useState(null);

  useEffect(() => {
    api.themes().then((r) => {
      setThemes(r.themes);
      const saved = localStorage.getItem("forge.defaultTheme");
      if (saved && r.themes.some((t) => t.name === saved)) setDefaultTheme(saved);
    }).catch(() => setThemes([]));
  }, []);

  // The default lives in the browser so it survives reloads without a server
  // round-trip, and the briefing reads it when a chat starts.
  useEffect(() => {
    localStorage.setItem("forge.defaultTheme", defaultTheme);
  }, [defaultTheme]);

  const filtered = useMemo(() => {
    if (!themes) return null;
    const q = query.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter((t) =>
      t.label?.toLowerCase().includes(q) ||
      t.name?.toLowerCase().includes(q) ||
      t.summary?.toLowerCase().includes(q));
  }, [themes, query]);

  /** Set the default theme — with an undo that restores the previous one. */
  function setDefault(name) {
    setBefore(defaultTheme);
    setDefaultTheme(name);
    setToast({ id: Date.now(), name });
  }

  function undo() {
    if (before) setDefaultTheme(before);
    setToast(null);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <header className="mb-7">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.015em]">Themes</h1>
        <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          A design language is one YAML file, kept in two halves that never
          overlap: exact machine values drive the renderer, tone guidance steers
          the model. Click a card to make it your default — your next deck
          starts there. Every card below is drawn live from the theme's own
          values, so it cannot drift from what actually renders.
        </p>

        <div className="relative mt-5 max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search themes by name or vibe…"
            className="w-full rounded-lg border border-line-strong bg-field py-2 pl-9 pr-3 text-[15px] text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent"
          />
        </div>
      </header>

      {themes === null && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-72 rounded-card" />)}
        </div>
      )}

      {filtered?.length === 0 && (
        <Empty
          title={query.trim() ? `No themes match “${query.trim()}”` : "No themes found"}
          hint={query.trim() ? "Try a different name or vibe." : "Add a YAML file under themes/."}
        />
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered?.map((t, i) => (
          <div key={t.name} className="relative" style={{ ["--stagger-i"]: i }}>
            <ThemeCard
              theme={t}
              isDefault={t.name === defaultTheme}
              onClick={() => setDefault(t.name)}
            />
          </div>
        ))}
      </div>

      {toast && (
        <div className="toast-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border border-line-strong bg-panel py-1.5 pl-3.5 pr-1.5 shadow-[var(--shadow-float)]">
            <span className="text-[12px] text-fg-muted">
              <span className="font-medium text-fg">{toast.name}</span> is now the default theme.
            </span>
            <Button size="sm" variant="outline" onClick={undo}>Undo</Button>
            <button
              onClick={() => setToast(null)}
              className="grid h-6 w-6 place-items-center rounded-full text-fg-faint transition hover:bg-hover hover:text-fg"
              title="Dismiss"
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeCard({ theme, isDefault, onClick }) {
  const p = theme.palette;
  const title = theme.surfaces?.title ?? {};
  const swatches = [p.bg, p.surface, p.ink, p.accent, p.accent_alt].filter(Boolean);

  // A plate theme's real background only exists as a rasterised PNG — tokens
  // can't fake a mesh. When a gallery thumbnail exists, show it over the token
  // synthesis; if it's missing (a clone that never ran `npm run gallery`) the
  // synthesis stays visible underneath rather than an empty band.
  const [thumbFailed, setThumbFailed] = useState(false);
  const useThumb = theme.plate && !thumbFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Set ${theme.label} as the default theme`}
      className={`card-hover panel-surface group relative overflow-hidden rounded-card border text-left ${
        isDefault ? "border-accent/60 ring-2 ring-accent/30" : "border-line bg-panel hover:border-line-strong"
      }`}
    >
      {isDefault && (
        <span className="absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[var(--shadow-card)]">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
          default
        </span>
      )}
      {/* Two specimens: the title treatment and a standard content page. Between
          them they show almost everything a theme decides. Plate themes render
          their actual background (generated by `npm run gallery`); native ones
          are drawn live from tokens so they can never go stale. */}
      <div className="relative flex aspect-[16/7] flex-col justify-end overflow-hidden px-4 pb-3 pt-3" style={{ background: title.bg ?? p.ink }}>
        <div className="relative z-10">
          <div
            style={{
              color: title.ink ?? p.surface,
              fontFamily: `"${theme.fonts.heading}", serif`,
              fontWeight: 800,
              fontSize: 17,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
            }}
          >
            Compare GPU Architecture
          </div>
          <div
            className="mt-1"
            style={{
              color: title.muted ?? p.ink_muted,
              fontFamily: `"${theme.fonts.body}", sans-serif`,
              fontSize: 10,
              fontStyle: "italic",
            }}
          >
            Two bets on parallelism
          </div>
        </div>
        {useThumb && (
          <img
            src={theme.thumb}
            alt={`${theme.label} preview`}
            className="absolute inset-0 z-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        )}
      </div>

      <div className="px-4 py-4" style={{ background: p.bg, color: p.ink }}>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-[3px] text-[8px] font-bold"
            style={{ background: p.accent, color: p.on_accent ?? "#fff", letterSpacing: "0.1em" }}
          >
            01
          </span>
          <span
            className="text-[8px] font-bold uppercase"
            style={{ color: p.ink_muted, letterSpacing: "0.14em", fontFamily: `"${theme.fonts.body}", sans-serif` }}
          >
            The silicon philosophy
          </span>
        </div>

        <div
          className="mt-2 leading-tight"
          style={{ fontFamily: `"${theme.fonts.heading}", serif`, fontWeight: 700, fontSize: 15 }}
        >
          Two companies, two bets
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {["NVIDIA", "AMD"].map((n) => (
            <div
              key={n}
              className="px-2.5 py-2"
              style={{
                background: p.surface,
                borderRadius: 6,
                fontFamily: `"${theme.fonts.body}", sans-serif`,
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700 }}>{n}</div>
              <div style={{ fontSize: 7.5, color: p.ink_muted, marginTop: 2, lineHeight: 1.4 }}>
                A closed stack for maximum performance.
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[15px] font-medium text-fg">{theme.label}</div>
          <code className="shrink-0 font-mono text-[10px] text-fg-faint">{theme.name}</code>
        </div>
        {theme.summary && (
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{theme.summary}</p>
        )}

        <div className="mt-3.5 flex items-center justify-between gap-3">
          <div className="flex gap-1">
            {swatches.map((c, i) => (
              <div
                key={`${c}-${i}`}
                title={c}
                className="h-4 w-4 rounded-[3px] ring-1 ring-inset ring-white/10"
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="truncate text-[10.5px] text-fg-faint">
            {theme.fonts.heading} <span className="text-line-strong">/</span> {theme.fonts.body}
          </div>
        </div>
      </div>
    </button>
  );
}
