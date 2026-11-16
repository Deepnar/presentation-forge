// Pick a project's theme and light or dark, then apply: the server restyles
// every slide and keeps the person's edits. Lives in the slide panel while
// nothing is selected.
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function ThemePicker({ current, busy, error, onApply, look = null, onTakeLook = null, onRemoveLook = null }) {
  const lookInput = useRef(null);
  const [themes, setThemes] = useState(null);
  const [name, setName] = useState(current?.name ?? "");
  const [mode, setMode] = useState(current?.variant === "dark" ? "dark" : "light");
  useEffect(() => {
    let live = true;
    api.themes().then((r) => { if (live) setThemes(r.themes ?? r); }).catch(() => { if (live) setThemes([]); });
    return () => { live = false; };
  }, []);
  useEffect(() => { setName(current?.name ?? ""); setMode(current?.variant === "dark" ? "dark" : "light"); }, [current?.name, current?.variant]);
  const changed = name && (name !== current?.name || mode !== (current?.variant === "dark" ? "dark" : "light"));
  const swatch = themes?.find((t) => t.name === name)?.palette;
  const seg = (on) => `flex-1 rounded px-2 py-1 text-[12.5px] ${on ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"}`;
  return (
    <div data-theme-picker className="flex flex-col gap-1.5 border-t border-line pt-2">
      <label className="text-[12px] text-fg-faint" htmlFor="project-theme">Theme</label>
      <div className="flex items-center gap-2">
        {swatch && (
          <span aria-hidden="true" className="flex h-5 w-8 flex-none overflow-hidden rounded border border-line">
            {["ground", "ink", "accent"].map((k) => <span key={k} style={{ flex: 1, background: `#${String(swatch[k]?.hex ?? swatch[k] ?? "ccc").replace(/^#/, "")}` }} />)}
          </span>
        )}
        <select id="project-theme" value={name} disabled={!themes || busy} onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded border border-line bg-panel px-1.5 py-1 text-[12.5px] text-fg">
          {!themes && <option value={name}>{current?.name ?? "Loading…"}</option>}
          {themes?.map((t) => <option key={t.name} value={t.name}>{t.label ?? t.name}</option>)}
        </select>
      </div>
      <div role="group" aria-label="Appearance" className="flex gap-1 rounded border border-line p-0.5">
        <button type="button" aria-pressed={mode === "light"} disabled={busy} onClick={() => setMode("light")} className={seg(mode === "light")}>Light</button>
        <button type="button" aria-pressed={mode === "dark"} disabled={busy} onClick={() => setMode("dark")} className={seg(mode === "dark")}>Dark</button>
      </div>
      <button type="button" data-theme-apply disabled={!changed || busy} onClick={() => onApply(name, mode)}
        className="rounded border border-line px-2 py-1 text-[12.5px] text-fg hover:bg-raised disabled:opacity-40">
        {busy ? "Restyling…" : "Apply theme"}
      </button>
      {onTakeLook && (
        <div data-look className="flex flex-col gap-1">
          <input ref={lookInput} type="file" accept=".pptx" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onTakeLook(f); }} />
          {look ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-muted">
                  <span aria-hidden="true" className="flex h-4 w-8 flex-none overflow-hidden rounded border border-line">
                    {["lt1", "dk1", "accent1", "accent2"].map((k) => <span key={k} style={{ flex: 1, background: `#${look.scheme?.[k] ?? "cccccc"}` }} />)}
                  </span>
                  <span className="truncate" title={look.source}>Look of {look.source}</span>
                </span>
                <button type="button" data-remove-look disabled={busy} onClick={onRemoveLook}
                  className="flex-none text-[12px] text-fg-faint hover:text-fg disabled:opacity-40">Remove</button>
              </div>
              {look.notes?.length > 0 && <div className="text-[11.5px] text-fg-faint">Kept from the theme: {look.notes.join("; ")}.</div>}
            </>
          ) : (
            <button type="button" data-take-look disabled={busy} onClick={() => lookInput.current?.click()}
              title="Use the colours and fonts of a PowerPoint file"
              className="self-start text-[12px] text-fg-muted hover:text-fg disabled:opacity-40">Use a PowerPoint's look…</button>
          )}
        </div>
      )}
      {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}
