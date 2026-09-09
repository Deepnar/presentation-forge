import { useEffect, useRef, useState } from "react";
import { Button, Spinner, Tooltip } from "./ui.jsx";

export function TypeSwapModal({ index, slide, specimens, busy, error, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(null);   // hovered type name → dock preview
  const [preview, setPreview] = useState(null); // pinned type → full-size preview
  const types = specimens?.types ?? [];
  const previews = specimens?.previews ?? [];
  const filtered = query.trim()
    ? types.map((t, i) => ({ t, i })).filter(({ t }) => t.replace(/-/g, " ").includes(query.trim().toLowerCase()))
    : types.map((t, i) => ({ t, i }));

  const activeType = slide?.type;
  const dockType = hover ?? activeType ?? null;
  const dockIdx = dockType ? types.indexOf(dockType) : -1;
  const previewIdx = preview ? types.indexOf(preview) : -1;

  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="fade-in flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-card border border-line bg-panel shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-fg">Swap slide type</div>
              <div className="truncate text-[11px] text-fg-faint">
                Slide {index + 1} · <span className="font-mono">{slide?.type}</span> — pick how it renders next.
                Compatible types convert instantly; the rest are rewritten.
              </div>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter types…"
              className="w-40 rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[12px] text-fg outline-none transition focus:border-accent"
            />
            <button onClick={onClose} className="rounded p-1.5 text-fg-faint transition hover:bg-hover hover:text-fg" title="Close">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {error ? (
              <div className="rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] text-amber">{error}</div>
            ) : !specimens ? (
              <div className="flex items-center gap-2 text-[12.5px] text-fg-muted"><Spinner /> Rendering one preview per type in this theme…</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map(({ t, i }) => {
                  const active = t === activeType;
                  return (
                    <button
                      key={t}
                      onClick={() => setPreview(t)}
                      onMouseEnter={() => setHover(t)}
                      onMouseLeave={() => setHover((h) => (h === t ? null : h))}
                      onFocus={() => setHover(t)}
                      onBlur={() => setHover((h) => (h === t ? null : h))}
                      disabled={busy}
                      className={`group overflow-hidden rounded-card border text-left transition ${
                        active
                          ? "border-accent ring-1 ring-accent/60"
                          : hover === t
                            ? "border-accent/50"
                            : "border-line hover:border-line-strong"
                      } bg-sunken`}
                      title={`Preview ${t}${active ? " (current)" : ""} — click for full size`}
                    >
                      <div className="overflow-hidden border-b border-line/60">
                        {previews[i] ? (
                          <img src={previews[i]} alt={t} className="aspect-video w-full object-cover transition duration-200 group-hover:scale-[1.04]" loading="lazy" />
                        ) : (
                          <div className="skeleton aspect-video" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">{t}</span>
                        {active && <span className="shrink-0 text-[9px] font-semibold uppercase text-accent">now</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* The hover dock — whatever tile the pointer is over, enlarged. */}
          {specimens && dockIdx >= 0 && (
            <div className="shrink-0 border-t border-line px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="w-60 shrink-0 overflow-hidden rounded-lg border border-line bg-sunken">
                  <img src={previews[dockIdx]} alt={dockType} className="aspect-video w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-medium text-fg">{dockType}</span>
                    {dockType === activeType && <span className="text-[9px] font-semibold uppercase text-accent">now</span>}
                    <span className="text-[10.5px] text-fg-faint">
                      {hover === dockType ? "hover preview" : "current type"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                    {hover === dockType ? "Hovering shows the type at this size — click the tile (or here) for the full-size preview." : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="primary" disabled={busy || dockType === activeType} onClick={() => onPick(dockType)}>
                      Use this type
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreview(dockType)}>See full size</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {busy && (
            <div className="shrink-0 border-t border-line px-4 py-2 text-[12px] text-fg-muted">
              <Spinner /> Converting…
            </div>
          )}
        </div>
      </div>

      {/* The full-size preview — the same cached specimen PNG, undocked. */}
      {preview && previewIdx >= 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-8 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div className="fade-in flex max-h-full w-full max-w-5xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[13px] font-medium text-fg">{preview}</span>
              {preview === activeType && <span className="text-[9px] font-semibold uppercase text-accent">now</span>}
              <span className="text-[11px] text-fg-faint">rendered in this theme</span>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="primary" disabled={busy || preview === activeType} onClick={() => onPick(preview)}>
                  {busy ? <Spinner /> : null}
                  Use this type
                </Button>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition hover:border-line-strong hover:text-fg"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-card border border-line bg-sunken p-4">
              {previews[previewIdx] ? (
                <img src={previews[previewIdx]} alt={preview} className="max-h-full max-w-full rounded-lg shadow-2xl" />
              ) : (
                <Spinner />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CardBtn({ children, ...props }) {
  return (
    <button
      {...props}
      className="grid h-6 w-6 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function CardMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Tooltip label="More actions">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="More actions"
          aria-expanded={open}
          className="grid h-6 w-6 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-7 z-30 min-w-36 rounded-card border border-line bg-panel py-1 shadow-[var(--shadow-float)]">
          {items.map((it, idx) => (
            <button
              key={idx}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick?.(); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition disabled:pointer-events-none disabled:opacity-30 ${
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

export function ActionBtn({ children, ...props }) {
  return (
    <button
      {...props}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition hover:border-line-strong hover:text-fg"
    >
      {children}
    </button>
  );
}

export function MenuBtn({ children, ...props }) {
  return (
    <button
      {...props}
      className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-fg-muted transition hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

const icon = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
export const EditIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);
export const BoltIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5Z" />
  </svg>
);
