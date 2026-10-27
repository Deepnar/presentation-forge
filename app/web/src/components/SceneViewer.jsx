import AssistantPanel from "./AssistantPanel.jsx";
import { ConfirmModal } from "./ui.jsx";
import { assistantFailure, assistantScope } from "../lib/v2assistant.js";
import { projectSessionKey } from "../lib/v2project.js";
import ProjectExportButton from "./ProjectExportButton.jsx";
// SceneViewer — read-only V2 scene viewer. Thin React shell over
// packages/editor/scene-dom.js (the single viewer implementation;
// the headless smoke page drives the same module). React owns no
// viewer logic: it mounts one viewer per deck, mirrors snapshots,
// and forwards UI events to the viewer api. Scenes are never
// mutated here — selection is an id, geometry comes from the DOM.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createViewer } from "../../../../packages/editor/scene-dom.js";
import { flattenLayers, elementLabel, applyCollapse } from "../../../../packages/editor/scene-text.js";
import { sceneToSvg } from "../../../../packages/editor/scene-svg.js";
import { LAYOUT_CATEGORIES, listLayoutTemplates, buildLayoutScene } from "../../../../packages/editor/layout-templates.js";
import { ensureDeckFonts } from "../fonts.js";
import { createLiveDeckLoader } from "../lib/liveDeck.js";
import { apiList, apiCreate, apiLoad, apiSave, apiRename, apiRemove, apiListRevisions, apiGetRevision, apiRestore, readLastProject, writeLastProject, createAutosave } from "../lib/v2project.js";
import { useNarrow } from "../lib/viewport.js";

// Restores focus to the opener when a dialog closes. Dialogs trap
// nothing; they only borrow focus, and the opener (often a toolbar
// button that unmounted nothing) gets it back.
function useFocusReturn(open) {
  const saved = useRef(null);
  useEffect(() => {
    if (open) {
      saved.current = document.activeElement;
      return undefined;
    }
    const el = saved.current;
    saved.current = null;
    if (el && document.contains(el) && typeof el.focus === "function") {
      try {
        el.focus({ preventScroll: true });
      } catch { /* focus return is best-effort */ }
    }
    return undefined;
  }, [open]);
}
import mechPlain from "../scenes/mech-warm-humanist-plain.json";
import mechChromed from "../scenes/mech-warm-humanist-chromed.json";
import sourceOfTruth from "../scenes/source-of-truth-warm-humanist-plain.json";
import decision from "../scenes/decision-warm-humanist-plain.json";

const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];

