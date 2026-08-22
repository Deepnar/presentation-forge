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
      {/* dark hero band */}
      <div className="border-b border-white/10 bg-[#0B0F1A] px-6 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            38 design languages
          </div>
          <h1 className="mt-4 max-w-2xl text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.03em] text-white sm:text-[3.2rem]">
            Every deck gets its own <span className="bg-gradient-to-r from-[#8B5CF6] to-[#6D5BFF] bg-clip-text text-transparent">design language.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/60">
            One YAML file per theme — <em className="text-white/80">tokens</em> drive the renderer, <em className="text-white/80">voice</em> steers the model. No overlap, no hex leaking into prompts. Each card below is drawn live from the theme’s own values.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <a href={authed ? "#/themes" : "#/home"} onClick={authed ? undefined : (e) => { e.preventDefault(); onAuth?.("register"); }} className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0B0F1A] hover:bg-white/90">
              {authed ? "Open app gallery" : "Start a chat to use these"}
            </a>
            <a href="#/home" className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] font-medium text-white hover:bg-white/10">Back to tour</a>
          </div>
          <div className="relative mt-8 max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by vibe or name…"
              className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* gallery — not cut off, full height, no max-h */}
      <div className="bg-[#0B0F1A] px-6 pb-32 sm:px-10">
        <div className="mx-auto max-w-6xl">
          {themes === null && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[300px] rounded-2xl bg-white/5 skeleton" />)}
            </div>
          )}
          {filtered?.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-white/60">
              No themes match “{query.trim()}”.
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 auto-rows-fr">
            {filtered?.map((t) => (
              <MarketingThemeCard key={t.name} theme={t} onAuth={onAuth} authed={authed} />
            ))}
          </div>
          <div className="mt-10 text-center text-[12px] text-white/40">
            The app’s gallery at <a href="#/themes" className="text-white/70 hover:text-white underline"> #/themes</a> lets you set your default — your next deck starts there.
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function MarketingThemeCard({ theme, onAuth, authed }) {
  const p = theme.palette;
  const title = theme.surfaces?.title ?? {};
  const [thumbFailed, setThumbFailed] = useState(false);
  const useThumb = theme.plate && !thumbFailed;
  const link = authed ? "#/themes" : "#/home";
  const onClick = (e) => {
    if (!authed) { e.preventDefault(); onAuth?.("register"); }
  };
  return (
    <a
      href={link}
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111827] text-left shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:border-accent/30 hover:shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
    >
      {/* specimen — larger editorial aspect */}
      <div className="relative flex aspect-[16/10] flex-col justify-end p-4" style={{ background: title.bg ?? p.ink }}>
        <div className="relative z-10">
          <div className="truncate leading-tight" style={{ color: title.ink ?? p.surface, fontFamily: `"${theme.fonts.heading}", serif`, fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>
            Title
          </div>
          <div className="mt-1 truncate" style={{ color: title.muted ?? p.ink_muted, fontFamily: `"${theme.fonts.body}", sans-serif`, fontSize: 12, fontStyle: "italic" }}>
            subtitle line — editorial scale
          </div>
        </div>
        {useThumb && (
          <img src={theme.thumb} alt="" className="absolute inset-0 z-0 h-full w-full object-cover opacity-90" loading="lazy" onError={() => setThumbFailed(true)} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
      </div>
      <div className="flex h-[62px] items-center gap-2 px-4" style={{ background: p.bg }}>
        <span className="rounded-full px-2 py-[3px] text-[8px] font-bold tracking-[0.08em]" style={{ background: p.accent, color: p.on_accent ?? "#fff" }}>01</span>
        <div className="h-7 min-w-0 flex-1 rounded-[4px] px-2 py-1.5" style={{ background: p.surface, fontFamily: `"${theme.fonts.body}", sans-serif` }}>
          <div className="h-[4px] w-3/4 rounded-full" style={{ background: p.ink_muted }} />
          <div className="mt-1.5 h-[3px] w-1/2 rounded-full opacity-60" style={{ background: p.ink_muted }} />
        </div>
      </div>
      <div className="flex flex-1 flex-col bg-[#0F1629] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[15px] font-medium text-white group-hover:text-white">{theme.label}</div>
          <code className="font-mono text-[10px] text-white/30">{theme.name}</code>
        </div>
        {theme.summary && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-white/50">{theme.summary}</p>}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">
            {[p.bg, p.surface, p.ink, p.accent, p.accent_alt].filter(Boolean).slice(0, 5).map((c, i) => (
              <span key={`${c}-${i}`} className="h-3.5 w-3.5 rounded-[3px] ring-1 ring-white/10" style={{ background: c }} />
            ))}
          </div>
          <span className="font-mono text-[10px] text-white/25">{theme.fonts.heading} / {theme.fonts.body}</span>
        </div>
      </div>
    </a>
  );
}
