import { useEffect, useRef, useState } from "react";

const MAX_NOTES = 20000;

// Speaker notes for the slide on the stage. The draft commits on blur as one
// undoable command, so typing never floods history and switching slides never
// carries a half-typed note onto the next slide.
export default function SlideNotes({ scene, editable, onCommit }) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(scene?.notes ?? "");
  const sceneId = scene?.id ?? null;
  const saved = scene?.notes ?? "";
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(saved);
  }, [sceneId, saved]);

  function commit() {
    focused.current = false;
    if (cancelled.current) { cancelled.current = false; setDraft(saved); return; }
    if (!sceneId || !editable || draft === saved) return;
    onCommit?.(sceneId, draft);
  }

  if (!scene) return null;
  return (
    <section data-slide-notes aria-label="Speaker notes" className="flex-none border-t border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-fg-muted hover:text-fg"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>
          <path d="m9 18 6-6-6-6" />
        </svg>
        Speaker notes
        {!open && saved && <span className="truncate text-fg-faint">— {saved.split("\n")[0]}</span>}
      </button>
      {open && (
        <div className="px-3 pb-2">
          <textarea
            aria-label="Speaker notes for this slide"
            value={draft}
            readOnly={!editable}
            maxLength={MAX_NOTES}
            placeholder={editable ? "Add notes for the presenter. They export to PowerPoint and never show on the slide." : "No notes for this slide."}
            onFocus={() => { focused.current = true; }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); }
              e.stopPropagation();
            }}
            rows={3}
            className="block max-h-48 min-h-[3.5rem] w-full resize-y rounded-md border border-line bg-field px-2 py-1.5 text-[13px] leading-snug text-fg outline-none focus:border-accent read-only:text-fg-muted"
          />
        </div>
      )}
    </section>
  );
}
