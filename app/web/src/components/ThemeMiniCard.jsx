import { useState } from "react";

/**
 * A compact visual specimen of one theme, drawn live from its own tokens — the
 * same "can't be stale" approach as the Themes gallery, sized for the briefing
 * card. It is what "I see the theme, not just names" means: the palette, type
 * and title treatment on a mini 16:9 canvas, not a dropdown. Plate themes show
 * their real rendered background thumbnail instead, falling back to the token
 * synthesis when the thumbnail has not been generated.
 */
export default function ThemeMiniCard({ theme, selected, onClick, defaultTheme = false, hideSpecimen = false }) {
  const p = theme.palette;
  const title = theme.surfaces?.title ?? {};
  const label = theme.label;
  const sub = defaultTheme ? `${label} · default` : label;
  const [thumbFailed, setThumbFailed] = useState(false);
  const useThumb = theme.plate && !thumbFailed;

  return (
    <button
      type="button"
      onClick={() => onClick?.(theme.name)}
      title={`${label} (${theme.name})`}
      className={`card-hover group relative flex h-[220px] w-full flex-col overflow-hidden rounded-card border bg-panel text-left transition ${
        selected
          ? "border-accent ring-2 ring-accent/40"
          : "border-line hover:border-line-strong"
      }`}
    >
      {/* Title band — fixed height, uniform */}
      <div
        className="relative flex h-[110px] shrink-0 flex-col justify-end px-2.5 pb-2 pt-2"
        style={{ background: title.bg ?? p.ink }}
      >
        <div className="relative z-10">
          <div
            className="truncate leading-tight"
            style={{
              color: title.ink ?? p.surface,
              fontFamily: `"${theme.fonts.heading}", serif`,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: "-0.01em",
            }}
          >
            Title
          </div>
          <div
            className="mt-0.5 truncate"
            style={{
              color: title.muted ?? p.ink_muted,
              fontFamily: `"${theme.fonts.body}", sans-serif`,
              fontSize: 7.5,
              fontStyle: "italic",
            }}
          >
            subtitle line
          </div>
        </div>
        {useThumb && (
          <img
            src={theme.thumb}
            alt=""
            className="absolute inset-0 z-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        )}
      </div>

      {/* Content strip — hidden on tour per request to keep thumbnail clean */}
      {!hideSpecimen && (
        <div className="flex h-[52px] shrink-0 items-center gap-1.5 px-2.5" style={{ background: p.bg }}>
          <span className="rounded-full px-1.5 py-[2px] text-[6px] font-bold" style={{ background: p.accent, color: p.on_accent ?? "#fff" }}>
            01
          </span>
          <div
            className="h-5 min-w-0 flex-1 rounded-[3px] px-1.5 py-1"
            style={{ background: p.surface, fontFamily: `"${theme.fonts.body}", sans-serif` }}
          >
            <div className="h-[3px] w-3/4 rounded-full" style={{ background: p.ink_muted }} />
          </div>
        </div>
      )}

      {/* Name bar — fixed height */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-line bg-sunken px-2.5">
        <span className={`min-w-0 truncate text-[10px] font-medium ${selected ? "text-accent" : "text-fg-muted"}`}>
          {sub}
        </span>
        <span className="shrink-0 truncate font-mono text-[8.5px] text-fg-faint">
          {theme.fonts.heading} <span className="text-line-strong">/</span> {theme.fonts.body}
        </span>
        {selected && (
          <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
        )}
      </div>
    </button>
  );
}
