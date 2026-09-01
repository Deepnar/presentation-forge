import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { SearchIcon } from "../components/icons.jsx";
import Footer from "../components/Footer.jsx";

/**
 * Marketing themes showcase — distinct from the app's Themes grid.
 * Dark editorial, full-bleed cards, larger type. Same data (GET /api/themes)
 * but a marketing surface for the tour. Authed visitors get a CTA to the app grid;
 * visitors get a Sign-up door.
 */
export default function TourThemes({ onAuth, authed = false }) {
  const [themes, setThemes] = useState(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api.themes().then((r) => setThemes(r.themes)).catch(() => setThemes([]));
  }, []);
  const filtered = useMemo(() => {
    if (!themes) return null;
    const q = query.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter((t) => t.label?.toLowerCase().includes(q) || t.name?.toLowerCase().includes(q) || t.summary?.toLowerCase().includes(q));
  }, [themes, query]);

  return (
    <div className="min-h-full">
      {/* light hero band */}
      <div className="border-b border-line bg-base px-6 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-sunken px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {themes?.length ?? "\u2014"} design languages
          </div>
          <h1 className="mt-4 max-w-2xl text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.03em] text-fg sm:text-[3.2rem]">
            Every deck gets its own <span className="bg-gradient-to-r from-[#0B0F1A] to-black bg-clip-text text-transparent">design language.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
            One YAML file per theme — <em className="text-fg">tokens</em> drive the renderer, <em className="text-fg">voice</em> steers the model. No overlap, no hex leaking into prompts. Each card below is drawn live from the theme’s own values.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <a href={authed ? "#/themes" : "#/home"} onClick={authed ? undefined : (e) => { e.preventDefault(); onAuth?.("register"); }} className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-hi">
              {authed ? "Open app gallery" : "Start a chat to use these"}
            </a>
            <a href="#/home" className="rounded-full border border-line bg-panel px-4 py-2 text-[13px] font-medium text-fg-muted hover:bg-hover hover:text-fg">Back to tour</a>
          </div>
          <div className="relative mt-8 max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by vibe or name…"
              className="w-full rounded-full border border-line bg-panel py-2 pl-9 pr-3 text-[14px] text-fg outline-none placeholder:text-fg-faint focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* gallery — light, full height */}
      <div className="bg-base px-6 pb-32 sm:px-10">
        <div className="mx-auto max-w-6xl">
          {themes === null && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[300px] rounded-2xl bg-sunken skeleton" />)}
            </div>
          )}
          {filtered?.length === 0 && (
            <div className="rounded-2xl border border-line bg-panel p-12 text-center text-fg-muted">
              No themes match “{query.trim()}”.
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 auto-rows-fr">
            {filtered?.map((t) => (
              <MarketingThemeCard key={t.name} theme={t} onAuth={onAuth} authed={authed} />
            ))}
          </div>
          <div className="mt-10 text-center text-[12px] text-fg-faint">
            The app’s gallery at <a href="#/themes" className="text-fg-muted hover:text-fg underline"> #/themes</a> lets you set your default — your next deck starts there.
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

/**
 * A theme card that shows the theme.
 *
 * The specimen used to be `useThumb = false` — a flat rectangle of the title
 * background, which is the one thing every theme has in common and tells a
 * reader nothing. The committed thumbnails are real renders of a specimen
 * with branding off (see tools/gallery.mjs and the .gitignore note), so there
 * is no institutional mark to keep out of them, and they are the only thing
 * on this page that actually distinguishes one theme from another.
 *
 * Colours come from tokens rather than the literal slate the card was built
 * in, so the surrounding page can be light or dark without the cards staying
 * on one ground.
 */
function MarketingThemeCard({ theme, onAuth, authed }) {
  const p = theme.palette;
  const title = theme.surfaces?.title ?? {};
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = Boolean(theme.thumb) && !thumbFailed;

  const body = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden" style={{ background: title.bg ?? p.ink }}>
        {showThumb && (
          <img
            src={theme.thumb}
            alt={`The ${theme.label} theme, rendered`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setThumbFailed(true)}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col border-t border-line p-5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[15px] font-semibold text-fg">{theme.label}</div>
          <code className="font-mono text-[10px] text-fg-faint">{theme.name}</code>
        </div>
        {theme.summary && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{theme.summary}</p>}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1">
            {[p.bg, p.surface, p.ink, p.accent, p.accent_alt].filter(Boolean).slice(0, 5).map((c, i) => (
              <span key={`${c}-${i}`} className="h-4 w-4 rounded-[3px] ring-1 ring-line" style={{ background: c }} />
            ))}
          </div>
          <span className="truncate font-mono text-[11px] text-fg-faint">{theme.fonts.heading} / {theme.fonts.body}</span>
        </div>
      </div>
    </>
  );

  const shell =
    "group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left shadow-[var(--shadow-card)] transition hover:border-line-strong hover:shadow-[var(--shadow-card-hover)]";

  // A visitor is here to look. Making every card a door to the register modal
  // asks them to sign up for the thing they are currently looking at.
  if (!authed) return <div className={shell}>{body}</div>;
  return <a href="#/themes" className={shell}>{body}</a>;
}
