import { useState } from "react";

export default function TourThemeCard({ theme }) {
  const p = theme.palette;
  const title = theme.surfaces?.title ?? {};
  const [thumbFailed, setThumbFailed] = useState(false);
  const useThumb = theme.plate && !thumbFailed;
  return (
    <div className="group relative flex h-[280px] w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-sm transition hover:border-line-strong hover:shadow-md">
      <div className="relative flex h-[160px] shrink-0 flex-col justify-end p-4" style={{ background: title.bg ?? p.ink }}>
        <div className="relative z-10">
          <div className="h-3 w-20 rounded-full bg-white/20" />
          <div className="mt-2 h-2 w-32 rounded-full bg-white/15" />
        </div>
        {useThumb && (
          <img src={theme.thumb} alt="" className="absolute inset-0 z-0 h-full w-full object-cover opacity-90" loading="lazy" onError={() => setThumbFailed(true)} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[14px] font-semibold tracking-tight">{theme.label}</div>
        <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-fg-muted">{theme.summary}</div>
        <div className="mt-3 flex gap-1">
          {[p.bg, p.accent, p.ink].filter(Boolean).slice(0,3).map((c,i) => <span key={i} className="h-3 w-8 rounded" style={{ background: c }} />)}
        </div>
        <div className="mt-2 font-mono text-[10px] text-fg-faint">{theme.fonts.heading} / {theme.fonts.body}</div>
      </div>
    </div>
  );
}
