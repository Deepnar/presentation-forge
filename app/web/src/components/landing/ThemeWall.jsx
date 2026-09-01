/**
 * The whole gallery, at a glance.
 *
 * These are the same committed thumbnails the in-app theme picker uses —
 * real renders of a specimen with branding off, not colour swatches. A theme
 * whose thumbnail is missing still gets a tile, because the alternative is a
 * grid that silently shrinks on a machine where `npm run gallery` has not run.
 */
export default function ThemeWall({ themes, onBrowse }) {
  if (!themes?.length) return null;
  return (
    <div className="mt-10">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {themes.map((t, i) => (
          <figure
            key={t.name}
            className="reveal group overflow-hidden rounded-card border border-line bg-panel shadow-[var(--shadow-card)]"
            // Staggered by position, capped: a 34-tile grid with a linear
            // stagger would take three seconds to finish arriving.
            style={{ "--reveal-delay": `${Math.min(i, 12) * 28}ms` }}
          >
            <img
              src={t.thumb}
              alt={`The ${t.label} theme, rendered`}
              width="960"
              height="270"
              loading="lazy"
              decoding="async"
              className="block aspect-[16/5] w-full object-cover"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            />
            <figcaption className="border-t border-line px-3 py-2">
              <div className="truncate text-[12.5px] font-medium text-fg">{t.label}</div>
              {t.summary && <div className="truncate text-[11px] text-fg-faint">{t.summary}</div>}
            </figcaption>
          </figure>
        ))}
      </div>
      {onBrowse && (
        <div className="reveal mt-6">
          <button
            onClick={onBrowse}
            className="press rounded-pill border border-line-strong bg-panel px-5 py-2.5 text-[13px] font-medium text-fg transition-colors hover:bg-hover"
          >
            Open the gallery
          </button>
        </div>
      )}
    </div>
  );
}
