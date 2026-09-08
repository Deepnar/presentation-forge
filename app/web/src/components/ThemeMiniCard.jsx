import { useState } from "react";

export default function ThemeMiniCard({ theme, selected, onClick, defaultTheme = false, hideSpecimen = false }) {
  const p = theme.palette;
  const title = theme.surfaces?.title ?? {};
  const label = theme.label;
  const sub = defaultTheme ? `${label} · default` : label;
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = Boolean(theme.thumb) && !thumbFailed;

  return (
    <button
      type="button"
      onClick={() => onClick?.(theme.name)}
      title={`${label} (${theme.name})`}
      className={`card-hover group relative flex w-full flex-col overflow-hidden rounded-card border bg-panel text-left transition ${
        selected
          ? "border-accent ring-2 ring-accent/40"
          : "border-line hover:border-line-strong"
      }`}
    >
      {/* The specimen. 32:9 — two 16:9 slides side by side, as generated. */}
      <div
        className="relative aspect-[32/9] w-full shrink-0 overflow-hidden"
        style={{ background: title.bg ?? p.ink }}
      >
        {showThumb ? (
          <img
            src={theme.thumb}
            alt={`${label} — title and body slide`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 grid grid-cols-2">
            <div className="flex flex-col justify-end p-3" style={{ background: title.bg ?? p.ink }}>
              <div
                className="truncate text-[13px] font-semibold leading-tight"
                style={{ color: title.ink ?? p.surface, fontFamily: `"${theme.fonts?.heading}", serif` }}
              >
                The shape of an argument
              </div>
              <div className="mt-1 h-[2px] w-10 rounded-full" style={{ background: title.accent ?? p.accent }} />
            </div>
            <div className="flex flex-col justify-center gap-1.5 p-3" style={{ background: p.bg }}>
              <div
                className="truncate text-[11px] font-semibold"
                style={{ color: p.ink, fontFamily: `"${theme.fonts?.heading}", serif` }}
              >
                The argument in order
              </div>
              {[0.9, 0.75, 0.6].map((w, i) => (
                <div key={i} className="h-[3px] rounded-full" style={{ width: `${w * 100}%`, background: p.ink_muted, opacity: 0.5 }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-t border-line bg-sunken px-3.5">
        <span className={`min-w-0 truncate text-[14px] font-semibold ${selected ? "text-accent" : "text-fg-muted"}`}>
          {sub}
        </span>
        <span className="hidden shrink-0 truncate font-mono text-[10.5px] text-fg-faint sm:inline">
          {theme.fonts?.heading} <span className="text-fg-faint">/</span> {theme.fonts?.body}
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