function Thumb({ scene, displayLabel, active, selected, onPick, onMenu, onDragStart, onDragOver, onDrop, onDragEnd, onMoveKey, menu }) {
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        draggable={onDragStart ? true : undefined}
        onClick={onPick}
        onContextMenu={(e) => { e.preventDefault(); onMenu?.(); }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onKeyDown={onMoveKey}
        aria-current={active ? "true" : undefined}
        aria-label={`${displayLabel ?? `Slide ${scene.id}`}${active ? " (active)" : ""}${selected ? " (selected)" : ""}`}
        data-thumb={scene.id}
        data-thumb-selected={selected ? "true" : undefined}
        style={{
          display: "block", width: "100%", padding: 0, cursor: "pointer",
          border: active ? "2px solid var(--color-accent)" : "1px solid var(--color-line)",
          borderRadius: 6, overflow: "hidden", background: "#fff",
          outline: "none",
          boxShadow: selected && !active ? "0 0 0 2px var(--color-accent)" : undefined,
        }}
        dangerouslySetInnerHTML={{ __html: sceneToSvg(scene, { wrapText: true }) }}
      />
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
        <span style={{ fontSize: 10, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {displayLabel ?? scene.id}
          {scene.layoutState === "detached" ? " · Manual" : scene.layoutState === "customized" ? " · Custom" : ""}
        </span>
        {onMenu && (
          <button
            type="button"
            aria-label={`${displayLabel ?? `Slide ${scene.id}`} menu`}
            data-thumb-menu={scene.id}
            onClick={(e) => { e.stopPropagation(); onMenu(); }}
            className="rounded border border-line bg-transparent px-1 text-[11px] leading-[1.4] text-fg-muted"
          >
            ⋯
          </button>
        )}
      </div>
      {menu}
    </div>
  );
}

// Compact contextual slide menu: duplicate, two-step delete, and
// detach with its consequence stated. No native dialogs (untestable
// headless); the inline confirm is the confirmation policy.
function SlideMenu({ scene, isLast, confirming, onDuplicate, onDelete, onConfirmDelete, onCancelDelete, onDetach, onClose }) {
  const state = isLast ? "Only slide" : scene.layoutState === "detached" ? "Manual slide" : "Slide menu";
  return (
    <div
      data-slide-menu={scene.id}
      className="absolute inset-x-0 top-full z-10 mt-0.5 flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-[12px] text-fg shadow-[var(--shadow-float)]"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-fg-faint">{state}</span>
      <button type="button" onClick={onDuplicate} className="rounded-md px-2 py-1 text-left text-fg-muted transition hover:bg-hover hover:text-fg">Duplicate slide</button>
      {confirming ? (
        <>
          <span>{isLast ? "This is the only slide — it cannot be deleted." : "Delete this slide? Undo restores it."}</span>
          {!isLast && <button type="button" onClick={onConfirmDelete} className="rounded-md px-2 py-1 text-left text-danger transition hover:bg-hover">Confirm delete</button>}
          <button type="button" onClick={onCancelDelete} className="rounded-md px-2 py-1 text-left text-fg-muted transition hover:bg-hover hover:text-fg">Keep</button>
        </>
      ) : (
        <button type="button" onClick={onDelete} className="rounded-md px-2 py-1 text-left text-fg-muted transition hover:bg-hover hover:text-fg">Delete…</button>
      )}
      {scene.layoutState !== "detached" && (
        <>
          <button type="button" onClick={onDetach} className="rounded-md px-2 py-1 text-left text-fg-muted transition hover:bg-hover hover:text-fg">Detach from AI layout</button>
          <span className="text-[11px] text-fg-faint">The current scene becomes authoritative. Undo restores. There is no reattach.</span>
        </>
      )}
      <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-left text-fg-muted transition hover:bg-hover hover:text-fg">Close</button>
    </div>
  );
}

function useInspector(viewer, snap) {
  if (!viewer?.api || !snap || !Array.isArray(snap.selectedIds)) return [];
  return snap.selectedIds.map((id) => viewer.api.inspect(id)).filter(Boolean);
}

// V2-5E shape-style panel: fill color, stroke color (or none), and
// stroke width for one selected shape. Local draft state commits
// explicitly (Apply, blur, or Enter) as a single element.setStyle —
// a color picker's drag never spams history. Remounted per
// element+revision (see key at the call site), so undo/redo and
// reselection always refresh values. Genuine no-ops commit nothing.
function StylePanel({ element, onCommit, diagnostics = true }) {
  const shape = element.shape ?? {};
  const [fill, setFill] = useState(`#${shape.fill ?? "FFFFFF"}`);
  const [stroke, setStroke] = useState(shape.stroke ? `#${shape.stroke}` : "");
  const [noStroke, setNoStroke] = useState(shape.stroke === undefined);
  const [width, setWidth] = useState(String(shape.strokeWidth ?? 1));
  const [error, setError] = useState(null);
  function commit() {
    const patch = {};
    const bare = (v) => v.replace(/^#/, "");
    if (bare(fill).toUpperCase() !== String(shape.fill ?? "FFFFFF").toUpperCase()) {
      if (!/^[0-9A-Fa-f]{6}$/.test(bare(fill))) {
        setError("fill must be a 6-digit hex color");
        return;
      }
      patch.fill = bare(fill).toUpperCase();
    }
    if (noStroke) {
      if (shape.stroke !== undefined) patch.stroke = null;
    } else if (stroke) {
      if (!/^[0-9A-Fa-f]{6}$/.test(bare(stroke))) {
        setError("stroke must be a 6-digit hex color or none");
        return;
      }
      if (bare(stroke).toUpperCase() !== String(shape.stroke ?? "").toUpperCase()) {
        patch.stroke = bare(stroke).toUpperCase();
      }
    }
    const n = Number(width);
    if (!Number.isFinite(n) || n < 0 || n > 24) {
      setError("stroke width must be a number from 0 to 24");
      return;
    }
    if (n !== (shape.strokeWidth ?? 1)) patch.strokeWidth = n;
    if (Object.keys(patch).length === 0) {
      setError(null);
      return;
    }
    setError(null);
    onCommit?.(patch);
  }
  const commitOnEnter = (e) => {
    if (e.key === "Enter") commit();
  };
  return (
    <div data-style-panel={element.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 12px", fontSize: 12, flexWrap: "wrap" }}>
      <span style={{ opacity: 0.8 }}>{diagnostics ? `Style ${element.id}` : "Shape style"}</span>
      <label>Fill <input aria-label="Shape fill" type="color" value={/^#[0-9A-Fa-f]{6}$/.test(fill) ? fill : "#ffffff"} onChange={(e) => setFill(e.target.value)} onBlur={commit} /></label>
      <label>No stroke <input aria-label="Remove stroke" type="checkbox" checked={noStroke} onChange={(e) => setNoStroke(e.target.checked)} onBlur={commit} /></label>
      {!noStroke && (
        <label>Stroke <input aria-label="Shape stroke" type="color" value={/^#[0-9A-Fa-f]{6}$/.test(stroke) ? stroke : "#000000"} onChange={(e) => { setStroke(e.target.value); }} onBlur={commit} /></label>
      )}
      <label>Width <input aria-label="Stroke width" value={width} inputMode="decimal" style={{ width: 44 }} onChange={(e) => setWidth(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} /></label>
      <button type="button" onClick={commit}>Apply style</button>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </div>
  );
}

// V2-5F text-format panel: one row per paragraph of a supported
// (uniform single-run) text element — color, size, bold, italic —
// each committing explicitly to that paragraph only. Rows display
// their own values, so mixed paragraph styles can never read as a
// false uniform format; a "mixed styles" note names the case.
// Remounted per element+revision (see key at the call site), so
// undo/redo and reselection refresh every row. Multi-run elements
// get no panel: formatting addresses whole runs only.
function TextFormatPanel({ element, onCommit, diagnostics = true }) {
  const paras = element.paragraphs ?? [];
  const sigs = paras.map((p) => {
    const r = p?.runs?.[0] ?? {};
    return JSON.stringify([p?.align ?? null, p?.bullet ?? null, r.color ?? null, r.size ?? null, r.bold ?? null, r.italic ?? null]);
  });
  const mixed = new Set(sigs).size > 1;
  const [error, setError] = useState(null);
  function commitRow(i, draft) {
    const run = paras[i]?.runs?.[0] ?? {};
    const patch = {};
    const bare = (v) => String(v).replace(/^#/, "");
    if (draft.color !== undefined && bare(draft.color).toUpperCase() !== String(run.color ?? "").toUpperCase()) {
      if (!/^[0-9A-Fa-f]{6}$/.test(bare(draft.color))) {
        setError(`paragraph ${i + 1}: color must be a 6-digit hex color`);
        return;
      }
      patch.color = bare(draft.color).toUpperCase();
    }
    if (draft.size !== undefined && draft.size !== "") {
      const n = Number(draft.size);
      if (!Number.isFinite(n) || n < 6 || n > 144) {
        setError(`paragraph ${i + 1}: size must be a number from 6 to 144`);
        return;
      }
      if (n !== (run.size ?? null)) patch.size = n;
    }
    if (draft.bold !== undefined && draft.bold !== (run.bold ?? null)) patch.bold = draft.bold;
    if (draft.italic !== undefined && draft.italic !== (run.italic ?? null)) patch.italic = draft.italic;
    if (Object.keys(patch).length === 0) {
      setError(null);
      return;
    }
    setError(null);
    onCommit?.(i, patch);
  }
  return (
    <div data-text-format-panel={element.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 12px", fontSize: 12 }}>
      <span style={{ opacity: 0.8 }}>
        Text{diagnostics ? ` ${element.id}` : " formatting"}{mixed ? " · mixed paragraph styles (per-paragraph controls)" : ""}
      </span>
      {paras.map((p, i) => (
        <TextFormatRow
          key={i}
          index={i}
          paragraph={p}
          onCommit={(draft) => commitRow(i, draft)}
        />
      ))}
      {error && <span role="alert" className="text-danger">{error}</span>}
    </div>
  );
}

function TextFormatRow({ index, paragraph, onCommit }) {
  const run = paragraph?.runs?.[0] ?? {};
  const [color, setColor] = useState(run.color ? `#${run.color}` : "#000000");
  const [size, setSize] = useState(run.size !== undefined ? String(run.size) : "");
  const [bold, setBold] = useState(run.bold === true);
  const [italic, setItalic] = useState(run.italic === true);
  const label = `${paragraph?.bullet ? "• " : ""}¶${index + 1}${paragraph?.align ? ` ${paragraph.align}` : ""}`;
  function commit() {
    onCommit({ color, size, bold: bold ? true : run.bold === true ? false : undefined, italic: italic ? true : run.italic === true ? false : undefined });
  }
  // Toggles express tri-state honestly: checked means true; clearing
  // a set true sends explicit false (never silent absence).
  const commitOnEnter = (e) => {
    if (e.key === "Enter") commit();
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ opacity: 0.7, minWidth: 64 }}>{label}</span>
      <label>Color <input aria-label={`Paragraph ${index + 1} color`} type="color" value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#000000"} onChange={(e) => setColor(e.target.value)} onBlur={commit} /></label>
      <label>Size <input aria-label={`Paragraph ${index + 1} size`} value={size} inputMode="decimal" placeholder={run.size !== undefined ? undefined : "—"} style={{ width: 44 }} onChange={(e) => setSize(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} /></label>
      <label>B <input aria-label={`Paragraph ${index + 1} bold`} type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} onBlur={commit} /></label>
      <label>I <input aria-label={`Paragraph ${index + 1} italic`} type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} onBlur={commit} /></label>
      <button type="button" onClick={commit}>Apply</button>
    </div>
  );
}

// Chart-data editor: a draft matrix over the chart's authoritative
// data — kind select, editable category labels and series names,
// and editable numeric cells kept as RAW STRINGS until Apply.
// Nothing is coerced: empty or non-numeric cells block Apply with
// the cell named, and added categories/series start empty so the
// full-matrix rule cannot be satisfied accidentally. One Apply
// submits one element.setChartData; Cancel restores the committed
// values; failures keep the draft for correction. Remounted per
// element+revision (see key at the call site), so undo/redo and
// reselection refresh the grid. Switching selection discards an
// unapplied draft — stated policy: only Apply writes.
function ChartDataPanel({ element, onCommit, diagnostics = true, onDraftChange }) {
  const chart = element.chart ?? {};
  const seed = () => ({
    kind: chart.chartKind ?? "bar",
    categories: [...(chart.categories ?? [])],
    series: (chart.series ?? []).map((s) => ({ name: s.name, values: s.values.map((v) => String(v)) })),
  });
  const [draft, setDraft] = useState(seed);
  const [error, setError] = useState(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(seed());
  useLayoutEffect(() => { onDraftChange?.(element.id, dirty); return () => onDraftChange?.(element.id, false); }, [element.id, dirty, onDraftChange]);
  function setCell(si, ci, value) {
    setDraft((d) => {
      const series = d.series.map((s, i) => (i === si ? { ...s, values: s.values.map((v, j) => (j === ci ? value : v)) } : s));
      return { ...d, series };
    });
  }
  function apply() {
    const categories = draft.categories.map((c) => String(c));
    const series = [];
    for (let si = 0; si < draft.series.length; si++) {
      const row = draft.series[si];
      const name = String(row.name ?? "").trim();
      if (!name) {
        setError(`series ${si + 1} needs a non-empty name`);
        return;
      }
      const values = [];
      for (let ci = 0; ci < categories.length; ci++) {
        const raw = String(row.values[ci] ?? "").trim();
        if (!raw) {
          setError(`series "${name || si + 1}", category "${categories[ci] || ci + 1}": fill every cell — nothing is zero-filled`);
          return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          setError(`series "${name}", category "${categories[ci]}": "${raw}" is not a number`);
          return;
        }
        values.push(n);
      }
      series.push({ name, values });
    }
    if (categories.length === 0) {
      setError("a chart needs at least one category");
      return;
    }
    if (series.length === 0) {
      setError("a chart needs at least one series");
      return;
    }
    setError(null);
    onCommit?.({ chartKind: draft.kind, categories, series });
  }
  function cancel() {
    setDraft(seed());
    setError(null);
  }
  const commitOnEnter = (e) => {
    if (e.key === "Enter") apply();
  };
  const narrow = { width: 64 };
  return (
    <div data-chart-editor={element.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 12px", fontSize: 12 }}>
      <span style={{ opacity: 0.8 }}>
        Chart{diagnostics ? ` ${element.id}` : " data"} · {draft.series.length} series × {draft.categories.length} categories
        {(draft.kind === "pie" || draft.kind === "doughnut") && draft.series.length > 1
          ? " · pie and doughnut keep a single series — remove series or switch kind before applying"
          : ""}
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>Type{" "}
          <select aria-label="Chart type" value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
            {["bar", "hbar", "line", "area", "pie", "doughnut"].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setDraft((d) => ({ ...d, categories: [...d.categories, `Category ${d.categories.length + 1}`], series: d.series.map((s) => ({ ...s, values: [...s.values, ""] })) }))}>+ Category</button>
        <button type="button" disabled={draft.categories.length <= 1} onClick={() => setDraft((d) => ({ ...d, categories: d.categories.slice(0, -1), series: d.series.map((s) => ({ ...s, values: s.values.slice(0, -1) })) }))}>− Category</button>
        <button type="button" onClick={() => setDraft((d) => ({ ...d, series: [...d.series, { name: `Series ${d.series.length + 1}`, values: d.categories.map(() => "") }] }))}>+ Series</button>
        <button type="button" disabled={draft.series.length <= 1} onClick={() => setDraft((d) => ({ ...d, series: d.series.slice(0, -1) }))}>− Series</button>
        <button type="button" onClick={apply}>Apply</button>
        <button type="button" onClick={cancel}>Cancel</button>
      </div>
      <table style={{ borderCollapse: "collapse", alignSelf: "flex-start" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "2px 6px", opacity: 0.7 }}>Category</th>
            {draft.series.map((s, si) => (
              <th key={si} style={{ padding: 2 }}>
                <input aria-label={`Series ${si + 1} name`} value={s.name} style={{ width: 90 }} onChange={(e) => setDraft((d) => ({ ...d, series: d.series.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)) }))} onKeyDown={commitOnEnter} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.categories.map((c, ci) => (
            <tr key={ci}>
              <td style={{ padding: 2 }}>
                <input aria-label={`Category ${ci + 1} label`} value={c} style={{ width: 90 }} onChange={(e) => setDraft((d) => ({ ...d, categories: d.categories.map((x, j) => (j === ci ? e.target.value : x)) }))} onKeyDown={commitOnEnter} />
              </td>
              {draft.series.map((s, si) => (
                <td key={si} style={{ padding: 2 }}>
                  <input aria-label={`Value ${s.name || si + 1} ${c || ci + 1}`} value={s.values[ci] ?? ""} inputMode="decimal" style={narrow} onChange={(e) => setCell(si, ci, e.target.value)} onKeyDown={commitOnEnter} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </div>
  );
}

// Table-data editor: a draft grid over the table's authoritative
// rows — plain strings, never parsed. Cells keep every character
// verbatim ("00123" stays "00123"), new rows and columns start as
// empty strings, and structural edits append/remove at the end.
// One Apply submits one element.setTableData; Cancel restores the
// committed matrix; failures keep the draft for correction.
// Removing a populated row or column acts on the draft at once
// and commits only on Apply — the visible draft change plus the
// explicit Apply is the confirmation model. Remounted per
// element+revision (see key at the call site), so undo/redo and
// reselection refresh the grid. Switching selection discards an
// unapplied draft — stated policy: only Apply writes.
function TableDataPanel({ element, onCommit, diagnostics = true, onDraftChange }) {
  const table = element.table ?? {};
  const seed = () => (table.rows ?? []).map((r) => [...r]);
  const [draft, setDraft] = useState(seed);
  const [error, setError] = useState(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(seed());
  useLayoutEffect(() => { onDraftChange?.(element.id, dirty); return () => onDraftChange?.(element.id, false); }, [element.id, dirty, onDraftChange]);
  const cols = draft.reduce((n, r) => Math.max(n, r.length), 0);
  const header = table.header === true;
  function setCell(ri, ci, value) {
    setDraft((d) => d.map((row, i) => (i === ri ? row.map((c, j) => (j === ci ? value : c)) : row)));
  }
  function apply() {
    if (draft.length === 0) {
      setError("a table needs at least one row");
      return;
    }
    setError(null);
    onCommit?.(draft.map((r) => [...r]));
  }
  function cancel() {
    setDraft(seed());
    setError(null);
  }
  const commitOnEnter = (e) => {
    if (e.key === "Enter") apply();
  };
  return (
    <div data-table-editor={element.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 12px", fontSize: 12 }}>
      <span style={{ opacity: 0.8 }}>
        Table{diagnostics ? ` ${element.id}` : " data"} · {draft.length} rows × {cols} columns{header ? " · row 1 is the header" : ""}
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setDraft((d) => [...d, new Array(d.reduce((n, r) => Math.max(n, r.length), 0)).fill("")])}>+ Row</button>
        <button type="button" disabled={draft.length <= 1} title="Removes the last row on Apply — populated cells go with it" onClick={() => setDraft((d) => d.slice(0, -1))}>− Row</button>
        <button type="button" onClick={() => setDraft((d) => d.map((r) => [...r, ""]))}>+ Column</button>
        <button type="button" disabled={cols <= 1} title="Removes the last column on Apply — populated cells go with it" onClick={() => setDraft((d) => d.map((r) => r.slice(0, -1)))}>− Column</button>
        <button type="button" onClick={apply}>Apply</button>
        <button type="button" onClick={cancel}>Cancel</button>
      </div>
      <div style={{ overflowX: "auto", alignSelf: "flex-start", maxWidth: "100%" }}>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            {draft.map((row, ri) => (
              <tr key={ri} style={header && ri === 0 ? { fontWeight: "bold" } : undefined}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: 2 }}>
                    <input
                      aria-label={header && ri === 0 ? `Header column ${ci + 1}` : `Row ${ri + 1} column ${ci + 1}`}
                      value={cell}
                      style={{ width: 110 }}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      onKeyDown={commitOnEnter}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </div>
  );
}

// Layers panel: the slide's real element tree as rows — no
// parallel ids, every row IS the authoritative element id.
// Selection is the viewer's (canvas and panel share it);
// group children resolve to their parent per the viewer rules,
// and the panel says so instead of pretending otherwise.
// Top-level rows carry ↑/↓ reorder buttons; nested rows name
// their group and reorder through it. Lock and eye buttons act
// by id (the eye works on hidden rows, which have no canvas
// node to select). Hidden rows are dimmed and never selected —
// re-show first. Collapsed groups persist in a ref map keyed by
// slide, so switching slides keeps each tree's shape.
function LayersPanel({ slide, selectedIds, topCount, onSelect, onToggle, onRange, onReorder, onLock, onHide, diagnostics = true }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const rowRefs = useRef(new Map());
  // One row implementation shared with tests: draw order from the
  // authoritative z ranks, stable element references looked up by
  // id, collapsed subtrees filtered here (never from the scene).
  const byId = useMemo(() => {
    const map = new Map();
    const walk = (els) => {
      for (const el of els ?? []) {
        map.set(el.id, el);
        walk(el.group?.children);
      }
    };
    walk(slide?.elements);
    return map;
  }, [slide]);
  const rows = useMemo(() => applyCollapse(flattenLayers(slide?.elements), collapsed), [slide, collapsed]);
  const selectedSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  // Scroll the first selected row into view on selection change.
  useLayoutEffect(() => {
    if (!selectedIds || selectedIds.length === 0) return;
    const node = rowRefs.current.get(selectedIds[0]);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIds, slide?.id]);
  if (!slide || (slide.elements ?? []).length === 0) {
    return <div data-layers-empty style={{ padding: "4px 0", fontSize: 12, opacity: 0.7 }}>No objects on this slide.</div>;
  }
  const toggleCollapse = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div data-layers role="listbox" aria-label="Layers" aria-multiselectable="true" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rows.map((row) => {
        const el = byId.get(row.id);
        if (!el) return null;
        const parent = row.parentId ? byId.get(row.parentId) : null;
        const label = diagnostics ? row.id : row.label;
        const parentLabel = diagnostics ? parent?.id : parent ? elementLabel(parent) : null;
        const selected = selectedSet.has(row.id);
        const parentSelected = parent && selectedSet.has(parent.id);
        const refCb = (n) => {
          if (n) rowRefs.current.set(row.id, n);
          else rowRefs.current.delete(row.id);
        };
        const onRowKey = (e) => {
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            onReorder?.(row.id, e.key === "ArrowUp" ? -1 : 1);
          } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && row.kind === "group") {
            e.preventDefault();
            const wantCollapsed = e.key === "ArrowLeft";
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (wantCollapsed !== next.has(row.id)) toggleCollapse(row.id);
              return next;
            });
          }
        };
        return (
          <div
            key={row.id}
            ref={refCb}
            role="option"
            aria-selected={selected ? "true" : "false"}
            data-layer={row.id}
            data-layer-selected={selected ? "true" : undefined}
            data-layer-kind={row.kind}
            onKeyDown={onRowKey}
            style={{
              display: "flex", gap: 4, alignItems: "center", padding: "3px 4px 3px 4px",
              paddingLeft: 4 + row.depth * 14, borderRadius: 4, fontSize: 11,
              background: selected ? "var(--color-raised)" : parentSelected ? "var(--color-prompt)" : "transparent",
              border: selected ? "1px solid var(--color-accent)" : "1px solid transparent",
              opacity: row.hidden ? 0.55 : 1,
            }}
          >
            {row.kind === "group" && (
              <button
                type="button"
                aria-label={collapsed.has(row.id) ? `Expand ${label}` : `Collapse ${label}`}
                aria-expanded={collapsed.has(row.id) ? "false" : "true"}
                onClick={() => toggleCollapse(row.id)}
                style={{ padding: "0 4px", background: "transparent", border: "none", color: "#eee", cursor: "pointer" }}
              >
                {collapsed.has(row.id) ? "▸" : "▾"}
              </button>
            )}
            <button
              type="button"
              title={row.hidden ? "Hidden — re-show to select" : parent ? `In group ${parentLabel} — selects the group` : `Select ${label}`}
              onClick={(e) => {
                if (row.hidden) return;
                if (e.shiftKey) onRange?.(row.id);
                else if (e.ctrlKey || e.metaKey) onToggle?.(row.id);
                else onSelect?.(row.id);
              }}
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "var(--color-fg)", cursor: row.hidden ? "default" : "pointer", textAlign: "left", padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {row.label}{row.locked ? " · locked" : ""}{row.hidden ? " · hidden" : ""}{parentSelected && !selected ? " · via parent" : ""}
            </button>
            {row.depth === 0 && (
              <>
                <button type="button" aria-label={`Bring ${label} forward`} title="Bring forward" onClick={() => onReorder?.(row.id, 1)}>↑</button>
                <button type="button" aria-label={`Send ${label} backward`} title="Send backward" onClick={() => onReorder?.(row.id, -1)}>↓</button>
              </>
            )}
            <button
              type="button"
              aria-label={row.locked ? `Unlock ${label}` : `Lock ${label}`}
              title={row.locked ? "Unlock" : "Lock"}
              onClick={() => onLock?.(row.id, !row.locked)}
              style={{ padding: "0 3px", background: "transparent", border: "1px solid var(--color-line)", borderRadius: 3, color: "var(--color-fg)", cursor: "pointer", fontSize: 10 }}
            >
              {row.locked ? "▪" : "▫"}
            </button>
            <button
              type="button"
              aria-label={row.hidden ? `Show ${label}` : `Hide ${label}`}
              title={row.hidden ? "Show" : "Hide"}
              onClick={() => onHide?.(row.id, !row.hidden)}
              style={{ padding: "0 3px", background: "transparent", border: "1px solid var(--color-line)", borderRadius: 3, color: "var(--color-fg)", cursor: "pointer", fontSize: 10 }}
            >
              {row.hidden ? "○" : "●"}
            </button>
          </div>
        );
      })}
      <span style={{ fontSize: 10, opacity: 0.6 }}>top {topCount} · Alt+↑/↓ reorders the focused row</span>
    </div>
  );
}

// V2-5K layout gallery: a compact chooser over the deterministic
// template registry. Previews render the SAME scene builder the
// insertion path commits (built against the live sibling for theme
// sampling), so a card can never promise what the slide will not
// be. Click inserts after the active slide; Esc, the backdrop, or
// the close button cancels with no mutation. Narrow-safe: the panel
// caps at 94vw and the card grid reflows.
function LayoutGallery({ sibling, onInsert, onClose }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const cards = useMemo(() => {
    let n = 0;
    return listLayoutTemplates().map((t) => {
      const scene = buildLayoutScene(t.id, sibling, { newId: () => `h-preview-${++n}` });
      return { template: t, svg: sceneToSvg(scene, { wrapText: true }) };
    });
  }, [sibling]);
  const catName = (id) => LAYOUT_CATEGORIES.find((c) => c.id === id)?.name ?? id;
  const q = query.trim().toLowerCase();
  const visible = cards.filter(({ template: t }) => {
    if (cat !== "all" && t.category !== cat) return false;
    if (!q) return true;
    const hay = [t.name, t.description, t.useCase, catName(t.category), ...(t.legacyAliases ?? [])].join(" ").toLowerCase();
    return hay.includes(q);
  });
  return (
    <div
      data-gallery
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
    >
      <div
        role="dialog"
        aria-label="Choose a slide layout"
        className="flex max-h-[86vh] w-[min(880px,94vw)] flex-col overflow-hidden rounded-card border border-line bg-panel text-fg shadow-[var(--shadow-float)]"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <strong className="text-[13px]">Choose layout</strong>
          <input
            data-gallery-search
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search layouts…"
            aria-label="Search layouts"
            className="min-w-[140px] flex-1 rounded-md border border-line bg-field px-2 py-1 text-[12px] text-fg"
          />
          <button type="button" aria-label="Close gallery" onClick={onClose} className="ml-auto rounded-md border border-line px-2 py-0.5 text-fg-muted transition hover:bg-hover hover:text-fg">✕</button>
        </div>
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {[{ id: "all", name: "All" }, ...LAYOUT_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              data-gallery-cat={c.id}
              aria-pressed={cat === c.id ? "true" : "false"}
              onClick={() => setCat(c.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${cat === c.id ? "border-accent bg-accent text-on-accent" : "border-line text-fg-muted hover:bg-hover hover:text-fg"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div data-gallery-grid className="grid gap-2.5 overflow-y-auto p-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {visible.map(({ template: t, svg }) => (
            <button
              key={t.id}
              type="button"
              data-gallery-card={t.id}
              onClick={() => onInsert(t.id)}
              title={`${t.name} — ${t.useCase}`}
              className="flex flex-col gap-1 rounded-lg border border-line bg-raised p-2 text-left transition hover:border-accent"
            >
              <span data-gallery-preview={t.id} dangerouslySetInnerHTML={{ __html: svg }} className="block overflow-hidden rounded bg-white" />
              <span className="text-[12px] font-bold">{t.name}</span>
              <span className="text-[10px] text-fg-faint">{catName(t.category)}</span>
              <span className="text-[11px] text-fg-muted">{t.description}</span>
              <span className="text-[10px] italic text-fg-faint">{t.useCase}</span>
            </button>
          ))}
          {visible.length === 0 && (
            <span className="p-3 text-[12px] text-fg-faint">No layouts match “{query}”.</span>
          )}
        </div>
        <div className="border-t border-line px-3 py-2 text-[11px] text-fg-faint">
          Click a layout to insert it after the current slide. Esc cancels with no change.
        </div>
      </div>
    </div>
  );
}

export default function SceneViewer({ initial = {}, projectId = null, autoOpenHistory = false, registerNavigationGuard = null, onBack = null, onOpenProject = null, onProjectDeleted = null }) {
  // Embedded (workspace) mode binds a persisted project by id and
  // offers back-navigation; standalone (scenes.html) mode drives
  // everything from the query string and localStorage instead.
  const embedded = projectId != null;
  const [viewerReady, setViewerReady] = useState(null);
  const initialDeck = DECKS.some((d) => d.name === initial.deck) ? initial.deck : DECKS[0].name;
  const [deckName, setDeckName] = useState(initialDeck);
  const fixture = useMemo(() => DECKS.find((d) => d.name === deckName) ?? DECKS[0], [deckName]);
  // Live decks compile on the server and swap in on ready: the
  // displayed fixture stays mounted and interactive while a
  // request is in flight, so loading never flashes stale fonts
  // or tears down the stage. A swap remounts the viewer, which
  // clears selection by construction.
  const loaderRef = useRef(null);
  if (!loaderRef.current) {
    loaderRef.current = createLiveDeckLoader({
      compile: async ({ intent, theme, variant, signal }) => {
        const res = await fetch("/api/v2/scenes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent, theme, variant }),
          signal,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          const detail = Array.isArray(body?.errors) && body.errors.length > 0 ? `: ${body.errors[0]}` : "";
          throw new Error(`${body?.error ?? `request failed (${res.status})`}${detail}`);
        }
        return body;
      },
    });
  }
  const [liveSnap, setLiveSnap] = useState(() => loaderRef.current.snapshot());
  const [liveDeck, setLiveDeck] = useState(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveCatalog, setLiveCatalog] = useState({ examples: [], themes: [] });
  const [liveForm, setLiveForm] = useState({ example: "", theme: "", variant: "plain" });
  useLayoutEffect(() => loaderRef.current.subscribe((s) => {
    setLiveSnap(s);
    if (s.status === "ready" && s.deck) {
      // A new live deck discards any unsaved edits: without
      // persistence there is nowhere to keep them, so the reset
      // is explicit navigation, never silent loss mid-session.
      // An open text draft commits first (pending-edit policy);
      // the swap waits for a successful commit.
      const pending = adapterRef.current;
      const swap = () => {
        exitEdit();
        if (!projectRef.current) docRef.current = null;
        setEditedScenes(null);
        setLiveDeck({
          name: `live:${s.deck.deck.name}:${s.deck.deck.theme}:${s.deck.deck.variant}`,
          theme: s.deck.deck.theme,
          variant: s.deck.deck.variant,
          scenes: s.deck.scenes,
        });
      };
      if (pending?.hasPendingEdit?.()) {
        pending.commitPendingEdit().then((r) => {
          if (r.ok) swap();
        });
      } else {
        swap();
      }
    }
    // Loading and error keep the displayed deck untouched: the
    // previous scenes stay mounted until a newer compile lands.
  }), []);
  // Opening the Live panel loads its catalogs; the fixture-only
  // paths (smoke, eval) never fetch.
  useLayoutEffect(() => {
    if (!liveOpen) return undefined;
    let cancelled = false;
    Promise.all([
      fetch("/api/v2/examples").then((r) => r.json().catch(() => null)),
      fetch("/api/v2/themes").then((r) => r.json().catch(() => null)),
    ]).then(([ex, th]) => {
      if (cancelled) return;
      const examples = Array.isArray(ex?.examples) ? ex.examples : [];
      const themes = Array.isArray(th?.themes) ? th.themes : [];
      setLiveCatalog({ examples, themes });
      setLiveForm((f) => ({
        example: f.example || examples[0]?.id || "",
        theme: f.theme || examples[0]?.theme || themes[0] || "",
        variant: f.variant || "plain",
      }));
    }).catch(() => {
      if (!cancelled) setLiveCatalog({ examples: [], themes: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [liveOpen]);
  function pickFixture(name) {
    guardedNav(() => {
      exitEdit();
      if (!projectRef.current) docRef.current = null;
      setEditedScenes(null);
      loaderRef.current.abort();
      setLiveDeck(null);
      setDeckName(name);
    });
  }
  // V2-5D pending-edit policy: filmstrip, deck, and zoom navigation
  // commit an open text draft first and proceed only on success.
  // The error stays visible with the draft preserved.
  function guardedNav(fn) {
    const adapter = adapterRef.current;
    if (editOn && adapter?.hasPendingEdit?.()) {
      adapter.commitPendingEdit().then((r) => {
        if (r.ok) fn();
      });
      return;
    }
    fn();
  }
  // V2-5I slide management: the engine deck stays the sole truth;
  // React owns filmstrip selection (ids), menus, drag previews, and
  // confirmations — never a mutable slide collection.
  const [slideSel, setSlideSel] = useState([]);
  const [railTab, setRailTab] = useState("slides");
  const [slideAnchor, setSlideAnchor] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Drag state lives in refs, never in render state: re-rendering
  // mid-gesture replaces the drag-source node and Chrome cancels
  // the drop. The insertion marker is drawn by direct DOM edits
  // for the same reason — previews stay out of authoritative and
  // rendered state alike.
  const dragRef = useRef(null);
  const asideRef = useRef(null);
  function clearDropMarker() {
    const aside = asideRef.current;
    if (!aside) return;
    for (const m of aside.querySelectorAll("[data-drop-marker]")) m.remove();
  }
  function showDropMarker(thumbId, pos) {
    const aside = asideRef.current;
    if (!aside) return;
    const btn = aside.querySelector(`[data-thumb="${CSS.escape(thumbId)}"]`);
    const wrap = btn?.parentElement;
    if (!btn || !wrap || !wrap.parentElement) return;
    const existing = aside.querySelector("[data-drop-marker]");
    if (existing && existing.dataset.dropMarker === pos && (pos === "before" ? existing.nextSibling === wrap : existing.previousSibling === wrap)) return;
    clearDropMarker();
    const marker = document.createElement("div");
    marker.setAttribute("data-drop-marker", pos);
    marker.style.height = "3px";
    marker.style.background = "var(--color-accent)";
    marker.style.borderRadius = "2px";
    if (pos === "before") {
      marker.style.marginBottom = "2px";
      wrap.parentElement.insertBefore(marker, wrap);
    } else {
      marker.style.marginTop = "2px";
      wrap.parentElement.insertBefore(marker, wrap.nextSibling);
    }
  }
  function followSlideId(id) {
    const v = viewerRef.current;
    if (!v?.api || id == null) return;
    const i = v.api.indexOf(id);
    if (i >= 0) v.api.goTo(i);
  }
  async function doInsertSlide() {
    const a = adapterRef.current;
    if (!a) return;
    const r = await a.insertSlide();
    if (!r.ok) return;
    followSlideId(r.id);
    setSlideSel([r.id]);
    setSlideAnchor(r.id);
    setMenuFor(null);
  }
  async function doInsertLayout(templateId) {
    const a = adapterRef.current;
    if (!a) return;
    const r = await a.insertLayoutSlide(templateId);
    if (!r.ok) return;
    setGalleryOpen(false);
    followSlideId(r.id);
    setSlideSel([r.id]);
    setSlideAnchor(r.id);
    setMenuFor(null);
  }
  async function doDuplicateActive() {
    const id = viewerRef.current?.api?.snapshot().slideId ?? null;
    if (!id) return;
    setChooserOpen(false);
    await doDuplicateSlides([id]);
  }
  async function doDuplicateSlides(ids) {    const a = adapterRef.current;
    if (!a || ids.length === 0) return;
    const ordered = (docRef.current?.snapshot().scenes ?? []).map((s) => s.id).filter((id) => ids.includes(id));
    const r = await a.duplicateSlides(ordered);
    if (!r.ok) return;
    setSlideSel(r.ids);
    setSlideAnchor(r.ids[0] ?? null);
    if (r.ids[0]) followSlideId(r.ids[0]);
    setMenuFor(null);
  }
  async function doDeleteSlides(ids) {
    const a = adapterRef.current;
    if (!a || ids.length === 0) return;
    const v = viewerRef.current;
    const oldIndex = v?.api ? v.api.snapshot().slideIndex : 0;
    const r = await a.deleteSlides(ids);
    if (!r.ok) return;
    const scenes = docRef.current?.snapshot().scenes ?? [];
    const idx = Math.min(oldIndex, scenes.length - 1);
    if (v?.api) v.api.goTo(idx);
    const neighbor = scenes[idx]?.id ?? null;
    setSlideSel(neighbor ? [neighbor] : []);
    setSlideAnchor(neighbor);
    setMenuFor(null);
    setConfirmDelete(null);
    setConfirmBulk(false);
  }
  async function doReorderSlide(id, toIndex) {
    const a = adapterRef.current;
    if (!a) return;
    const activeId = viewerRef.current?.api?.snapshot().slideId ?? null;
    const r = await a.reorderSlide(id, toIndex);
    if (!r.ok) return;
    if (activeId) followSlideId(activeId);
  }
  async function doDetachSlide(id) {
    const a = adapterRef.current;
    if (!a) return;
    const r = await a.detachSlide(id);
    if (!r.ok) return;
    setMenuFor(null);
  }
  // Filmstrip picking: click navigates (committing text first),
  // Ctrl/Cmd toggles, Shift extends a contiguous range. Outside
  // edit mode the filmstrip stays navigation-only.
  function thumbPick(e, id, index) {
    setMenuFor(null);
    if (!editOn || !api) {
      api?.goTo(index);
      return;
    }
    if (e.shiftKey) {
      const order = (docRef.current?.snapshot().scenes ?? shownScenes).map((s) => s.id);
      const anchor = slideAnchor && order.includes(slideAnchor) ? slideAnchor : (api.snapshot().slideId ?? order[index]);
      const a = order.indexOf(anchor);
      const lo = Math.min(a, index);
      const hi = Math.max(a, index);
      const range = order.slice(lo, hi + 1);
      guardedNav(() => {
        api.goTo(index);
        setSlideSel(range);
      });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSlideSel((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]));
      setSlideAnchor(id);
      return;
    }
    guardedNav(() => {
      api.goTo(index);
      setSlideSel([id]);
      setSlideAnchor(id);
    });
  }
  // V2-5C editing: an engine document over the displayed scenes
  // plus the interaction adapter. Toggling off keeps the edited
  // scenes on screen read-only (nothing is silently discarded);
  // only explicit deck navigation resets to fixtures — there is
  // no persistence yet, and the status line says so.
  const docRef = useRef(null);
  const adapterRef = useRef(null);
  const [editOn, setEditOn] = useState(false);
  const [editedScenes, setEditedScenes] = useState(null);
  const [editStatus, setEditStatus] = useState({ rev: 0, error: null, preparing: false });
  // V2-6A durable projects: the bound project (id/title/durable
  // revision) plus the save-state machine. savedEngineRev is the
  // engine revision confirmed by the last successful PUT; dirty means
  // the engine moved past it. Refs mirror state for async callbacks.
  const [project, setProject] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projectList, setProjectList] = useState([]);
  const [projectListError, setProjectListError] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameConflict, setRenameConflict] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [pendingSwitchId, setPendingSwitchId] = useState(null);
  const pendingSwitchRef = useRef(null);
  // V2-7A unified shell: collapsible rails, right-rail tabs
  // (inspector vs assistant placeholder), present overlay, and an
  // explicit leave guard for workspace navigation. All editing
  // behavior underneath is unchanged.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState("inspector");
  const [rightOpen, setRightOpen] = useState(true);
  const [presenting, setPresenting] = useState(null); // slide index or null
  const [pendingLeave, setPendingLeave] = useState(null); // { label, run } or null
  const [titleDraft, setTitleDraft] = useState(null); // null = not renaming
  const [titleError, setTitleError] = useState(null);
  const titleDraftRef = useRef(titleDraft); titleDraftRef.current = titleDraft;
  // V2-6B durable version history: the project being inspected, its
  // revision list (audit metadata only), the selected revision's
  // preview document, and the guarded restore flow.
  const [historyFor, setHistoryFor] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedRev, setSelectedRev] = useState(null);
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState(null);
  const [restoreDone, setRestoreDone] = useState(null);
  const assistantRef = useRef(null), assistantBridgeRef = useRef(null), rightRailRef = useRef(null);
  const gridDraftsRef = useRef(new Set()), titleRequestRef = useRef(false);
  const [gridPending, setGridPending] = useState(false);
  const [assistantReload, setAssistantReload] = useState(null), [assistantReloadBusy, setAssistantReloadBusy] = useState(false);
  const registerAssistant = useCallback(controller => { assistantRef.current = controller; return () => { if (assistantRef.current === controller) assistantRef.current = null; }; }, []);
  const reportGridDraft = useCallback((id, dirty) => {
    if (dirty) gridDraftsRef.current.add(id); else gridDraftsRef.current.delete(id);
    setGridPending(gridDraftsRef.current.size > 0);
  }, []);
  const assistantBridge = useMemo(() => ({ settle: options => assistantBridgeRef.current.settle(options), syncSaved: options => assistantBridgeRef.current.syncSaved(options) }), []);
  const projectRef = useRef(null);
  const savedEngineRevRef = useRef(0);
  const pendingSaveRef = useRef(null);
  const abandonedDocumentsRef = useRef(new WeakSet());
  const pendingLeaveRef = useRef(null);
  const leavePolicyRef = useRef(null);
  const autosaveRef = useRef(null);
  if (!autosaveRef.current) {
    autosaveRef.current = createAutosave({
      saveNow: () => saveNowRef.current?.("autosave"),
      onState: (e) => {
        if (e?.type === "autosave-failed") setSaveState((s) => (s === "saving" ? "error" : s));
      },
    });
  }
  const saveNowRef = useRef(null);
  // V2-5D inline text state, mirrored from the adapter's onTextEdit
  // callback (the adapter owns the session; React only displays).
  const [textState, setTextState] = useState({ editing: false, elementId: null, conflict: null, overflow: null, paragraphs: null });
  function exitEdit() {
    // Pending-edit policy: leaving edit mode commits the draft
    // first; a failed commit keeps edit mode open with the error.
    const adapter = adapterRef.current;
    if (adapter?.hasPendingEdit?.()) {
      adapter.commitPendingEdit().then((r) => {
        if (r.ok) exitEdit();
      });
      return;
    }
    try {
      adapterRef.current?.detach();
    } catch { /* teardown only */ }
    adapterRef.current = null;
    setEditOn(false);
    setTextState({ editing: false, elementId: null, conflict: null, overflow: null, paragraphs: null });
    setEditStatus({ rev: 0, error: null, preparing: false });
  }
  async function enterEdit() {
    if (editOn || !viewerRef.current) return;
    const targetViewer = viewerRef.current;
    setEditStatus({ rev: 0, error: null, preparing: true });
    try {
      const { createDocument } = await import("../../../../packages/model/engine.ts");
      const { attachEditor } = await import("../../../../packages/editor/scene-edit.js");
      const source = editedScenes ?? deck.scenes;
      const doc = docRef.current || await createDocument(structuredClone(source));
      if (viewerRef.current !== targetViewer) return;
      const adapter = attachEditor(targetViewer, doc, {
        root: mountRef.current,
        onError: (r) => setEditStatus((s) => ({ ...s, error: `${r.code}: ${r.message}` })),
        onSync: (scenes) => {
          setEditedScenes(scenes);
          setEditStatus({ rev: doc.snapshot().revision, error: null, preparing: false });
          markDirtyFromEngine();
        },
        onTextEdit: (e) => {
          setTextState({
            editing: e.editing,
            elementId: e.elementId ?? null,
            conflict: e.conflict ?? null,
            error: e.error ?? null,
            overflow: e.overflow ?? null,
            paragraphs: e.paragraphs ?? null,
          });
          if (e.committed) {
            setEditStatus({ rev: doc.snapshot().revision, error: null, preparing: false });
            markDirtyFromEngine();
          }
        },
      });
      docRef.current = doc;
      adapterRef.current = adapter;
      setEditStatus({ rev: doc.snapshot().revision, error: null, preparing: false });
      setEditOn(true);
    } catch (err) {
      setEditStatus({ rev: 0, error: String(err?.message ?? err), preparing: false });
    }
  }
  // V2-6A save: captures a known authoritative revision (the
  // engine snapshot plus its revision at submit) and confirms
  // against the durable project revision. Chart/table grids and
  // open text drafts never enter here — callers commit pending
  // text first and unapplied drafts stay local by policy.
  // V2-6B: attaches command provenance (envelope ids committed
  // since the last confirmed save) as descriptive audit metadata.
  function collectProvenance(saveOrigin) {
    const doc = docRef.current;
    try {
      const engineRevision = doc?.snapshot().revision ?? null;
      let historyLength = null;
      try {
        historyLength = doc?.status?.()?.historyLength ?? null;
      } catch { /* status is best-effort audit metadata */ }
      const log = typeof doc?.log === "function" ? doc.log() : [];
      const envelopeIds = (Array.isArray(log) ? log : [])
        .filter((e) => e && Number.isInteger(e.resultingRevision) && e.resultingRevision > savedEngineRevRef.current)
        .map((e) => e.envelopeId)
        .filter((id) => typeof id === "string" && id.length > 0)
        .slice(-50);
      return { actor: "human", saveOrigin, envelopeIds, engineRevision, historyLength };
    } catch {
      return { actor: "human", saveOrigin, envelopeIds: [], engineRevision: null, historyLength: null };
    }
  }
  async function saveNow(saveOrigin = "manual", guard = null) {
    if (guard && !guard.current()) return { ok: false, code: "op-rejected", message: "session changed" };
    const adapter = adapterRef.current;
    const doc = docRef.current;
    let proj = projectRef.current;
    if (!doc || !proj) return { ok: false, code: "op-rejected", message: "no project bound — save as a new project first" };
    if (abandonedDocumentsRef.current.has(doc)) return { ok: false, code: "op-rejected", message: "document discarded" };
    if (adapter?.hasPendingEdit?.()) {
      const r = await adapter.commitPendingEdit();
      if (!r.ok) return r;
    }
    if (docRef.current !== doc || projectRef.current?.id !== proj.id || abandonedDocumentsRef.current.has(doc)) return { ok: false, code: "op-rejected", message: "project changed or discarded during save" };
    if (pendingSaveRef.current) {
      const result = await pendingSaveRef.current;
      if (!result.ok) return result;
      if (docRef.current !== doc || projectRef.current?.id !== proj.id || abandonedDocumentsRef.current.has(doc)) return { ok: false, code: "op-rejected", message: "project changed or discarded during save" };
      return saveNow(saveOrigin, guard);
    }
    if (guard && !guard.current()) return { ok: false, code: "op-rejected", message: "session changed" };
    proj = projectRef.current;
    if (docRef.current !== doc || !proj) return { ok: false, code: "op-rejected", message: "project changed during save" };
    const snapNow = doc.snapshot();
    const atEngineRev = snapNow.revision;
    if (atEngineRev === savedEngineRevRef.current && saveState !== "error" && saveState !== "stale") {
      setSaveState("saved");
      return { ok: true, revision: atEngineRev, noop: true };
    }
    setSaveState("saving");
    setSaveError(null);
    const task = (async () => {
      try {
        const scenes = structuredClone(snapNow.scenes);
        const updated = await apiSave(proj.id, {
          baseRevision: proj.revision,
          title: proj.title,
          scenes,
          provenance: collectProvenance(saveOrigin),
        }, guard ? capturedAssistantFetch(guard) : undefined);
        if (guard && !guard.current()) return { ok: false, code: "op-rejected", message: "session changed" };
        if (docRef.current !== doc || projectRef.current?.id !== proj.id) return { ok: false, code: "op-rejected", message: "project changed during save" };
        savedEngineRevRef.current = atEngineRev;
        projectRef.current = { ...proj, revision: updated.revision, updatedAt: updated.updatedAt };
        setProject(projectRef.current);
        writeLastProject(proj.id);
        // Only the submitted revision counts as saved: edits that
        // landed mid-flight keep the document dirty and reschedule.
        if (doc.snapshot().revision === atEngineRev) {
          setSaveState("saved");
        } else {
          setSaveState("dirty");
          autosaveRef.current?.schedule();
        }
        return { ok: true, revision: updated.revision };
      } catch (err) {
        if (guard && !guard.current()) return { ok: false, code: "op-rejected", message: "session changed" };
        if (err?.code === "stale-revision") {
          setSaveState("stale");
          setSaveError(err.message);
        } else if (err?.status === 503 || /unavailable|network|fetch|failed/i.test(err?.message ?? "")) {
          setSaveState("unavailable");
          setSaveError(err.message);
        } else {
          setSaveState("error");
          setSaveError(err.message);
        }
        return { ok: false, code: "op-rejected", message: err.message };
      }
    })();
    pendingSaveRef.current = task;
    let result;
    try { result = await task; } finally { if (pendingSaveRef.current === task) pendingSaveRef.current = null; }
    if (result.ok && docRef.current === doc && !abandonedDocumentsRef.current.has(doc) && doc.snapshot().revision !== savedEngineRevRef.current) return saveNow(saveOrigin, guard);
    return result;
  }
  saveNowRef.current = saveNow;

  function markDirtyFromEngine() {
    if (!projectRef.current) {
      setSaveState((s) => (editOn ? "dirty" : s));
      return;
    }
    const rev = docRef.current?.snapshot().revision ?? 0;
    setSaveState(rev === savedEngineRevRef.current ? "saved" : "dirty");
    if (rev !== savedEngineRevRef.current) autosaveRef.current?.schedule();
  }

  async function saveAsNewProject() {
    const doc = docRef.current;
    if (!editOn || !doc) return;
    if (adapterRef.current?.hasPendingEdit?.()) {
      const r = await adapterRef.current.commitPendingEdit();
      if (!r.ok) return;
    }
    const snapNow = doc.snapshot();
    setSaveState("saving");
    setSaveError(null);
    try {
      const created = await apiCreate({
        title: projectRef.current?.title ?? `Project ${new Date().toLocaleString()}`,
        scenes: structuredClone(snapNow.scenes),
        origin: { kind: "mixed" },
      });
      projectRef.current = { id: created.id, title: created.title, revision: created.revision, updatedAt: created.updatedAt };
      setProject(projectRef.current);
      savedEngineRevRef.current = snapNow.revision;
      setSaveState("saved");
      writeLastProject(created.id);
      // Standalone deep link only: embedded mode is routed by hash
      // and must never rewrite the URL out from under the router.
      if (!embedded) {
        try {
          const q = new URLSearchParams(window.location.search);
          q.set("project", created.id);
          window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
        } catch { /* deep link is a hint only */ }
      }
      refreshProjectList();
    } catch (err) {
      setSaveState(/unavailable|network|fetch/i.test(err?.message ?? "") ? "unavailable" : "error");
      setSaveError(err.message);
    }
  }

  async function refreshProjectList() {
    try {
      setProjectListError(null);
      setProjectList(await apiList());
    } catch (err) {
      setProjectListError(err.message);
    }
  }

  // Swap the engine document to a loaded project document and
  // bind it: fresh session revision, empty undo/redo, saved state.
  // Shared by open and post-restore reload.
  async function attachLoadedProject(loaded, options = {}) {
    const targetViewer = viewerRef.current;
    const { createDocument } = await import("../../../../packages/model/engine.ts");
    const { attachEditor } = await import("../../../../packages/editor/scene-edit.js");
    const fresh = await createDocument(structuredClone(loaded.scenes));
    if (!targetViewer || viewerRef.current !== targetViewer || options.current && !options.current()) return false;
    try {
      adapterRef.current?.detach();
    } catch { /* teardown only */ }
    const adapter = attachEditor(targetViewer, fresh, {
      root: mountRef.current,
      onError: (r) => setEditStatus((s) => ({ ...s, error: `${r.code}: ${r.message}` })),
      onSync: (scenes) => {
        setEditedScenes(scenes);
        setEditStatus({ rev: fresh.snapshot().revision, error: null, preparing: false });
        markDirtyFromEngine();
      },
      onTextEdit: (e) => {
        setTextState({
          editing: e.editing,
          elementId: e.elementId ?? null,
          conflict: e.conflict ?? null,
          error: e.error ?? null,
          overflow: e.overflow ?? null,
          paragraphs: e.paragraphs ?? null,
        });
        if (e.committed) {
          setEditStatus({ rev: fresh.snapshot().revision, error: null, preparing: false });
          markDirtyFromEngine();
        }
      },
    });
    docRef.current = fresh;
    adapterRef.current = adapter;
    setEditedScenes(structuredClone(loaded.scenes));
    projectRef.current = { id: loaded.id, title: loaded.title, revision: loaded.revision, updatedAt: loaded.updatedAt };
    setProject(projectRef.current);
    savedEngineRevRef.current = 0;
    setSaveState("saved");
    setEditStatus({ rev: 0, error: null, preparing: false });
    setEditOn(true);
    setProjectsOpen(false);
    writeLastProject(loaded.id);
    // Standalone deep link only (see saveAsNewProject): the
    // workspace route owns identity in embedded mode.
    if (!embedded) {
      try {
        const q = new URLSearchParams(window.location.search);
        q.set("project", loaded.id);
        window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
      } catch { /* hint only */ }
    }
    const preferred = options.viewport?.slideId;
    const first = loaded.scenes.some(s => s.id === preferred) ? preferred : loaded.scenes[0]?.id ?? null;
    if (first) followSlideId(first);
    setSlideSel(first ? [first] : []);
    if (options.viewport) {
      targetViewer.api.setZoom(options.viewport.zoom);
      const scene = loaded.scenes.find(s => s.id === first);
      const ids = new Set(flattenLayers(scene?.elements ?? []).map(e => e.id));
      const selection = options.viewport.selectedIds.filter(id => ids.has(id));
      if (selection.length) targetViewer.api.selectMany?.(selection);
      const scroll = scrollRef.current;
      if (scroll) { scroll.scrollTop = options.viewport.scrollTop; scroll.scrollLeft = options.viewport.scrollLeft; }
    }
    return true;
  }

  // Open a stored project: commits pending text first (block on
  // failure), then swaps the engine document to the stored scenes.
  // Unsaved edits on the current project require an explicit choice
  // (save-and-switch, discard-and-switch, cancel) — never silent loss.
  // In embedded workspace mode a different id navigates (the router
  // remounts one editor per project) instead of swapping in place.
  async function openProject(id) {
    if (adapterRef.current?.hasPendingEdit?.()) {
      const r = await adapterRef.current.commitPendingEdit();
      if (!r.ok) return;
    }
    if (projectRef.current && leaveGuardNeeded() && !pendingSwitchId) {
      // The guard takes over the flow: close the dialog whose action
      // triggered it, or its overlay would keep swallowing the
      // guard's own buttons (backdrop sits above in-flow banners).
      setProjectsOpen(false);
      pendingSwitchRef.current = { id };
      setPendingSwitchId(id);
      return;
    }
    if (embedded && onOpenProject && projectRef.current && projectRef.current.id !== id) {
      pendingSwitchRef.current = null;
      setPendingSwitchId(null);
      onOpenProject(id);
      return;
    }
    pendingSwitchRef.current = null;
    setPendingSwitchId(null);
    setSaveState("saving");
    setSaveError(null);
    const previousDocument = docRef.current;
    try {
      const loaded = await apiLoad(id);
      await attachLoadedProject(loaded);
    } catch (err) {
      if (previousDocument && docRef.current === previousDocument) abandonedDocumentsRef.current.delete(previousDocument);
      setSaveState("error");
      setSaveError(err.message);
    }
  }

  function capturedAssistantFetch(context) {
    return (url, options) => {
      if (!context.current() || projectSessionKey() !== context.token) throw assistantFailure("session-changed");
      return fetch(url, { ...options, headers: { ...options?.headers, Authorization: `Bearer ${context.token}` } });
    };
  }
  function assistantIntent() {
    const value = viewerRef.current?.api.snapshot();
    return { slideId: value?.slideId, selectedIds: [...(value?.selectedIds ?? [])] };
  }
  function assistantPreview(mode) {
    try { const value = assistantIntent(); return assistantScope(docRef.current?.snapshot().scenes ?? [], value.slideId, value.selectedIds, mode); }
    catch (error) { return { error: error.code ?? "invalid-scope" }; }
  }
  async function settleAssistant(options) {
    const doc = docRef.current, projectId = projectRef.current?.id;
    const current = () => options.current() && projectSessionKey() === options.token && docRef.current === doc && projectRef.current?.id === projectId;
    if (!current()) throw assistantFailure("session-changed");
    if (!editOn || !doc || !projectId || projectRef.current.recoverable) throw assistantFailure("read-only");
    if (gridDraftsRef.current.size) throw assistantFailure("pending-data");
    if (titleDraftRef.current !== null || titleRequestRef.current) throw assistantFailure("pending-title");
    const saved = await saveNow("manual", { token: options.token, current });
    if (!current()) throw assistantFailure("session-changed");
    if (gridDraftsRef.current.size) throw assistantFailure("pending-data");
    if (titleDraftRef.current !== null || titleRequestRef.current) throw assistantFailure("pending-title");
    if (!saved.ok || doc.snapshot().revision !== savedEngineRevRef.current || pendingSaveRef.current || adapterRef.current?.hasPendingEdit?.()) throw assistantFailure("save-blocked");
    if (options.proposalRevision !== undefined && options.proposalRevision !== projectRef.current.revision) throw assistantFailure("stale-project");
    const value = { revision: projectRef.current.revision };
    if (options.slideId) return { ...value, slideId: options.slideId, scopeMode: options.scopeMode,
      scope: assistantScope(doc.snapshot().scenes, options.slideId, options.selectedIds, options.scopeMode) };
    return value;
  }
  async function syncAssistantSaved(options, discard = false) {
    const doc = docRef.current, proj = projectRef.current;
    const current = () => options.current() && projectSessionKey() === options.token && docRef.current === doc && projectRef.current?.id === proj?.id;
    if (!doc || !proj || !current()) return { deferred: true };
    if (options.turn?.run?.projectRevision <= proj.revision) return { loaded: false };
    if (gridDraftsRef.current.size) throw assistantFailure("pending-data");
    if (titleDraftRef.current !== null || titleRequestRef.current) throw assistantFailure("pending-title");
    if (adapterRef.current?.hasPendingEdit?.() || pendingSaveRef.current) return { deferred: true };
    const revision = doc.snapshot().revision;
    if (revision !== savedEngineRevRef.current && !discard) {
      if (options.requested) setAssistantReload({ options, revision, doc });
      else { setSaveState("stale"); setSaveError("Assistant changes are saved. Your edits are intact — load the saved version or save as a new project."); }
      return { deferred: true };
    }
    const clean = () => current() && projectRef.current.revision === proj.revision && doc.snapshot().revision === revision &&
      (discard || revision === savedEngineRevRef.current) && !adapterRef.current?.hasPendingEdit?.() &&
      !pendingSaveRef.current && !gridDraftsRef.current.size && !titleRequestRef.current && titleDraftRef.current === null;
    const viewport = { ...viewerRef.current.api.snapshot(), scrollTop: scrollRef.current?.scrollTop ?? 0, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };
    const focused = document.activeElement;
    const loaded = await apiLoad(proj.id, capturedAssistantFetch({ token: options.token, current }));
    if (!clean()) return { deferred: true };
    if (loaded.id !== proj.id || !Number.isSafeInteger(loaded.revision) || loaded.revision < 0) throw assistantFailure("invalid-response");
    if (loaded.revision <= proj.revision) return { loaded: false };
    const attached = await attachLoadedProject(loaded, { current: clean, viewport });
    if (attached && focused?.isConnected) focused.focus({ preventScroll: true });
    return { loaded: attached === true, deferred: !attached };
  }
  assistantBridgeRef.current = { settle: settleAssistant, syncSaved: syncAssistantSaved };

  function historyKindLabel(m) {
    if (!m) return "";
    if (m.kind === "create") return "Created";
    if (m.kind === "rename") return "Renamed";
    if (m.kind === "restore") return `Restored from rev ${m.restoredFrom}`;
    if (m.kind === "baseline") return "Baseline";
    if (m.kind === "save") return m.saveOrigin === "autosave" ? "Autosaved" : "Saved";
    return m.kind;
  }

  function sceneHeadline(s, index = 0) {
    if (typeof s?.headline === "string" && s.headline.trim()) return s.headline.trim().slice(0, 80);
    for (const el of s?.elements ?? []) {
      const t = (el?.paragraphs ?? []).flatMap((p) => (p?.runs ?? []).map((r) => r?.text ?? "")).join("");
      if (t && t.trim()) return t.trim().slice(0, 80);
    }
    return embedded ? `Slide ${index + 1}` : s?.id ?? "slide";
  }

  function historyNeedsChoice() {
    return historyFor && projectRef.current?.id === historyFor.id && leaveGuardNeeded();
  }

  // Open the version-history panel for a project and load its
  // revision list (audit metadata, never scene bytes).
  async function openHistory(p) {
    setHistoryFor({ id: p.id, title: p.title });
    setHistoryList([]);
    setHistoryMeta(null);
    setHistoryError(null);
    setSelectedRev(null);
    setSelectedMeta(null);
    setSelectedDoc(null);
    setRestoreConfirm(false);
    setRestoreError(null);
    setRestoreDone(null);
    setHistoryLoading(true);
    try {
      const out = await apiListRevisions(p.id);
      setHistoryList(out.revisions);
      setHistoryMeta({ currentRevision: out.currentRevision, retention: out.retention });
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Preview one revision: full validated document, shown as a
  // slide-count + headline summary (no visual diff in this slice).
  async function selectHistoryRevision(rev) {
    if (!historyFor) return;
    setSelectedRev(rev);
    setSelectedMeta(historyList.find((m) => m.revision === rev) ?? null);
    setSelectedDoc(null);
    setRestoreConfirm(false);
    setRestoreError(null);
    setRestoreDone(null);
    const meta = historyList.find((m) => m.revision === rev);
    if (meta && !meta.recoverable) return;
    setSelectedLoading(true);
    try {
      const out = await apiGetRevision(historyFor.id, rev);
      setSelectedMeta(out.revision);
      setSelectedDoc(out.project);
    } catch (err) {
      setHistoryError(err.message);
      setSelectedRev(null);
    } finally {
      setSelectedLoading(false);
    }
  }

  // Restore the selected revision as a NEW current revision. Never
  // rewrites history: the counter advances and the source row is
  // preserved. Unsaved current edits require Save / Discard / Cancel.
  async function doRestore(how) {
    if (!historyFor || selectedRev === null || selectedRev === undefined) return;
    if (adapterRef.current?.hasPendingEdit?.()) {
      const r = await adapterRef.current.commitPendingEdit();
      if (!r.ok) {
        setRestoreError("Could not commit the open text draft — resolve it first, then restore again.");
        return;
      }
    }
    const sameProject = projectRef.current?.id === historyFor.id;
    if (sameProject && historyNeedsChoice() && how !== "save" && how !== "discard") {
      setRestoreConfirm(true);
      return;
    }
    setRestoreConfirm(false);
    setRestoreBusy(true);
    setRestoreError(null);
    setRestoreDone(null);
    let discarded = null;
    try {
      let base = historyMeta?.currentRevision ?? null;
      if (sameProject) {
        if (how === "save") {
          const r = await saveNow("manual");
          if (!r.ok) {
            setRestoreError(`Could not save current edits (${r.message ?? "save failed"}) — nothing was restored.`);
            return;
          }
        } else if (how === "discard") {
          discarded = docRef.current;
          discardDocument();
          if (pendingSaveRef.current) await pendingSaveRef.current;
        }
        base = projectRef.current.revision;
      }
      const out = await apiRestore(historyFor.id, { revision: selectedRev, baseRevision: base, provenance: { actor: "human" } });
      if (sameProject) {
        await attachLoadedProject(out.project);
      } else {
        refreshProjectList();
      }
      const refreshed = await apiListRevisions(historyFor.id);
      setHistoryList(refreshed.revisions);
      setHistoryMeta({ currentRevision: refreshed.currentRevision, retention: refreshed.retention });
      setRestoreDone(`Restored rev ${out.restoredFrom} as rev ${out.project.revision}. History is preserved; session undo was cleared.`);
    } catch (err) {
      if (discarded) abandonedDocumentsRef.current.delete(discarded);
      if (err?.code === "stale-revision") {
        setRestoreError(`Someone saved first (${err.message}). Reload the version list and try again — nothing was restored.`);
        try {
          const refreshed = await apiListRevisions(historyFor.id);
          setHistoryList(refreshed.revisions);
          setHistoryMeta({ currentRevision: refreshed.currentRevision, retention: refreshed.retention });
        } catch { /* list refresh is best-effort */ }
      } else {
        setRestoreError(err.message);
      }
    } finally {
      setRestoreBusy(false);
    }
  }

  // V2-7A shell helpers: title rename, workspace leave guard,
  // present mode, and dialog focus return. Editing behavior below
  // is untouched — these only arrange committed state.
  const narrow = useNarrow();
  useEffect(() => {
    if (narrow) {
      setLeftCollapsed(true);
      setRightOpen(false);
    }
  }, [narrow]);
  useFocusReturn(projectsOpen);
  useFocusReturn(historyFor != null);
  useFocusReturn(galleryOpen);
  useFocusReturn(presenting != null);
  // Escape closes dialogs even when focus never entered them (the
  // per-dialog handlers only see keys dispatched inside). Topmost
  // first; each setter is idempotent so a focused-dialog handler
  // that already stopped propagation never double-fires here.
  useEffect(() => {
    if (!projectsOpen && !historyFor && !galleryOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (galleryOpen) setGalleryOpen(false);
      else if (historyFor) setHistoryFor(null);
      else if (projectsOpen) setProjectsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectsOpen, historyFor, galleryOpen]);
  useEffect(() => {
    if (!narrow || !rightOpen) return undefined;
    setLeftCollapsed(true);
    const root = rightRailRef.current, previous = document.activeElement;
    if (!root) return undefined;
    const otherModal = () => [...document.querySelectorAll('[role="dialog"]')].some(n => n !== root && n.getClientRects().length);
    const focusable = () => [...root.querySelectorAll('button:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(n => n.getClientRects().length);
    if (!root.contains(document.activeElement)) (focusable()[0] ?? root).focus();
    const focus = event => { if (!otherModal() && !root.contains(event.target)) (focusable()[0] ?? root).focus(); };
    const key = event => {
      if (otherModal()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRightOpen(false); return; }
      if (event.key !== 'Tab') return;
      const nodes = focusable(), first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); root.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('focusin', focus); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('focusin', focus); document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
  }, [narrow, rightOpen]);
  function chooseRightTab(tab) { setRightTab(tab); setRightOpen(true); if (narrow) setLeftCollapsed(true); }
  function rightTabKey(event) {
    const tab = event.key === 'Home' ? 'inspector' : event.key === 'End' ? 'assistant' : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? rightTab === 'assistant' ? 'inspector' : 'assistant' : null;
    if (tab) { event.preventDefault(); chooseRightTab(tab); rightRailRef.current?.querySelector(`#right-tab-${tab}`)?.focus(); }
  }
  const shellBtn = "rounded-md px-2 py-1 text-[12px] text-fg-muted transition hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-40";
  const shellTab = (active) => `rounded-md px-2.5 py-1 text-[12px] font-medium transition ${active ? "bg-raised text-fg" : "text-fg-faint hover:bg-hover hover:text-fg-muted"}`;

  // Top-bar title rename: metadata only — scenes, engine history,
  // and dirty/saved bookkeeping stand, exactly like the dialog
  // rename. Enter commits, Escape or blur cancels.
  async function doRenameTitle() {
    const proj = projectRef.current;
    const title = (titleDraft ?? "").trim();
    if (!proj || !title || title === proj.title) {
      setTitleDraft(null);
      return;
    }
    setTitleError(null);
    titleRequestRef.current = true;
    try {
      const u = await apiRename(proj.id, { title, baseRevision: proj.revision });
      projectRef.current = { ...proj, title: u.title, revision: u.revision, updatedAt: u.updatedAt };
      setProject(projectRef.current);
      setTitleDraft(null);
    } catch (err) {
      if (err?.code === "stale-revision") {
        setTitleError(`Changed elsewhere (${err.message}). Reload it from Projects and rename again — nothing was overwritten.`);
      } else {
        setTitleError(err.message);
      }
    } finally { titleRequestRef.current = false; }
  }

  // Workspace leave guard: back-navigation honors the same policy
  // as project switching. Save & leave is offered only when a
  // project is bound; otherwise Discard & leave / Cancel.
  function leaveGuardNeeded(includeAssistant = true) {
    if (includeAssistant && assistantRef.current?.hasDraft()) return true;
    if (docRef.current && abandonedDocumentsRef.current.has(docRef.current)) return false;
    if (adapterRef.current?.hasPendingEdit?.() || pendingSaveRef.current) return true;
    const doc = docRef.current;
    return Boolean(doc && doc.snapshot().revision !== savedEngineRevRef.current);
  }
  function discardDocument() {
    if (docRef.current) abandonedDocumentsRef.current.add(docRef.current);
    autosaveRef.current?.cancel();
  }
  async function requestLeave(label, run, cancel = () => {}) {
    if (pendingLeaveRef.current) { cancel(); return; }
    if (adapterRef.current?.hasPendingEdit?.()) {
      const result = await adapterRef.current.commitPendingEdit();
      if (!result.ok) { cancel(); return; }
    }
    if (leaveGuardNeeded()) {
      const target = { label, run, cancel };
      pendingLeaveRef.current = target;
      setPendingLeave(target);
      return;
    }
    run();
  }
  function cancelLeave() {
    const target = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    setPendingLeave(null);
    target?.cancel();
  }
  async function leaveWithChoice(how) {
    const target = pendingLeaveRef.current;
    if (!target) return;
    if (how === "save") {
      const result = await saveNow();
      if (pendingLeaveRef.current !== target || !result.ok || leaveGuardNeeded(false)) return;
    } else {
      discardDocument();
    }
    assistantRef.current?.discardDraft();
    pendingLeaveRef.current = null;
    setPendingLeave(null);
    target.run();
  }
  leavePolicyRef.current = { isDirty: leaveGuardNeeded, request: requestLeave };
  useEffect(() => {
    if (!registerNavigationGuard) return undefined;
    const detach = registerNavigationGuard({
      projectId,
      isDirty: () => leavePolicyRef.current.isDirty(),
      confirm: () => new Promise(resolve => {
        leavePolicyRef.current.request("another page", () => resolve(true), () => resolve(false)).catch(() => resolve(false));
      }),
    });
    return () => { detach(); pendingLeaveRef.current?.cancel(); pendingLeaveRef.current = null; };
  }, [registerNavigationGuard, projectId]);

  function openPresent() {
    const count = (editedScenes ?? deck.scenes).length;
    if (count === 0) return;
    setPresenting(Math.min(Math.max(0, snap?.slideIndex ?? 0), count - 1));
  }

  // Refresh recovery: offer the last-opened project without forcing
  // navigation. The ?project= deep link wins over localStorage.
  // Standalone only — the workspace mounts with an explicit id.
  useLayoutEffect(() => {
    if (embedded) return undefined;
    let cancelled = false;
    const q = (() => {
      try {
        return new URLSearchParams(window.location.search).get("project");
      } catch {
        return null;
      }
    })();
    const last = q ?? readLastProject();
    if (!last) return undefined;
    apiLoad(last)
      .then((loaded) => {
        if (cancelled) return;
        setProject((p) => p ?? { id: loaded.id, title: loaded.title, revision: loaded.revision, updatedAt: loaded.updatedAt, recoverable: true });
      })
      .catch(() => { /* no recovery offer when storage is down */ });
    return () => {
      cancelled = true;
    };
  }, []);

  // Embedded workspace mode: bind the routed project on mount and
  // detach the adapter on unmount, so one mounted editor owns
  // exactly one engine document and navigation never stacks them.
  // The history route flag is consumed once, on the first bind.
  const autoHistoryRef = useRef(autoOpenHistory);
  useEffect(() => {
    if (!embedded || !viewerReady) return undefined;
    let cancelled = false;
    openProject(projectId).then(() => {
      if (!cancelled && autoHistoryRef.current && projectRef.current) {
        autoHistoryRef.current = false;
        openHistory({ id: projectRef.current.id, title: projectRef.current.title });
      }
    });
    return () => {
      cancelled = true;
      try {
        adapterRef.current?.detach();
      } catch { /* teardown only */ }
      adapterRef.current = null;
      docRef.current = null;
    };
  }, [projectId, viewerReady]);
  useEffect(() => {
    if (embedded && autoOpenHistory && projectRef.current && !historyFor) {
      openHistory({ id: projectRef.current.id, title: projectRef.current.title });
    }
  }, [autoOpenHistory]);

  // Unsaved-changes guard: refresh/close warns while dirty or saving.
  useLayoutEffect(() => {
    const onBeforeUnload = (e) => {
      if (leavePolicyRef.current?.isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  // The displayed deck is the live compile when one is ready,
  // else the chosen fixture. Identity change remounts everything
  // downstream (fonts, viewer, selection).
  const deck = liveDeck ?? fixture;
  const mountRef = useRef(null);
  const scrollRef = useRef(null);
  const viewerRef = useRef(null);
  const [snap, setSnap] = useState(null);
  const [mountError, setMountError] = useState(null);
  // Font readiness gates the entire mount: the viewer (stage +
  // filmstrip) renders only after scene faces resolve, so neither
  // users nor screenshots ever see system-substitution flashes,
  // and evaluation never races them. Scenes are never recompiled
  // or mutated for fonts. A failed load still mounts and reports
  // via data-missing-fonts instead of hanging.
  const [fonts, setFonts] = useState({ settled: false, ready: false, missing: [] });
  useLayoutEffect(() => {
    let cancelled = false;
    setFonts({ settled: false, ready: false, missing: [] });
    ensureDeckFonts(deck.scenes).then((r) => {
      if (!cancelled) setFonts({ settled: true, ready: r.ready, missing: r.missing });
    });
    return () => {
      cancelled = true;
    };
  }, [deck]);

  // The mount runs only after scene faces settle (see above):
  // layout effect, not passive, so the mounted SVG exists before
  // paint (and before headless --dump-dom serializes), with final
  // faces — never a substitution flash.
  useLayoutEffect(() => {
    if (!fonts.settled) return undefined;
    const root = mountRef.current;
    if (!root) return undefined;
    let viewer;
    try {
      viewer = createViewer(root, deck.scenes);
    } catch (err) {
      setMountError(err?.message ?? String(err));
      return undefined;
    }
    setMountError(null);
    viewerRef.current = viewer;
    setViewerReady(viewer);
    const off = viewer.onChange(setSnap);
    const startSlide = Number.isFinite(Number(initial.slide)) ? Number(initial.slide) : 0;
    const startZoom = Number.isFinite(Number(initial.zoom)) ? Number(initial.zoom) : 1;
    viewer.api.setZoom(startZoom);
    viewer.api.goTo(startSlide);
    if (typeof initial.select === "string" && initial.select) viewer.api.select(initial.select);
    // Eager initial fit: ResizeObserver covers later resizes, but
    // the first paint must not wait for an observation round-trip.
    const box = scrollRef.current?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0) viewer.api.refit(box.width, box.height);
    setSnap(viewer.api.snapshot());
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
        const box = scrollRef.current?.getBoundingClientRect();
        if (box) viewer.api.refit(box.width, box.height);
      })
      : null;
    ro?.observe?.(scrollRef.current);
    // Keyboard lives in scene-dom (one behavior for every shell);
    // only teardown here.
    return () => {
      ro?.disconnect?.();
      off();
      viewer.destroy();
      viewerRef.current = null;
      setViewerReady(null);
    };
  }, [deck, fonts.settled]);

  const readOnlyStatus = {
    saved: "Read-only · saved",
    saving: "Read-only · saving…",
    dirty: "Read-only · unsaved changes",
    stale: "Read-only · conflict — newer saved version",
    error: "Read-only · save failed",
    unavailable: "Read-only · storage unavailable — edits not saved",
  }[saveState] ?? "Read-only";

  if (DECKS.length === 0) {
    return <div style={{ padding: 24 }}>No scene fixtures available.</div>;
  }
  if (mountError) {
    return (
      <div role="alert" style={{ padding: 24 }}>
        <h2>Scene failed to load</h2>
        <pre>{mountError}</pre>
      </div>
    );
  }

  const api = viewerRef.current?.api;
  const scale = snap ? snap.fit * snap.zoom : 1;
  const inspected = useInspector(viewerRef.current, snap);
  const slideW = 13.333 * 96;
  const slideH = 7.5 * 96;
  // Filmstrip follows engine edits while editing; fixtures otherwise.
  const shownScenes = editedScenes ?? deck.scenes;
  // Effective filmstrip selection: tracked ids filtered to the live
  // deck, falling back to the active slide. No separate slide
  // collection anywhere — ids resolve against shownScenes.
  const activeSlideId = snap?.slideId ?? shownScenes[snap?.slideIndex ?? 0]?.id ?? null;
  const effSlideSel = (() => {
    const valid = slideSel.filter((id) => shownScenes.some((s) => s.id === id));
    if (valid.length > 0) return valid;
    return activeSlideId ? [activeSlideId] : [];
  })();
  // V2-5E style target: the single selected unlocked shape on the
  // current slide, read from engine scenes while editing. Text and
  // multi selections get no style panel (explicit scope, not a
  // half-wired toolbar).
  const styledShape = editOn && snap?.selectedIds?.length === 1 && snap.slideIndex < shownScenes.length
    ? (shownScenes[snap.slideIndex]?.elements.find((e) => e.id === snap.selectedIds[0] && e.kind === "shape" && !e.locked) ?? null)
    : null;
  // V2-5F text-format target: the single selected unlocked text
  // element whose paragraphs are all single-run. Multi-run bodies
  // get no panel (whole-run addressing only).
  const formattedText = editOn && !textState.editing && snap?.selectedIds?.length === 1 && snap.slideIndex < shownScenes.length
    ? (shownScenes[snap.slideIndex]?.elements.find((e) => {
      if (e.id !== snap.selectedIds[0] || e.kind !== "text" || e.locked) return false;
      const ps = e.paragraphs ?? [];
      return ps.length > 0 && ps.every((p) => Array.isArray(p?.runs) && p.runs.length === 1);
    }) ?? null)
    : null;
  // Chart-data target: the single selected unlocked chart on the
  // current slide, read from engine scenes while editing.
  const chartTarget = editOn && !textState.editing && snap?.selectedIds?.length === 1 && snap.slideIndex < shownScenes.length
    ? (shownScenes[snap.slideIndex]?.elements.find((e) => e.id === snap.selectedIds[0] && e.kind === "chart" && !e.locked) ?? null)
    : null;
  // Table-data target: the single selected unlocked table on the
  // current slide, read from engine scenes while editing.
  const tableTarget = editOn && !textState.editing && snap?.selectedIds?.length === 1 && snap.slideIndex < shownScenes.length
    ? (shownScenes[snap.slideIndex]?.elements.find((e) => e.id === snap.selectedIds[0] && e.kind === "table" && !e.locked) ?? null)
    : null;

  const hasFormatTarget = Boolean(styledShape || formattedText || chartTarget || tableTarget);
  const currentSlide = shownScenes[snap?.slideIndex ?? 0] ?? null;
  const slideProps = currentSlide ? {
    elements: currentSlide.elements.length,
    hidden: currentSlide.elements.filter((e) => e.hidden).length,
    locked: currentSlide.elements.filter((e) => e.locked).length,
  } : null;

  return (
    <div className="flex h-screen flex-col bg-base text-fg" data-workspace-editor={project?.id ?? "unbound"}>
      {/* Embedded routes own project identity; standalone scenes retain
          the developer harness without offering it inside saved work. */}
      <div data-topbar className="flex min-h-[44px] flex-none items-center gap-1.5 overflow-x-auto [&>*]:shrink-0 border-b border-line bg-panel px-3 py-1.5">
        {embedded && onBack && (
          <button type="button" aria-label="Back to workspace" title="Back to presentations" onClick={onBack} className={shellBtn}>← Workspace</button>
        )}
        <button type="button" aria-label={leftCollapsed ? "Show slides rail" : "Hide slides rail"} title={leftCollapsed ? "Show slides rail" : "Hide slides rail"} aria-pressed={!leftCollapsed} onClick={() => setLeftCollapsed((v) => !v)} className={shellBtn}>Slides</button>
        {project ? (
          <input
            aria-label="Project title"
            data-project-title
            value={titleDraft ?? project.title}
            onChange={(e) => { setTitleDraft(e.target.value); setTitleError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") doRenameTitle();
              else if (e.key === "Escape") { setTitleDraft(null); setTitleError(null); }
            }}
            onBlur={() => { if (titleDraft !== null) setTitleDraft(null); }}
            title="Project title — Enter renames, Escape cancels"
            className="min-w-0 max-w-[280px] flex-none rounded-md bg-transparent px-2 py-1 text-[14px] font-semibold tracking-tight transition hover:bg-hover focus:bg-field focus:outline-none"
          />
        ) : (
          <span className="flex-none px-1 text-[14px] font-semibold tracking-tight">Presentation Forge</span>
        )}
        {titleError && <span role="alert" className="max-w-[300px] truncate text-[11px] text-danger" title={titleError}>{titleError}</span>}
        {editOn && (
          <>
            <button type="button" aria-label="Save project" title={project ? `Save ${project.title} (rev ${project.revision})` : "Save as a new project"} disabled={saveState === "saving"} onClick={() => (project && !project.recoverable ? saveNow() : saveAsNewProject())} className={shellBtn}>Save</button>
            <span data-save-state={saveState} data-project-state={JSON.stringify(project ?? null)} title={saveError ?? project?.title ?? "no project"} className="flex-none rounded-full border border-line px-2 py-0.5 text-[12px] text-fg-muted">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? `Saved${project ? ` · rev ${project.revision}` : ""}` : saveState === "dirty" ? "Unsaved changes" : saveState === "stale" ? "Conflict — newer saved version" : saveState === "error" ? "Save failed" : saveState === "unavailable" ? "Storage unavailable — edits not saved" : project?.title ?? "No project"}
            </span>
            <button type="button" aria-label="Undo" disabled={!editOn || textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Undo"} onClick={() => adapterRef.current?.undo()} className={shellBtn}>↩ Undo</button>
            <button type="button" aria-label="Redo" disabled={!editOn || textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Redo"} onClick={() => adapterRef.current?.redo()} className={shellBtn}>↪ Redo</button>
          </>
        )}
        <span className="min-w-2 flex-1" />
        {project && !project.recoverable && (
          <button type="button" aria-label="Version history" title={`Version history for ${project.title}`} onClick={() => openHistory(project)} className={shellBtn}>History</button>
        )}
        {project && !project.recoverable && (
          <ProjectExportButton data-topbar-export projectId={project.id} title={project.title} className="rounded-md px-2 py-1 text-[12px] text-fg-muted transition hover:bg-hover hover:text-fg">Export</ProjectExportButton>
        )}
        <button type="button" aria-label="Present" title="Present from the current slide" onClick={openPresent} className={shellBtn}>Present</button>
        <button type="button" aria-label="Assistant" title={embedded ? "Open Assistant" : "AI assistant (not available in standalone viewer)"} aria-pressed={rightTab === "assistant" && rightOpen} onClick={() => chooseRightTab("assistant")} className={shellBtn}>Assistant</button>
        <button type="button" aria-label={rightOpen ? "Hide inspector rail" : "Show inspector rail"} title={rightOpen ? "Hide inspector rail" : "Show inspector rail"} aria-pressed={rightOpen} onClick={() => setRightOpen((v) => !v)} className={shellBtn}>Inspector</button>
      </div>
      <div className="relative flex min-h-0 flex-1">
      {narrow && !leftCollapsed && (
        <div aria-hidden data-rail-backdrop className="absolute inset-0 z-30 bg-[var(--color-overlay)]" onClick={() => setLeftCollapsed(true)} />
      )}
      <div
        aria-live="polite"
        data-viewer-state={JSON.stringify({
          slideId: snap?.slideId ?? null,
          slideIndex: snap?.slideIndex ?? 0,
          slideCount: snap?.slideCount ?? 0,
          zoom: snap?.zoom ?? 1,
          selectedId: snap?.selectedId ?? null,
          selectedIds: snap?.selectedIds ?? [],
        })}
        data-fonts-ready={fonts.settled ? (fonts.ready ? "true" : "false") : "pending"}
        data-missing-fonts={fonts.missing.join(",")}
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      />
      {editOn && (
        <div
          data-edit-state={JSON.stringify({ rev: editStatus.rev, error: editStatus.error, preparing: editStatus.preparing })}
          data-editing="true"
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        />
      )}
      <aside
        ref={asideRef}
        aria-label="Slides"
        className={`min-h-0 flex-none overflow-y-auto border-line bg-panel p-3 ${leftCollapsed ? "hidden" : narrow ? "absolute inset-y-0 left-0 z-40 w-72 border-r shadow-[var(--shadow-float)]" : "relative w-44 border-r"}`}
        onKeyDown={(e) => {
          // Filmstrip-local keys only: Escape settles bulk selection
          // back to the active slide. Canvas keys live on the mount
          // root and never fire here.
          if (e.key === "Escape" && editOn) {
            const activeId = api?.snapshot().slideId ?? null;
            setSlideSel(activeId ? [activeId] : []);
            setMenuFor(null);
            setConfirmDelete(null);
            setConfirmBulk(false);
          }
        }}
        onDragOver={(e) => {
          if (!editOn || !dragRef.current) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (!editOn || !dragRef.current) return;
          e.preventDefault();
          const order = (docRef.current?.snapshot().scenes ?? []).map((s) => s.id).filter((id) => id !== dragRef.current);
          doReorderSlide(dragRef.current, order.length);
          dragRef.current = null;
          clearDropMarker();
        }}
      >
        <div className="mb-2 text-[12px] text-fg-faint">
          {(snap?.slideIndex ?? 0) + 1} / {snap?.slideCount ?? deck.scenes.length}
        </div>
        {editOn && (
          <div role="tablist" aria-label="Sidebar" className="mb-2 flex gap-1">
            <button type="button" role="tab" aria-selected={railTab === "slides" ? "true" : "false"} onClick={() => setRailTab("slides")} className={shellTab(railTab === "slides") + " flex-1"}>Slides</button>
            <button type="button" role="tab" aria-selected={railTab === "layers" ? "true" : "false"} onClick={() => setRailTab("layers")} className={shellTab(railTab === "layers") + " flex-1"}>Layers</button>
          </div>
        )}
        {editOn && railTab === "layers" ? (
          <LayersPanel
            diagnostics={!embedded}
            slide={(editedScenes ?? deck.scenes)[snap?.slideIndex ?? 0] ?? null}
            selectedIds={snap?.selectedIds ?? []}
            topCount={(editedScenes ?? deck.scenes)[snap?.slideIndex ?? 0]?.elements.length ?? 0}
            onSelect={(id) => api?.select(id)}
            onToggle={(id) => api?.toggle(id)}
            onRange={(id) => {
              const v = viewerRef.current;
              if (!v?.api) return;
              const rows = [...(asideRef.current?.querySelectorAll("[data-layer]") ?? [])].map((n) => n.getAttribute("data-layer"));
              const anchor = [...(snap?.selectedIds ?? [])].reverse().find((x) => rows.includes(x)) ?? rows[0];
              if (!anchor) return;
              const lo = Math.min(rows.indexOf(anchor), rows.indexOf(id));
              const hi = Math.max(rows.indexOf(anchor), rows.indexOf(id));
              if (lo >= 0) v.api.selectMany(rows.slice(lo, hi + 1));
            }}
            onReorder={(id, delta) => {
              const a = adapterRef.current;
              if (!a) return;
              const slide = (docRef.current?.snapshot().scenes ?? [])[snap?.slideIndex ?? -1];
              if (!slide) return;
              const order = slide.elements.map((e) => e.id);
              const from = order.indexOf(id);
              if (from < 0) return;
              a.reorderElement(id, Math.max(0, Math.min(order.length - 1, from + delta)));
            }}
            onLock={(id, locked) => adapterRef.current?.setElementLocked(id, locked)}
            onHide={(id, hidden) => adapterRef.current?.setElementHidden(id, hidden)}
          />
        ) : (
        <>
        {editOn && (
          <div className="relative mb-2">
            <button
              type="button"
              onClick={() => { setChooserOpen((v) => !v); setMenuFor(null); }}
              title="Add a slide: blank, layout, or duplicate"
              aria-expanded={chooserOpen ? "true" : "false"}
              data-new-slide
              className="block w-full rounded-md border border-dashed border-line py-1 text-fg-muted transition hover:bg-hover hover:text-fg"
            >
              + Slide ▾
            </button>
            {chooserOpen && (
              <div
                data-new-slide-chooser
                className="absolute inset-x-0 top-full z-[12] mt-1 flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-[12px] shadow-[var(--shadow-float)]"
              >
                <button type="button" data-new-slide-blank onClick={async () => { setChooserOpen(false); await doInsertSlide(); }} className="rounded-md px-2 py-1 text-left text-fg-muted transition hover:bg-hover hover:text-fg">Blank slide</button>
                <span className="text-[11px] text-fg-faint">An empty slide in the current theme</span>
                <button type="button" data-new-slide-layout onClick={() => { setChooserOpen(false); setGalleryOpen(true); }} className="rounded-md px-2 py-1 text-left text-fg-muted transition hover:bg-hover hover:text-fg">Choose layout…</button>
                <span className="text-[11px] text-fg-faint">Insert an editable skeleton from the gallery</span>
                <button type="button" data-new-slide-duplicate onClick={doDuplicateActive} className="rounded-md px-2 py-1 text-left text-fg-muted transition hover:bg-hover hover:text-fg">Duplicate current slide</button>
              </div>
            )}
          </div>
        )}
        {editOn && effSlideSel.length > 1 && (
          <div data-bulk-bar className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-fg-muted">{effSlideSel.length} selected</span>
            <button type="button" title="Duplicate every selected slide in order" onClick={() => doDuplicateSlides(effSlideSel)} className={shellBtn}>Duplicate</button>
            {confirmBulk ? (
              <>
                <span>Delete {effSlideSel.length} slides?</span>
                <button type="button" onClick={() => doDeleteSlides(effSlideSel)} className={shellBtn}>Confirm</button>
                <button type="button" onClick={() => setConfirmBulk(false)} className={shellBtn}>Keep</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmBulk(true)} className={shellBtn}>Delete…</button>
            )}
            <button type="button" onClick={() => { const a = api?.snapshot().slideId ?? null; setSlideSel(a ? [a] : []); setConfirmBulk(false); }} className={shellBtn}>Clear</button>
          </div>
        )}
        <div className="grid gap-2">
          {shownScenes.map((s, i) => (
            <Thumb
              key={s.id}
              scene={s}
              displayLabel={embedded ? `Slide ${i + 1}` : undefined}
              active={i === snap?.slideIndex}
              selected={editOn && effSlideSel.includes(s.id)}
              onPick={(e) => thumbPick(e, s.id, i)}
              onMenu={editOn ? () => { setMenuFor((m) => (m === s.id ? null : s.id)); setConfirmDelete(null); } : undefined}
              onDragStart={editOn ? (e) => { dragRef.current = s.id; setMenuFor(null); try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); } catch { /* drag still tracks locally */ } } : undefined}
              onDragOver={editOn ? (e) => {
                if (!dragRef.current || dragRef.current === s.id) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                showDropMarker(s.id, (e.clientY - r.top) < r.height / 2 ? "before" : "after");
              } : undefined}
              onDrop={editOn ? (e) => {
                e.preventDefault();
                if (!dragRef.current) return;
                const marker = asideRef.current?.querySelector("[data-drop-marker]");
                const pos = marker?.dataset.dropMarker === "after" ? "after" : "before";
                const order = (docRef.current?.snapshot().scenes ?? []).map((x) => x.id).filter((id) => id !== dragRef.current);
                const at = order.indexOf(s.id) + (pos === "after" ? 1 : 0);
                doReorderSlide(dragRef.current, Math.max(0, at));
                dragRef.current = null;
                clearDropMarker();
              } : undefined}
              onDragEnd={editOn ? () => { dragRef.current = null; clearDropMarker(); } : undefined}
              onMoveKey={editOn ? (e) => {
                if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                e.preventDefault();
                const order = (docRef.current?.snapshot().scenes ?? []).map((x) => x.id);
                const from = order.indexOf(s.id);
                if (from < 0) return;
                doReorderSlide(s.id, e.key === "ArrowUp" ? Math.max(0, from - 1) : Math.min(order.length - 1, from + 1));
              } : undefined}
              menu={menuFor === s.id ? (
                <SlideMenu
                  scene={s}
                  isLast={shownScenes.length <= 1}
                  confirming={confirmDelete === s.id}
                  onDuplicate={() => doDuplicateSlides([s.id])}
                  onDelete={() => setConfirmDelete(s.id)}
                  onConfirmDelete={() => doDeleteSlides([s.id])}
                  onCancelDelete={() => setConfirmDelete(null)}
                  onDetach={() => doDetachSlide(s.id)}
                  onClose={() => { setMenuFor(null); setConfirmDelete(null); }}
                />
              ) : null}
            />
          ))}
        </div>
        </>
        )}
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col bg-sunken">
        <div data-toolbar className="flex flex-none items-center gap-1.5 overflow-x-auto overflow-y-hidden border-b border-line bg-panel px-3 py-1.5 text-[12px] [&>*]:flex-none [&>*]:whitespace-nowrap">
          {!embedded && <select data-developer-controls aria-label="Deck" value={liveDeck ? liveDeck.name : deckName} onChange={(e) => pickFixture(e.target.value)} className="rounded-md border border-line bg-field px-1.5 py-1 text-[12px] text-fg">
            {DECKS.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.theme}, {d.variant})</option>)}
            {liveDeck && <option value={liveDeck.name}>{liveDeck.name} (live)</option>}
          </select>}
          <button type="button" onClick={() => api && guardedNav(() => api.prev())} className={shellBtn}>← Prev</button>
          <button type="button" onClick={() => api && guardedNav(() => api.next())} className={shellBtn}>Next →</button>
          <button type="button" onClick={() => api?.zoomOut()} aria-label="Zoom out" className={shellBtn}>−</button>
          <span aria-live="polite" className="min-w-[56px] text-center">{Math.round((snap?.zoom ?? 1) * 100)}%</span>
          <button type="button" onClick={() => api?.zoomIn()} aria-label="Zoom in" className={shellBtn}>+</button>
          <button type="button" onClick={() => api?.resetZoom()} className={shellBtn}>Fit</button>
          {!embedded && <button data-developer-controls type="button" onClick={() => setLiveOpen((v) => !v)} aria-expanded={liveOpen} className={shellBtn}>Live</button>}
          {!embedded && <button data-developer-controls type="button" onClick={() => { refreshProjectList(); setProjectsOpen(true); }} aria-expanded={projectsOpen} className={shellBtn}>Projects</button>}
          <button
            type="button"
            title={editOn ? "Leave edit mode (unsaved edits stay visible until you switch decks)" : "Edit this deck: drag, nudge, delete with undo"}
            onClick={() => (editOn ? exitEdit() : enterEdit())}
            className={shellBtn}
          >
            {editStatus.preparing ? "Preparing…" : editOn ? "Done" : "Edit"}
          </button>
          {editOn && (
            <>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add an editable text box at the slide center"} onClick={() => adapterRef.current?.addTextElement()} className={shellBtn}>+ Text</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add a rectangle"} onClick={() => adapterRef.current?.addShapeElement("rect")} className={shellBtn}>+ Rect</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add a rounded rectangle"} onClick={() => adapterRef.current?.addShapeElement("roundRect")} className={shellBtn}>+ Round</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add an ellipse"} onClick={() => adapterRef.current?.addShapeElement("ellipse")} className={shellBtn}>+ Ellipse</button>
            </>
          )}
          {editOn && textState.editing && (
            <span className="inline-flex items-center gap-1.5 text-[12px]">
              <span className="text-fg-muted">editing text… Ctrl+Enter commits, Esc cancels</span>
              {textState.paragraphs > 1 && (
                <span className="text-fg-faint">{textState.paragraphs} paragraphs · each keeps its own style</span>
              )}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const a = adapterRef.current; if (a?.editingId?.()) a.commitTextEdit(); }} className={shellBtn}>Commit</button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => adapterRef.current?.cancelTextEdit()} className={shellBtn}>Cancel</button>
            </span>
          )}
          <span data-developer-diagnostics={!embedded ? "true" : undefined} className="ml-auto text-[12px] text-fg-faint">
            {embedded ? `Slide ${(snap?.slideIndex ?? 0) + 1} of ${shownScenes.length}` : snap?.slideId ?? ""}{(snap?.selectedIds?.length ?? 0) > 0 ? ` · ${snap.selectedIds.length} selected` : ""}
            {!embedded && liveSnap.status === "loading" ? " · compiling…" : ""}
            {!embedded && editOn ? ` · editing rev ${editStatus.rev}` : ""}
            {editedScenes && !editOn ? embedded ? ` · ${readOnlyStatus}` : " · unsaved edits (read-only)" : ""}
            {(() => {
              const st = (editedScenes ?? deck.scenes)[snap?.slideIndex ?? -1]?.layoutState;
              return st === "detached" ? " · Manual slide" : st === "customized" ? " · Custom slide" : "";
            })()}
          </span>
        </div>
        {editStatus.error && (
          <div role="alert" data-edit-error className="flex-none border-b border-line bg-raised px-3 py-1.5 text-[12px] text-danger">
            Edit failed: {editStatus.error}
          </div>
        )}
        {project?.recoverable && !projectsOpen && (
          <div role="status" data-recover-banner className="flex-none border-b border-line bg-raised px-3 py-1.5 text-[12px]">
            Last project “{project.title}” is saved on this machine.{" "}
            <button type="button" onClick={() => openProject(project.id)} className={shellBtn}>Reopen it</button>{" "}
            <button type="button" onClick={() => { setProject((p) => (p ? { ...p, recoverable: false } : p)); }} className={shellBtn}>Dismiss</button>
          </div>
        )}
        {(saveState === "stale" || saveState === "error" || saveState === "unavailable") && saveError && (
          <div role="alert" data-save-error className="flex-none border-b border-line bg-raised px-3 py-1.5 text-[12px] text-amber">
            {saveState === "stale" ? `Save conflict: ${saveError} Your edits are intact — reload the newer version or save as a new project.` : `Save failed: ${saveError} Your edits are intact.`}{" "}
            {saveState === "stale" && (
              <>
                <button type="button" onClick={() => openProject(project.id)} className={shellBtn}>Load newer version</button>{" "}
                <button type="button" onClick={saveAsNewProject} className={shellBtn}>Save as new project</button>{" "}
              </>
            )}
            <button type="button" onClick={() => saveNow()} className={shellBtn}>Retry save</button>
          </div>
        )}
        {pendingSwitchId && (
          <div role="alert" data-switch-guard className="flex-none border-b border-line bg-raised px-3 py-1.5 text-[12px]">
            You have unsaved changes. Switching projects without saving loses them.{" "}
            <button type="button" onClick={async () => { const target = pendingSwitchRef.current; const result = await saveNow(); if (target && pendingSwitchRef.current === target && result.ok && !leaveGuardNeeded()) openProject(target.id); }} className={shellBtn}>Save & switch</button>{" "}
            <button type="button" onClick={() => { const id = pendingSwitchId; pendingSwitchRef.current = null; setPendingSwitchId(null); discardDocument(); openProject(id); }} className={shellBtn}>Discard & switch</button>{" "}
            <button type="button" onClick={() => { pendingSwitchRef.current = null; setPendingSwitchId(null); }} className={shellBtn}>Cancel</button>
          </div>
        )}
        {textState.conflict && (
          <div role="alert" data-text-conflict className="flex-none border-b border-line bg-raised px-3 py-1.5 text-[12px] text-amber">
            {textState.conflict}{" "}
            <button type="button" onClick={() => adapterRef.current?.commitTextEdit({ force: true })} className={shellBtn}>Overwrite with my draft</button>{" "}
            <button type="button" onClick={() => adapterRef.current?.cancelTextEdit()} className={shellBtn}>Discard draft</button>
          </div>
        )}
        {textState.overflow && (
          <div role="status" data-text-overflow className="flex-none border-b border-line bg-raised px-3 py-1.5 text-[12px] text-amber">
            {textState.overflow}
          </div>
        )}
        {textState.editing && (
          <div data-text-editing={textState.elementId ?? "true"} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }} />
        )}
        {!embedded && liveOpen && (
          <div
            data-live-panel
            aria-label="Live compilation"
            className="flex flex-none flex-wrap items-center gap-2 border-b border-line bg-raised px-3 py-1.5 text-[12px]"
          >
            <select
              aria-label="Live example"
              value={liveForm.example}
              className="rounded-md border border-line bg-field px-1.5 py-1 text-[12px] text-fg"
              onChange={(e) => {
                const ex = liveCatalog.examples.find((x) => x.id === e.target.value);
                setLiveForm((f) => ({ ...f, example: e.target.value, theme: ex?.theme ?? f.theme, variant: ex?.variant ?? f.variant }));
              }}
            >
              {liveCatalog.examples.length === 0 && <option value="">(no examples — is the API running?)</option>}
              {liveCatalog.examples.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <select aria-label="Live theme" value={liveForm.theme} onChange={(e) => setLiveForm((f) => ({ ...f, theme: e.target.value }))} className="rounded-md border border-line bg-field px-1.5 py-1 text-[12px] text-fg">
              {liveCatalog.themes.map((t) => <option key={t} value={t}>{t}</option>)}
              {liveForm.theme && !liveCatalog.themes.includes(liveForm.theme) && <option value={liveForm.theme}>{liveForm.theme}</option>}
            </select>
            <select aria-label="Live variant" value={liveForm.variant} onChange={(e) => setLiveForm((f) => ({ ...f, variant: e.target.value }))} className="rounded-md border border-line bg-field px-1.5 py-1 text-[12px] text-fg">
              <option value="plain">plain</option>
              <option value="chromed">chromed</option>
            </select>
            <button
              type="button"
              disabled={liveSnap.status === "loading" || !liveForm.example}
              className={`${shellBtn} disabled:opacity-40`}
              onClick={() => {
                const ex = liveCatalog.examples.find((x) => x.id === liveForm.example);
                if (!ex?.intent) return;
                loaderRef.current.load({ intent: ex.intent, theme: liveForm.theme, variant: liveForm.variant });
              }}
            >
              {liveSnap.status === "loading" ? "Compiling…" : "Compile live"}
            </button>
            <span aria-live="polite" role={liveSnap.status === "error" ? "alert" : undefined} className="text-fg-muted">
              {liveSnap.status === "error" ? `Error: ${liveSnap.error}` : liveDeck ? `Live: ${liveDeck.name}` : ""}
            </span>
          </div>
        )}
        <div
          ref={scrollRef}
          data-scroll-container
          style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "flex-start", padding: 24 }}
        >
          {/* Zoom-pan spacer: the layout footprint tracks the scaled
          slide, so zoomed slides scroll instead of overflowing
          paint-only. Scene coordinates are untouched — the mount
          keeps SVG px and top-left origin, and overlay boxes ride
          the same transform. margin auto centers at fit. */}
          <div style={{ width: slideW * scale, height: slideH * scale, flexShrink: 0, margin: "0 auto" }}>
            <div
              ref={mountRef}
              tabIndex={0}
              role="application"
              aria-label={embedded ? `Slide ${(snap?.slideIndex ?? 0) + 1} of ${shownScenes.length}` : `Slide ${snap?.slideId ?? ""}`}
              style={{
                width: slideW, height: slideH, flexShrink: 0,
                transform: `scale(${scale})`, transformOrigin: "top left",
                background: "#fff", borderRadius: 4, overflow: "hidden",
                outline: "none",
              }}
            />
          </div>
        </div>
        {/* Selection rings render as overlay boxes from scene-dom
        (data-overlay); the state attribute below is the DOM contract
        tests assert, not a visual. */}
        {/* Toolbar items never shrink (shrinking wraps button text
        and grows the row, moving the stage): the row scrolls
        horizontally instead, at a constant height. */}
        <style>{`aside[aria-label="Slides"] svg { width: 100% !important; height: auto !important; display: block; } [data-gallery] svg { width: 100% !important; height: auto !important; display: block; } [data-toolbar] > * { flex-shrink: 0; white-space: nowrap; } [data-present-slide] svg { width: 100% !important; height: auto !important; display: block; }`}</style>
      </main>
      {/* Right rail: fixed width, so swapping contextual panels on
          selection never moves the stage. Inspector tab holds the
          selection readout, the contextual format panel (same
          components and commit paths as the old bottom dock), and
          slide properties when nothing is selected. The Assistant
          tab is a reserved, honest placeholder. */}
      <aside
        ref={rightRailRef} aria-label={narrow && rightOpen ? "Editor side panel" : "Inspector"} role={narrow && rightOpen ? "dialog" : undefined} aria-modal={narrow && rightOpen ? true : undefined} tabIndex={-1}
        className={`min-h-0 flex-none flex-col overflow-hidden border-line bg-panel ${rightOpen ? "flex" : "hidden"} ${narrow ? "absolute inset-y-0 right-0 z-40 w-72 border-l shadow-[var(--shadow-float)]" : "relative w-72 border-l"}`}
      >
        <div role="tablist" aria-label="Right rail" className="flex flex-none gap-1 border-b border-line p-2">
          <button type="button" id="right-tab-inspector" aria-controls="right-panel-inspector" tabIndex={rightTab === "inspector" ? 0 : -1} onKeyDown={rightTabKey} role="tab" aria-selected={rightTab === "inspector" ? "true" : "false"} onClick={() => chooseRightTab("inspector")} className={shellTab(rightTab === "inspector") + " flex-1"}>Inspector</button>
          <button type="button" id="right-tab-assistant" aria-controls="right-panel-assistant" tabIndex={rightTab === "assistant" ? 0 : -1} onKeyDown={rightTabKey} role="tab" aria-selected={rightTab === "assistant" ? "true" : "false"} onClick={() => chooseRightTab("assistant")} className={shellTab(rightTab === "assistant") + " flex-1"}>Assistant</button>
        </div>
        <div id="right-panel-assistant" role="tabpanel" aria-labelledby="right-tab-assistant" hidden={rightTab !== "assistant"} style={{ display: rightTab === "assistant" ? "flex" : "none" }} className="min-h-0 flex-1 flex-col overflow-hidden p-3">
          {embedded && project && !project.recoverable ? (
            <AssistantPanel projectId={project.id} active={rightOpen && rightTab === "assistant"} writable={editOn} blockReason={gridPending ? "pending-data" : titleDraft !== null || titleRequestRef.current ? "pending-title" : null}
              intent={assistantIntent} preview={assistantPreview} bridge={assistantBridge} register={registerAssistant}
              onInspector={() => chooseRightTab("inspector")} onHistory={() => openHistory(projectRef.current)} />
          ) : (
            <div data-assistant-panel className="flex flex-col gap-2 text-[13px]">
              <strong className="text-[14px]">Assistant</strong>
              <p className="text-fg-muted">AI slide editing is not available in this workspace yet.</p>
              <p className="text-fg-faint text-[12.5px]">
                When it lands, it will operate through the same revisioned command engine
                and project permissions as manual edits — one authoritative document,
                optimistic conflicts, and an audit trail. Nothing here edits slides today.
              </p>
            </div>
          )}
        </div>
        <div id="right-panel-inspector" role="tabpanel" aria-labelledby="right-tab-inspector" hidden={rightTab !== "inspector"} style={{ display: rightTab === "inspector" ? "block" : "none" }} className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-3">
              <div data-inspector-wrap>
                {inspected.length > 0 ? (
                  <div data-inspector data-developer-diagnostics={!embedded ? "true" : undefined} aria-label="Selection inspector" className={`max-h-24 overflow-y-auto text-fg-muted ${embedded ? "text-[12.5px]" : "font-mono text-[11px]"}`}>
                    {inspected.map((r) => (
                      <div key={r.id} data-inspected={r.id}>
                        {embedded ? `${r.kind[0].toUpperCase()}${r.kind.slice(1)}${r.locked ? " · locked" : ""}` : <>{r.id} · {r.kind} · {r.w}×{r.h} @ {r.x},{r.y}{r.locked ? " · locked" : ""}{r.semanticRef ? ` · ref ${r.semanticRef}` : ""} · {r.provenance ?? "scene"}</>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[12px] text-fg-faint">Nothing selected. Click the slide to select an object, or double-click text to edit it.</div>
                )}
              </div>
              {styledShape && (
                <StylePanel
                  key={`${snap.slideId}:${styledShape.id}:${editStatus.rev}`}
                  element={styledShape}
                  diagnostics={!embedded}
                  onCommit={(patch) => adapterRef.current?.setElementStyle(styledShape.id, patch)}
                />
              )}
              {formattedText && (
                <TextFormatPanel
                  key={`${snap.slideId}:${formattedText.id}:${editStatus.rev}`}
                  element={formattedText}
                  diagnostics={!embedded}
                  onCommit={(i, patch) => adapterRef.current?.setTextStyle(formattedText.id, i, patch)}
                />
              )}
              {chartTarget && (
                <ChartDataPanel
                  key={`${snap.slideId}:${chartTarget.id}:${editStatus.rev}`}
                  element={chartTarget}
                  diagnostics={!embedded}
                  onDraftChange={reportGridDraft}
                  onCommit={(payload) => adapterRef.current?.setChartData(chartTarget.id, payload)}
                />
              )}
              {tableTarget && (
                <TableDataPanel
                  key={`${snap.slideId}:${tableTarget.id}:${editStatus.rev}`}
                  element={tableTarget}
                  diagnostics={!embedded}
                  onDraftChange={reportGridDraft}
                  onCommit={(rows) => adapterRef.current?.setTableData(tableTarget.id, rows)}
                />
              )}
              {!hasFormatTarget && currentSlide && (
                <div data-slide-props className="flex flex-col gap-1 border-t border-line pt-2 text-[12.5px] text-fg-muted">
                  <div><span className="text-fg-faint">Slide </span><span>{embedded ? `${(snap?.slideIndex ?? 0) + 1} of ${shownScenes.length}` : currentSlide.id}</span></div>
                  <div><span className="text-fg-faint">Layout </span>{currentSlide.layoutState === "detached" ? "Manual slide" : currentSlide.layoutState === "customized" ? "Custom slide" : "Managed by AI layout"}</div>
                  <div><span className="text-fg-faint">Objects </span>{slideProps.elements}{slideProps.hidden > 0 ? ` (${slideProps.hidden} hidden)` : ""}{slideProps.locked > 0 ? ` (${slideProps.locked} locked)` : ""}</div>
                  {!editOn && <div className="text-fg-faint">Read-only — press Edit in the toolbar to change this slide.</div>}
                </div>
              )}
            </div>
        </div>
      </aside>
      </div>
      {presenting != null && shownScenes[presenting] && (
        <div
          data-present
          role="dialog"
          aria-label={`Presenting slide ${presenting + 1} of ${shownScenes.length}`}
          tabIndex={0}
          ref={(el) => { if (el) el.focus({ preventScroll: true }); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPresenting(null);
            else if (e.key === "ArrowRight" || e.key === "PageDown") setPresenting((i) => Math.min(shownScenes.length - 1, (i ?? 0) + 1));
            else if (e.key === "ArrowLeft" || e.key === "PageUp") setPresenting((i) => Math.max(0, (i ?? 0) - 1));
            else if (e.key === "Home") setPresenting(0);
            else if (e.key === "End") setPresenting(shownScenes.length - 1);
          }}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/90 p-6"
        >
          <div data-present-slide className="w-[min(1100px,92vw)] overflow-hidden rounded bg-white" dangerouslySetInnerHTML={{ __html: sceneToSvg(shownScenes[presenting], { wrapText: true }) }} />
          <div className="flex items-center gap-2 text-[13px] text-white">
            <button type="button" aria-label="Previous slide" onClick={() => setPresenting((i) => Math.max(0, (i ?? 0) - 1))} className="rounded-md border border-white/30 px-2 py-1">← Prev</button>
            <span aria-live="polite" data-present-count>{presenting + 1} / {shownScenes.length}</span>
            <button type="button" aria-label="Next slide" onClick={() => setPresenting((i) => Math.min(shownScenes.length - 1, (i ?? 0) + 1))} className="rounded-md border border-white/30 px-2 py-1">Next →</button>
            <button type="button" aria-label="Exit presentation" onClick={() => setPresenting(null)} className="rounded-md border border-white/30 px-2 py-1">Exit (Esc)</button>
          </div>
        </div>
      )}
      {assistantReload && <ConfirmModal title="Load saved Assistant changes?" body="Discard the current unsaved presentation edits and load the saved version? Session undo will be cleared. You can cancel and use Save as a new project to keep a copy first." confirmLabel="Discard edits & load" busy={assistantReloadBusy}
        onCancel={() => setAssistantReload(null)} onConfirm={async () => {
          const request = assistantReload;
          if (docRef.current !== request.doc || request.doc.snapshot().revision !== request.revision) { setAssistantReload(null); return; }
          setAssistantReloadBusy(true); autosaveRef.current?.cancel();
          try { await syncAssistantSaved(request.options, true); } finally { setAssistantReloadBusy(false); setAssistantReload(null); }
        }} />}
      {pendingLeave && (
        <div role="alert" data-leave-guard className="flex-none border-b border-line bg-raised px-3 py-1.5 text-[12px]">
          You have unsaved changes. Leaving for {pendingLeave.label} without saving loses them. {assistantRef.current?.hasDraft() ? "Your unsent Assistant message will also be discarded if you leave." : ""}{" "}
          {projectRef.current && <button type="button" data-leave-save onClick={() => leaveWithChoice("save")} className={shellBtn}>{assistantRef.current?.hasDraft() ? "Save presentation, discard message & leave" : "Save & leave"}</button>}{" "}
          <button type="button" data-leave-discard onClick={() => leaveWithChoice("discard")} className={shellBtn}>{assistantRef.current?.hasDraft() ? "Discard edits and message & leave" : "Discard & leave"}</button>{" "}
          <button type="button" onClick={cancelLeave} className={shellBtn}>Cancel</button>
        </div>
      )}
      {galleryOpen && editOn && (
        <LayoutGallery
          sibling={(editedScenes ?? deck.scenes)[snap?.slideIndex ?? 0] ?? null}
          onInsert={doInsertLayout}
          onClose={() => setGalleryOpen(false)}
        />
      )}
      {!embedded && projectsOpen && (
        <div
          data-projects-panel
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3"
          onClick={(e) => { if (e.target === e.currentTarget) setProjectsOpen(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setProjectsOpen(false); } }}
        >
          <div role="dialog" aria-label="Saved projects" className="flex max-h-[86vh] w-[min(560px,94vw)] flex-col overflow-hidden rounded-card border border-line bg-panel text-fg shadow-[var(--shadow-float)]">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <strong className="text-[13px]">Saved projects</strong>
              <span data-projects-count className="text-[11px] text-fg-faint">{projectList.length} stored</span>
              <button type="button" aria-label="Close projects" onClick={() => setProjectsOpen(false)} className={`${shellBtn} ml-auto`}>✕</button>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2">
              <button type="button" data-project-save-current disabled={!editOn} title={editOn ? "Save the current deck as a new project" : "Enter edit mode first"} onClick={saveAsNewProject} className={`${shellBtn} disabled:opacity-40`}>Save current deck as project</button>
              {project && !project.recoverable && (
                <ProjectExportButton data-project-export projectId={project.id} title={project.title} className="rounded-md px-2 py-1 text-[12px] text-accent transition hover:bg-hover">Export {project.title} (.pptx)</ProjectExportButton>
              )}
            </div>
            <div data-project-list className="flex flex-col gap-2 overflow-y-auto p-3">
              {projectListError && <span role="alert" className="text-[12px] text-danger">Could not list projects: {projectListError} — editing continues, nothing is saved.</span>}
              {projectList.length === 0 && !projectListError && <span className="text-[12px] text-fg-faint">No saved projects yet. Edit a deck, then “Save current deck as project”.</span>}
              {projectList.map((p) => (
                <div key={p.id} data-project-row={p.id} className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${project?.id === p.id ? "border-accent" : "border-line"}`}>
                  {renamingId === p.id ? (
                    <>
                      <input aria-label={`Rename ${p.id}`} value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} className="min-w-[120px] flex-1 rounded border border-line bg-field px-1.5 py-1 text-[12px] text-fg" />
                      <button type="button" onClick={async () => {
                        // The rename carries the durable revision this
                        // client based it on — the same contract as
                        // saves. The bound project's revision wins over
                        // the possibly-older list row.
                        const base = project?.id === p.id ? project.revision : p.revision;
                        try {
                          const u = await apiRename(p.id, { title: renameDraft, baseRevision: base });
                          setProjectList((l) => l.map((x) => (x.id === p.id ? { ...x, title: u.title, revision: u.revision } : x)));
                          if (project?.id === p.id) {
                            // Metadata only: scenes, engine history, and
                            // the dirty/saved bookkeeping stand — a
                            // rename never marks scene edits saved.
                            projectRef.current = { ...project, title: u.title, revision: u.revision, updatedAt: u.updatedAt };
                            setProject(projectRef.current);
                          }
                          setRenameConflict(null);
                          setRenamingId(null);
                        } catch (err) {
                          if (err?.code === "stale-revision") {
                            // Keep the draft open with the attempted
                            // title intact for copy-out or retry; never
                            // overwrite the newer title, never auto-retry.
                            setRenameConflict({ id: p.id, message: err.message, expected: err.expectedRevision ?? null });
                          } else {
                            setProjectListError(err.message);
                          }
                        }
                      }} className={shellBtn}>Apply</button>
                      <button type="button" onClick={() => { setRenamingId(null); setRenameConflict(null); }} className={shellBtn}>Cancel</button>
                      {renameConflict?.id === p.id && (
                        <span role="alert" data-rename-conflict={p.id} className="basis-full text-[11px] text-amber">
                          Rename conflict: {renameConflict.message} Your “{renameDraft}” draft is kept.{" "}
                          <button type="button" onClick={async () => { setRenameConflict(null); await refreshProjectList(); }} className={shellBtn}>Reload list</button>
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="min-w-[140px] flex-1 text-[12px]"><strong>{p.title}</strong> <span className="text-fg-faint">· {p.slideCount} slides · rev {p.revision}</span></span>
                      <button type="button" data-project-open={p.id} onClick={() => openProject(p.id)} className={shellBtn}>Open</button>
                      <button type="button" data-project-history={p.id} onClick={() => openHistory(p)} className={shellBtn}>History</button>
                      <button type="button" onClick={() => { setRenamingId(p.id); setRenameDraft(p.title); }} className={shellBtn}>Rename</button>
                      {confirmRemoveId === p.id ? (
                        <>
                          <span className="text-[11px]">Delete “{p.title}”? This cannot be undone.</span>
                          <button type="button" data-project-delete-confirm={p.id} onClick={async () => { try { await apiRemove(p.id); setProjectList((l) => l.filter((x) => x.id !== p.id)); if (project?.id === p.id) { projectRef.current = null; setProject(null); setSaveState("idle"); writeLastProject(null); if (embedded && onProjectDeleted) onProjectDeleted(p.id); } setConfirmRemoveId(null); } catch (err) { setProjectListError(err.message); } }} className={shellBtn}>Confirm delete</button>
                          <button type="button" onClick={() => setConfirmRemoveId(null)} className={shellBtn}>Keep</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmRemoveId(p.id)} className={shellBtn}>Delete…</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {historyFor && (
        <div
          data-history-panel
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3"
          onClick={(e) => { if (e.target === e.currentTarget) setHistoryFor(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setHistoryFor(null); } }}
        >
          <div role="dialog" aria-label={`Version history for ${historyFor.title}`} className="flex max-h-[86vh] w-[min(620px,94vw)] flex-col overflow-hidden rounded-card border border-line bg-panel text-fg shadow-[var(--shadow-float)]">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <strong className="text-[13px]">Version history — {historyFor.title}</strong>
              <button type="button" aria-label="Close version history" onClick={() => setHistoryFor(null)} className={`${shellBtn} ml-auto`}>✕</button>
            </div>
            <div className="border-b border-line px-3 py-1.5 text-[11px] text-fg-faint">
              Restoring creates a <em>new</em> saved revision from the older content — history is never rewritten. Undo history is cleared by a restore.
              {historyMeta && ` Keeps the last ${historyMeta.retention.maxRecoverable} saved versions with full content; older versions keep their descriptions only.`}
            </div>
            <div data-history-list className="flex max-h-[30vh] flex-col gap-1.5 overflow-y-auto p-3">
              {historyLoading && <span className="text-[12px] text-fg-faint">Loading versions…</span>}
              {historyError && <span role="alert" className="text-[12px] text-danger">Could not load history: {historyError}</span>}
              {!historyLoading && !historyError && historyList.length === 0 && <span className="text-[12px] text-fg-faint">No saved versions yet.</span>}
              {historyList.map((m) => (
                <div key={m.revision} data-history-row={m.revision} className={`flex flex-wrap items-center gap-2 rounded-md border p-1.5 text-[12px] ${selectedRev === m.revision ? "border-accent" : "border-line"}`}>
                  <span className="min-w-[46px]"><strong>rev {m.revision}</strong>{historyMeta && m.revision === historyMeta.currentRevision && <span className="text-fg-faint"> (current)</span>}</span>
                  <span className="text-fg-muted">{historyKindLabel(m)}</span>
                  <span className="text-fg-faint">{(() => { try { return new Date(m.createdAt).toLocaleString(); } catch { return m.createdAt; } })()}</span>
                  <span className="basis-full text-fg-faint">{m.summary}</span>
                  {!m.recoverable && <span className="text-[11px] text-fg-faint">compacted — description only, cannot restore</span>}
                  {m.recoverable && <button type="button" data-history-select={m.revision} onClick={() => selectHistoryRevision(m.revision)} className={shellBtn}>Preview</button>}
                </div>
              ))}
            </div>
            {selectedRev !== null && selectedRev !== undefined && (
              <div data-history-preview className="border-t border-line px-3 py-2 text-[12px]">
                {selectedLoading && <span className="text-fg-faint">Loading rev {selectedRev}…</span>}
                {!selectedLoading && selectedDoc && (
                  <>
                    <div><strong>rev {selectedRev}</strong> · {selectedDoc.scenes.length} slides · saved {(() => { try { return new Date(selectedMeta?.createdAt ?? selectedDoc.updatedAt).toLocaleString(); } catch { return selectedDoc.updatedAt; } })()}</div>
                    <div className="text-fg-muted">{selectedMeta?.summary}</div>
                    <ol className="my-1.5 max-h-[16vh] overflow-y-auto pl-5">
                      {selectedDoc.scenes.slice(0, 12).map((s, i) => <li key={s.id}>{sceneHeadline(s, i)}</li>)}
                    </ol>
                    {selectedDoc.scenes.length > 12 && <div className="text-fg-faint">…and {selectedDoc.scenes.length - 12} more slides</div>}
                    {!restoreConfirm && (
                      <button type="button" data-history-restore={selectedRev} disabled={restoreBusy || (historyMeta && selectedRev === historyMeta.currentRevision)} title={historyMeta && selectedRev === historyMeta.currentRevision ? "This is already the current version" : "Restore this version as a new saved revision"} onClick={() => doRestore()} className={`${shellBtn} mt-1 disabled:opacity-40`}>
                        {restoreBusy ? "Restoring…" : `Restore rev ${selectedRev} as a new revision`}
                      </button>
                    )}
                  </>
                )}
                {!selectedLoading && !selectedDoc && selectedMeta && !selectedMeta.recoverable && (
                  <span className="text-fg-faint">rev {selectedRev} is compacted to its description and cannot be restored.</span>
                )}
              </div>
            )}
            {restoreConfirm && (
              <div role="alert" data-restore-confirm className="border-t border-line bg-raised px-3 py-2 text-[12px]">
                You have unsaved changes. Restoring rev {selectedRev} will replace the current editor content with a new saved revision.
                Unsaved edits are lost unless you save them first.{" "}
                <button type="button" data-restore-save onClick={() => doRestore("save")} disabled={restoreBusy} className={shellBtn}>Save & restore</button>{" "}
                <button type="button" data-restore-discard onClick={() => doRestore("discard")} disabled={restoreBusy} className={shellBtn}>Discard & restore</button>{" "}
                <button type="button" onClick={() => setRestoreConfirm(false)} disabled={restoreBusy} className={shellBtn}>Cancel</button>
              </div>
            )}
            {restoreError && <div role="alert" data-restore-error className="px-3 py-1.5 text-[12px] text-amber">{restoreError}</div>}
            {restoreDone && <div role="status" data-restore-done className="px-3 py-1.5 text-[12px] text-success">{restoreDone}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
