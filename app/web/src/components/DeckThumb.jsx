import { useState } from "react";

/**
 * A deck's rendered cover thumb with a graceful fallback tile when no preview
 * is on disk — sidebar rows, the home carousel and any future list share this
 * so a broken <img> can never appear. Sized by the parent via `className`.
 */
export default function DeckThumb({ slug, title, theme, className = "", alt }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`thumb-fallback ${className}`} title={title}>
        <div className="min-w-0 w-full text-center leading-none">
          <div className="truncate text-[13px] font-semibold uppercase tracking-wider">
            {(title?.[0] ?? "?").toUpperCase()}
          </div>
          {theme && (
            <div className="mt-1 max-w-full truncate px-1 text-[8px] leading-none uppercase tracking-wider opacity-70">{theme}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <img
      src={`/api/decks/${slug}/preview/thumbs/slide-01.png`}
      alt={alt ?? title ?? slug}
      onError={() => setFailed(true)}
      className={`${className} object-cover`}
    />
  );
}
