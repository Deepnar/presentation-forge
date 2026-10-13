// SceneViewer — read-only V2 scene viewer. Thin React shell over
// packages/editor/scene-dom.js (the single viewer implementation;
// the headless smoke page drives the same module). React owns no
// viewer logic: it mounts one viewer per deck, mirrors snapshots,
// and forwards UI events to the viewer api. Scenes are never
// mutated here — selection is an id, geometry comes from the DOM.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createViewer } from "../../../../packages/editor/scene-dom.js";
import { flattenLayers, elementLabel, applyCollapse } from "../../../../packages/editor/scene-text.js";
import { sceneToSvg } from "../../../../packages/editor/scene-svg.js";
import { LAYOUT_CATEGORIES, listLayoutTemplates, buildLayoutScene } from "../../../../packages/editor/layout-templates.js";
import { ensureDeckFonts } from "../fonts.js";
import { createLiveDeckLoader } from "../lib/liveDeck.js";
import { apiList, apiCreate, apiLoad, apiSave, apiRename, apiRemove, readLastProject, writeLastProject, createAutosave } from "../lib/v2project.js";
import mechPlain from "../scenes/mech-warm-humanist-plain.json";
import mechChromed from "../scenes/mech-warm-humanist-chromed.json";
import sourceOfTruth from "../scenes/source-of-truth-warm-humanist-plain.json";
import decision from "../scenes/decision-warm-humanist-plain.json";

const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];

function Thumb({ scene, active, selected, onPick, onMenu, onDragStart, onDragOver, onDrop, onDragEnd, onMoveKey, menu }) {
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
        aria-label={`Slide ${scene.id}${active ? " (active)" : ""}${selected ? " (selected)" : ""}`}
        data-thumb={scene.id}
        data-thumb-selected={selected ? "true" : undefined}
        style={{
          display: "block", width: "100%", padding: 0, cursor: "pointer",
          border: active ? "2px solid #e0705a" : "1px solid #444",
          borderRadius: 6, overflow: "hidden", background: "#fff",
          outline: "none",
          boxShadow: selected && !active ? "0 0 0 2px #e0705a" : undefined,
        }}
        dangerouslySetInnerHTML={{ __html: sceneToSvg(scene, { wrapText: true }) }}
      />
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
        <span style={{ fontSize: 10, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {scene.id}
          {scene.layoutState === "detached" ? " · Manual" : scene.layoutState === "customized" ? " · Custom" : ""}
        </span>
        {onMenu && (
          <button
            type="button"
            aria-label={`Slide ${scene.id} menu`}
            data-thumb-menu={scene.id}
            onClick={(e) => { e.stopPropagation(); onMenu(); }}
            style={{ fontSize: 11, padding: "0 5px", lineHeight: 1.4, background: "transparent", border: "1px solid #555", borderRadius: 4, color: "#eee", cursor: "pointer" }}
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
  const state = scene.layoutState === "detached" ? "Manual — regeneration will not rearrange this slide"
    : scene.layoutState === "customized" ? "Customized — your edits are kept on recompile"
    : "Managed by the layout engine";
  return (
    <div
      data-slide-menu={scene.id}
      style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, marginTop: 2, background: "#242220", border: "1px solid #555", borderRadius: 6, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}
      onClick={(e) => e.stopPropagation()}
    >
      <span style={{ opacity: 0.75 }}>{state}</span>
      <button type="button" onClick={onDuplicate}>Duplicate slide</button>
      {confirming ? (
        <>
          <span>{isLast ? "This is the only slide — it cannot be deleted." : "Delete this slide? Undo restores it."}</span>
          {!isLast && <button type="button" onClick={onConfirmDelete}>Confirm delete</button>}
          <button type="button" onClick={onCancelDelete}>Keep</button>
        </>
      ) : (
        <button type="button" onClick={onDelete}>Delete…</button>
      )}
      {scene.layoutState !== "detached" && (
        <>
          <button type="button" onClick={onDetach}>Detach from AI layout</button>
          <span style={{ opacity: 0.7, fontSize: 11 }}>The current scene becomes authoritative. Undo restores. There is no reattach.</span>
        </>
      )}
      <button type="button" onClick={onClose}>Close</button>
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
function StylePanel({ element, onCommit }) {
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
      <span style={{ opacity: 0.8 }}>Style {element.id}</span>
      <label>Fill <input aria-label="Shape fill" type="color" value={/^#[0-9A-Fa-f]{6}$/.test(fill) ? fill : "#ffffff"} onChange={(e) => setFill(e.target.value)} onBlur={commit} /></label>
      <label>No stroke <input aria-label="Remove stroke" type="checkbox" checked={noStroke} onChange={(e) => setNoStroke(e.target.checked)} onBlur={commit} /></label>
      {!noStroke && (
        <label>Stroke <input aria-label="Shape stroke" type="color" value={/^#[0-9A-Fa-f]{6}$/.test(stroke) ? stroke : "#000000"} onChange={(e) => { setStroke(e.target.value); }} onBlur={commit} /></label>
      )}
      <label>Width <input aria-label="Stroke width" value={width} inputMode="decimal" style={{ width: 44 }} onChange={(e) => setWidth(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} /></label>
      <button type="button" onClick={commit}>Apply style</button>
      {error && <span role="alert" style={{ color: "#f0a090" }}>{error}</span>}
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
function TextFormatPanel({ element, onCommit }) {
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
        Text {element.id}{mixed ? " · mixed paragraph styles (per-paragraph controls)" : ""}
      </span>
      {paras.map((p, i) => (
        <TextFormatRow
          key={i}
          index={i}
          paragraph={p}
          onCommit={(draft) => commitRow(i, draft)}
        />
      ))}
      {error && <span role="alert" style={{ color: "#f0a090" }}>{error}</span>}
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
function ChartDataPanel({ element, onCommit }) {
  const chart = element.chart ?? {};
  const seed = () => ({
    kind: chart.chartKind ?? "bar",
    categories: [...(chart.categories ?? [])],
    series: (chart.series ?? []).map((s) => ({ name: s.name, values: s.values.map((v) => String(v)) })),
  });
  const [draft, setDraft] = useState(seed);
  const [error, setError] = useState(null);
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
        Chart {element.id} · {draft.series.length} series × {draft.categories.length} categories
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
      {error && <span role="alert" style={{ color: "#f0a090" }}>{error}</span>}
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
function TableDataPanel({ element, onCommit }) {
  const table = element.table ?? {};
  const seed = () => (table.rows ?? []).map((r) => [...r]);
  const [draft, setDraft] = useState(seed);
  const [error, setError] = useState(null);
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
        Table {element.id} · {draft.length} rows × {cols} columns{header ? " · row 1 is the header" : ""}
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
      {error && <span role="alert" style={{ color: "#f0a090" }}>{error}</span>}
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
function LayersPanel({ slide, selectedIds, topCount, onSelect, onToggle, onRange, onReorder, onLock, onHide }) {
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
              background: selected ? "#3a2c26" : parentSelected ? "#2c2622" : "transparent",
              border: selected ? "1px solid #e0705a" : "1px solid transparent",
              opacity: row.hidden ? 0.55 : 1,
            }}
          >
            {row.kind === "group" && (
              <button
                type="button"
                aria-label={collapsed.has(row.id) ? `Expand ${row.id}` : `Collapse ${row.id}`}
                aria-expanded={collapsed.has(row.id) ? "false" : "true"}
                onClick={() => toggleCollapse(row.id)}
                style={{ padding: "0 4px", background: "transparent", border: "none", color: "#eee", cursor: "pointer" }}
              >
                {collapsed.has(row.id) ? "▸" : "▾"}
              </button>
            )}
            <button
              type="button"
              title={row.hidden ? "Hidden — re-show to select" : parent ? `In group ${parent.id} — selects the group` : `Select ${row.id}`}
              onClick={(e) => {
                if (row.hidden) return;
                if (e.shiftKey) onRange?.(row.id);
                else if (e.ctrlKey || e.metaKey) onToggle?.(row.id);
                else onSelect?.(row.id);
              }}
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "#eee", cursor: row.hidden ? "default" : "pointer", textAlign: "left", padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {row.label}{row.locked ? " · locked" : ""}{row.hidden ? " · hidden" : ""}{parentSelected && !selected ? " · via parent" : ""}
            </button>
            {row.depth === 0 && (
              <>
                <button type="button" aria-label={`Bring ${row.id} forward`} title="Bring forward" onClick={() => onReorder?.(row.id, 1)}>↑</button>
                <button type="button" aria-label={`Send ${row.id} backward`} title="Send backward" onClick={() => onReorder?.(row.id, -1)}>↓</button>
              </>
            )}
            <button
              type="button"
              aria-label={row.locked ? `Unlock ${row.id}` : `Lock ${row.id}`}
              title={row.locked ? "Unlock" : "Lock"}
              onClick={() => onLock?.(row.id, !row.locked)}
              style={{ padding: "0 3px", background: "transparent", border: "1px solid #555", borderRadius: 3, color: "#eee", cursor: "pointer", fontSize: 10 }}
            >
              {row.locked ? "▪" : "▫"}
            </button>
            <button
              type="button"
              aria-label={row.hidden ? `Show ${row.id}` : `Hide ${row.id}`}
              title={row.hidden ? "Show" : "Hide"}
              onClick={() => onHide?.(row.id, !row.hidden)}
              style={{ padding: "0 3px", background: "transparent", border: "1px solid #555", borderRadius: 3, color: "#eee", cursor: "pointer", fontSize: 10 }}
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
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(8,8,8,0.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
    >
      <div
        role="dialog"
        aria-label="Choose a slide layout"
        style={{ background: "#1e1c1a", color: "#eee", border: "1px solid #555", borderRadius: 10, width: "min(880px, 94vw)", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #444", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>Choose layout</strong>
          <input
            data-gallery-search
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search layouts…"
            aria-label="Search layouts"
            style={{ flex: 1, minWidth: 140, background: "#111", color: "#eee", border: "1px solid #555", borderRadius: 5, padding: "4px 8px", fontSize: 12 }}
          />
          <button type="button" aria-label="Close gallery" onClick={onClose} style={{ background: "transparent", border: "1px solid #555", borderRadius: 5, color: "#eee", cursor: "pointer", padding: "3px 9px" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "8px 12px 0", flexWrap: "wrap" }}>
          {[{ id: "all", name: "All" }, ...LAYOUT_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              data-gallery-cat={c.id}
              aria-pressed={cat === c.id ? "true" : "false"}
              onClick={() => setCat(c.id)}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, cursor: "pointer", background: cat === c.id ? "#e0705a" : "transparent", color: cat === c.id ? "#111" : "#eee", border: "1px solid #666" }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div data-gallery-grid style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10, padding: 12, overflowY: "auto" }}>
          {visible.map(({ template: t, svg }) => (
            <button
              key={t.id}
              type="button"
              data-gallery-card={t.id}
              onClick={() => onInsert(t.id)}
              title={`${t.name} — ${t.useCase}`}
              style={{ textAlign: "left", background: "#262422", border: "1px solid #555", borderRadius: 8, padding: 8, cursor: "pointer", color: "#eee", display: "flex", flexDirection: "column", gap: 5 }}
            >
              <span data-gallery-preview={t.id} dangerouslySetInnerHTML={{ __html: svg }} style={{ display: "block", borderRadius: 4, overflow: "hidden", background: "#fff" }} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{t.name}</span>
              <span style={{ fontSize: 10, opacity: 0.65 }}>{catName(t.category)}</span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>{t.description}</span>
              <span style={{ fontSize: 10, opacity: 0.6, fontStyle: "italic" }}>{t.useCase}</span>
            </button>
          ))}
          {visible.length === 0 && (
            <span style={{ fontSize: 12, opacity: 0.7, padding: 12 }}>No layouts match “{query}”.</span>
          )}
        </div>
        <div style={{ padding: "8px 12px", borderTop: "1px solid #444", fontSize: 11, opacity: 0.7 }}>
          Click a layout to insert it after the current slide. Esc cancels with no change.
        </div>
      </div>
    </div>
  );
}

export default function SceneViewer({ initial = {} }) {
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
    marker.style.background = "#e0705a";
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
  const projectRef = useRef(null);
  const savedEngineRevRef = useRef(0);
  const pendingSaveRef = useRef(false);
  const autosaveRef = useRef(null);
  if (!autosaveRef.current) {
    autosaveRef.current = createAutosave({
      saveNow: () => saveNowRef.current?.(),
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
    docRef.current = null;
    setEditOn(false);
    setTextState({ editing: false, elementId: null, conflict: null, overflow: null, paragraphs: null });
    setEditStatus({ rev: 0, error: null, preparing: false });
  }
  async function enterEdit() {
    if (editOn || !viewerRef.current) return;
    setEditStatus({ rev: 0, error: null, preparing: true });
    try {
      const { createDocument } = await import("../../../../packages/model/engine.ts");
      const { attachEditor } = await import("../../../../packages/editor/scene-edit.js");
      const source = editedScenes ?? deck.scenes;
      const doc = await createDocument(structuredClone(source));
      const adapter = attachEditor(viewerRef.current, doc, {
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
      setEditStatus({ rev: 0, error: null, preparing: false });
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
  async function saveNow() {
    const adapter = adapterRef.current;
    const doc = docRef.current;
    const proj = projectRef.current;
    if (!editOn || !doc || !proj) return { ok: false, code: "op-rejected", message: "no project bound — save as a new project first" };
    if (adapter?.hasPendingEdit?.()) {
      const r = await adapter.commitPendingEdit();
      if (!r.ok) return r;
    }
    if (pendingSaveRef.current) return { ok: true, revision: doc.snapshot().revision, pending: true };
    const snapNow = doc.snapshot();
    const atEngineRev = snapNow.revision;
    if (atEngineRev === savedEngineRevRef.current && saveState !== "error" && saveState !== "stale") {
      setSaveState("saved");
      return { ok: true, revision: atEngineRev, noop: true };
    }
    pendingSaveRef.current = true;
    setSaveState("saving");
    setSaveError(null);
    try {
      const scenes = structuredClone(snapNow.scenes);
      const updated = await apiSave(proj.id, {
        baseRevision: proj.revision,
        title: proj.title,
        scenes,
      });
      projectRef.current = { ...proj, revision: updated.revision, updatedAt: updated.updatedAt };
      setProject(projectRef.current);
      writeLastProject(proj.id);
      // Only the submitted revision counts as saved: edits that
      // landed mid-flight keep the document dirty and reschedule.
      if (doc.snapshot().revision === atEngineRev) {
        savedEngineRevRef.current = atEngineRev;
        setSaveState("saved");
      } else {
        setSaveState("dirty");
        autosaveRef.current?.schedule();
      }
      return { ok: true, revision: updated.revision };
    } catch (err) {
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
    } finally {
      pendingSaveRef.current = false;
    }
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
      try {
        const q = new URLSearchParams(window.location.search);
        q.set("project", created.id);
        window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
      } catch { /* deep link is a hint only */ }
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

  // Open a stored project: commits pending text first (block on
  // failure), then swaps the engine document to the stored scenes.
  // Unsaved edits on the current project require an explicit choice
  // (save-and-switch, discard-and-switch, cancel) — never silent loss.
  async function openProject(id) {
    if (adapterRef.current?.hasPendingEdit?.()) {
      const r = await adapterRef.current.commitPendingEdit();
      if (!r.ok) return;
    }
    if (projectRef.current && saveState === "dirty" && projectRef.current.id !== id && !pendingSwitchId) {
      setPendingSwitchId(id);
      return;
    }
    setPendingSwitchId(null);
    setSaveState("saving");
    setSaveError(null);
    try {
      const loaded = await apiLoad(id);
      const { createDocument } = await import("../../../../packages/model/engine.ts");
      const { attachEditor } = await import("../../../../packages/editor/scene-edit.js");
      try {
        adapterRef.current?.detach();
      } catch { /* teardown only */ }
      const fresh = await createDocument(structuredClone(loaded.scenes));
      const adapter = attachEditor(viewerRef.current, fresh, {
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
      try {
        const q = new URLSearchParams(window.location.search);
        q.set("project", loaded.id);
        window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
      } catch { /* hint only */ }
      const first = loaded.scenes[0]?.id ?? null;
      if (first) followSlideId(first);
      setSlideSel(first ? [first] : []);
    } catch (err) {
      setSaveState("error");
      setSaveError(err.message);
    }
  }

  // Refresh recovery: offer the last-opened project without forcing
  // navigation. The ?project= deep link wins over localStorage.
  useLayoutEffect(() => {
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

  // Unsaved-changes guard: refresh/close warns while dirty or saving.
  useLayoutEffect(() => {
    const onBeforeUnload = (e) => {
      if (saveState === "dirty" || saveState === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);
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
    };
  }, [deck, fonts.settled]);

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

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1c1a18", color: "#eee", fontFamily: "system-ui, sans-serif" }}>
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
        style={{ width: 172, overflowY: "auto", padding: 12, borderRight: "1px solid #333" }}
        aria-label="Slides"
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
        <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.7 }}>
          {(snap?.slideIndex ?? 0) + 1} / {snap?.slideCount ?? deck.scenes.length}
        </div>
        {editOn && (
          <div role="tablist" aria-label="Sidebar" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button type="button" role="tab" aria-selected={railTab === "slides" ? "true" : "false"} onClick={() => setRailTab("slides")} style={{ flex: 1, padding: "3px 0", cursor: "pointer", background: railTab === "slides" ? "#3a2c26" : "transparent", border: "1px solid #555", borderRadius: 4, color: "#eee", fontSize: 11 }}>Slides</button>
            <button type="button" role="tab" aria-selected={railTab === "layers" ? "true" : "false"} onClick={() => setRailTab("layers")} style={{ flex: 1, padding: "3px 0", cursor: "pointer", background: railTab === "layers" ? "#3a2c26" : "transparent", border: "1px solid #555", borderRadius: 4, color: "#eee", fontSize: 11 }}>Layers</button>
          </div>
        )}
        {editOn && railTab === "layers" ? (
          <LayersPanel
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
          <div style={{ position: "relative", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => { setChooserOpen((v) => !v); setMenuFor(null); }}
              title="Add a slide: blank, layout, or duplicate"
              aria-expanded={chooserOpen ? "true" : "false"}
              data-new-slide
              style={{ display: "block", width: "100%", padding: "4px 0", cursor: "pointer", background: "transparent", border: "1px dashed #666", borderRadius: 6, color: "#eee" }}
            >
              + Slide ▾
            </button>
            {chooserOpen && (
              <div
                data-new-slide-chooser
                style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 12, marginTop: 3, background: "#242220", border: "1px solid #555", borderRadius: 6, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}
              >
                <button type="button" data-new-slide-blank onClick={async () => { setChooserOpen(false); await doInsertSlide(); }}>Blank slide</button>
                <span style={{ opacity: 0.65, fontSize: 11 }}>An empty slide in the current theme</span>
                <button type="button" data-new-slide-layout onClick={() => { setChooserOpen(false); setGalleryOpen(true); }}>Choose layout…</button>
                <span style={{ opacity: 0.65, fontSize: 11 }}>Insert an editable skeleton from the gallery</span>
                <button type="button" data-new-slide-duplicate onClick={doDuplicateActive}>Duplicate current slide</button>
              </div>
            )}
          </div>
        )}
        {editOn && effSlideSel.length > 1 && (
          <div data-bulk-bar style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, fontSize: 11, flexWrap: "wrap" }}>
            <span style={{ opacity: 0.8 }}>{effSlideSel.length} selected</span>
            <button type="button" title="Duplicate every selected slide in order" onClick={() => doDuplicateSlides(effSlideSel)}>Duplicate</button>
            {confirmBulk ? (
              <>
                <span>Delete {effSlideSel.length} slides?</span>
                <button type="button" onClick={() => doDeleteSlides(effSlideSel)}>Confirm</button>
                <button type="button" onClick={() => setConfirmBulk(false)}>Keep</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmBulk(true)}>Delete…</button>
            )}
            <button type="button" onClick={() => { const a = api?.snapshot().slideId ?? null; setSlideSel(a ? [a] : []); setConfirmBulk(false); }}>Clear</button>
          </div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {shownScenes.map((s, i) => (
            <Thumb
              key={s.id}
              scene={s}
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
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        <div data-toolbar style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #333", flexWrap: "nowrap", overflowX: "auto", overflowY: "hidden" }}>
          <select aria-label="Deck" value={liveDeck ? liveDeck.name : deckName} onChange={(e) => pickFixture(e.target.value)}>
            {DECKS.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.theme}, {d.variant})</option>)}
            {liveDeck && <option value={liveDeck.name}>{liveDeck.name} (live)</option>}
          </select>
          <button type="button" onClick={() => api && guardedNav(() => api.prev())}>← Prev</button>
          <button type="button" onClick={() => api && guardedNav(() => api.next())}>Next →</button>
          <button type="button" onClick={() => api?.zoomOut()} aria-label="Zoom out">−</button>
          <span aria-live="polite" style={{ minWidth: 56, textAlign: "center" }}>{Math.round((snap?.zoom ?? 1) * 100)}%</span>
          <button type="button" onClick={() => api?.zoomIn()} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => api?.resetZoom()}>Fit</button>
          <button type="button" onClick={() => setLiveOpen((v) => !v)} aria-expanded={liveOpen}>Live</button>
          <button type="button" onClick={() => { refreshProjectList(); setProjectsOpen(true); }} aria-expanded={projectsOpen}>Projects</button>
          <button
            type="button"
            title={editOn ? "Leave edit mode (unsaved edits stay visible until you switch decks)" : "Edit this deck: drag, nudge, delete with undo"}
            onClick={() => (editOn ? exitEdit() : enterEdit())}
          >
            {editStatus.preparing ? "Preparing…" : editOn ? "Done" : "Edit"}
          </button>
          {editOn && (
            <>
              <button type="button" aria-label="Save project" title={project ? `Save ${project.title} (rev ${project.revision})` : "Save as a new project"} disabled={saveState === "saving"} onClick={() => (project && !project.recoverable ? saveNow() : saveAsNewProject())}>Save</button>
              <span data-save-state={saveState} data-project-state={JSON.stringify(project ?? null)} style={{ fontSize: 12, opacity: 0.9, border: "1px solid #555", borderRadius: 10, padding: "1px 8px" }} title={saveError ?? project?.title ?? "no project"}>
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? `Saved${project ? ` · rev ${project.revision}` : ""}` : saveState === "dirty" ? "Unsaved changes" : saveState === "stale" ? "Conflict — newer saved version" : saveState === "error" ? "Save failed" : saveState === "unavailable" ? "Storage unavailable — edits not saved" : project?.title ?? "No project"}
              </span>
            </>
          )}
          {editOn && (
            <>
              <button type="button" aria-label="Undo" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Undo"} onClick={() => adapterRef.current?.undo()}>↩ Undo</button>
              <button type="button" aria-label="Redo" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Redo"} onClick={() => adapterRef.current?.redo()}>↪ Redo</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add an editable text box at the slide center"} onClick={() => adapterRef.current?.addTextElement()}>+ Text</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add a rectangle"} onClick={() => adapterRef.current?.addShapeElement("rect")}>+ Rect</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add a rounded rectangle"} onClick={() => adapterRef.current?.addShapeElement("roundRect")}>+ Round</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add an ellipse"} onClick={() => adapterRef.current?.addShapeElement("ellipse")}>+ Ellipse</button>
            </>
          )}
          {editOn && textState.editing && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span style={{ opacity: 0.85 }}>editing text… Ctrl+Enter commits, Esc cancels</span>
              {textState.paragraphs > 1 && (
                <span style={{ opacity: 0.7 }}>{textState.paragraphs} paragraphs · each keeps its own style</span>
              )}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const a = adapterRef.current; if (a?.editingId?.()) a.commitTextEdit(); }}>Commit</button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => adapterRef.current?.cancelTextEdit()}>Cancel</button>
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
            {snap?.slideId ?? ""}{(snap?.selectedIds?.length ?? 0) > 0 ? ` · ${snap.selectedIds.length} selected` : ""}
            {liveSnap.status === "loading" ? " · compiling…" : ""}
            {editOn ? ` · editing rev ${editStatus.rev}` : ""}
            {editedScenes && !editOn ? " · unsaved edits (read-only)" : ""}
            {(() => {
              const st = (editedScenes ?? deck.scenes)[snap?.slideIndex ?? -1]?.layoutState;
              return st === "detached" ? " · Manual slide" : st === "customized" ? " · Custom slide" : "";
            })()}
          </span>
        </div>
        {editStatus.error && (
          <div role="alert" data-edit-error style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, color: "#f0a090", background: "#242220" }}>
            Edit failed: {editStatus.error}
          </div>
        )}
        {project?.recoverable && !projectsOpen && (
          <div role="status" data-recover-banner style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, background: "#242220" }}>
            Last project “{project.title}” is saved on this machine.{" "}
            <button type="button" onClick={() => openProject(project.id)}>Reopen it</button>{" "}
            <button type="button" onClick={() => { setProject((p) => (p ? { ...p, recoverable: false } : p)); }}>Dismiss</button>
          </div>
        )}
        {(saveState === "stale" || saveState === "error" || saveState === "unavailable") && saveError && (
          <div role="alert" data-save-error style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, color: "#f0c090", background: "#242220" }}>
            {saveState === "stale" ? `Save conflict: ${saveError} Your edits are intact — reload the newer version or save as a new project.` : `Save failed: ${saveError} Your edits are intact.`}{" "}
            {saveState === "stale" && (
              <>
                <button type="button" onClick={() => openProject(project.id)}>Load newer version</button>{" "}
                <button type="button" onClick={saveAsNewProject}>Save as new project</button>{" "}
              </>
            )}
            <button type="button" onClick={() => saveNow()}>Retry save</button>
          </div>
        )}
        {pendingSwitchId && (
          <div role="alert" data-switch-guard style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, background: "#242220" }}>
            You have unsaved changes. Switching projects without saving loses them.{" "}
            <button type="button" onClick={async () => { await saveNow(); if (saveState !== "dirty") openProject(pendingSwitchId); }}>Save & switch</button>{" "}
            <button type="button" onClick={() => { const id = pendingSwitchId; setPendingSwitchId(null); savedEngineRevRef.current = docRef.current?.snapshot().revision ?? 0; setSaveState("saved"); openProject(id); }}>Discard & switch</button>{" "}
            <button type="button" onClick={() => setPendingSwitchId(null)}>Cancel</button>
          </div>
        )}
        {textState.conflict && (
          <div role="alert" data-text-conflict style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, color: "#f0c090", background: "#242220" }}>
            {textState.conflict}{" "}
            <button type="button" onClick={() => adapterRef.current?.commitTextEdit({ force: true })}>Overwrite with my draft</button>{" "}
            <button type="button" onClick={() => adapterRef.current?.cancelTextEdit()}>Discard draft</button>
          </div>
        )}
        {textState.overflow && (
          <div role="status" data-text-overflow style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, color: "#e8d090", background: "#242220" }}>
            {textState.overflow}
          </div>
        )}
        {textState.editing && (
          <div data-text-editing={textState.elementId ?? "true"} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }} />
        )}
        {liveOpen && (
          <div
            data-live-panel
            aria-label="Live compilation"
            style={{
              display: "flex", gap: 8, alignItems: "center", padding: "6px 12px",
              borderBottom: "1px solid #333", fontSize: 12, flexWrap: "wrap", background: "#242220",
            }}
          >
            <select
              aria-label="Live example"
              value={liveForm.example}
              onChange={(e) => {
                const ex = liveCatalog.examples.find((x) => x.id === e.target.value);
                setLiveForm((f) => ({ ...f, example: e.target.value, theme: ex?.theme ?? f.theme, variant: ex?.variant ?? f.variant }));
              }}
            >
              {liveCatalog.examples.length === 0 && <option value="">(no examples — is the API running?)</option>}
              {liveCatalog.examples.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <select aria-label="Live theme" value={liveForm.theme} onChange={(e) => setLiveForm((f) => ({ ...f, theme: e.target.value }))}>
              {liveCatalog.themes.map((t) => <option key={t} value={t}>{t}</option>)}
              {liveForm.theme && !liveCatalog.themes.includes(liveForm.theme) && <option value={liveForm.theme}>{liveForm.theme}</option>}
            </select>
            <select aria-label="Live variant" value={liveForm.variant} onChange={(e) => setLiveForm((f) => ({ ...f, variant: e.target.value }))}>
              <option value="plain">plain</option>
              <option value="chromed">chromed</option>
            </select>
            <button
              type="button"
              disabled={liveSnap.status === "loading" || !liveForm.example}
              onClick={() => {
                const ex = liveCatalog.examples.find((x) => x.id === liveForm.example);
                if (!ex?.intent) return;
                loaderRef.current.load({ intent: ex.intent, theme: liveForm.theme, variant: liveForm.variant });
              }}
            >
              {liveSnap.status === "loading" ? "Compiling…" : "Compile live"}
            </button>
            <span aria-live="polite" role={liveSnap.status === "error" ? "alert" : undefined} style={{ opacity: 0.85 }}>
              {liveSnap.status === "error" ? `Error: ${liveSnap.error}` : liveDeck ? `Live: ${liveDeck.name}` : ""}
            </span>
          </div>
        )}
        {/* Inspector reserve: the wrapper always holds one inspector
        line (transparent border when empty) so single-line selection
        never reflows the stage — the V2-5D double-click shift is
        fixed by layout, with the 600ms selection hold as backstop
        for multi-line inspectors. Format panels dock below the
        scroll viewport (absolute, outside flow) and the toolbar
        never wraps, for the same reason. */}
        <div
          data-inspector-wrap
          style={{ minHeight: 31, boxSizing: "border-box", background: "#242220", borderBottom: inspected.length > 0 ? "1px solid #333" : "1px solid transparent" }}
        >
        {inspected.length > 0 && (
          <div
            data-inspector
            aria-label="Selection inspector"
            style={{
              padding: "6px 12px", fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              maxHeight: 88, overflowY: "auto",
            }}
          >
            {inspected.map((r) => (
              <div key={r.id} data-inspected={r.id}>
                {r.id} · {r.kind} · {r.w}×{r.h} @ {r.x},{r.y}
                {r.locked ? " · locked" : ""}{r.semanticRef ? ` · ref ${r.semanticRef}` : ""} · {r.provenance ?? "scene"}
              </div>
            ))}
          </div>
        )}
        </div>
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
              aria-label={`Slide ${snap?.slideId ?? ""}`}
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
        <style>{`aside[aria-label="Slides"] svg { width: 100% !important; height: auto !important; display: block; } [data-gallery] svg { width: 100% !important; height: auto !important; display: block; } [data-toolbar] > * { flex-shrink: 0; white-space: nowrap; }`}</style>
        {/* Format dock: shape and text panels float above the
        scroll viewport bottom (absolute, outside layout flow), so
        selecting never resizes the scroll area, never retriggers
        refit, and never moves the stage — the double-click target
        stays pixel-stable. Dismissed by deselection. */}
        {(styledShape || formattedText || chartTarget || tableTarget) && (
          <div
            data-format-bar
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 6, borderTop: "1px solid #333", background: "#242220", maxHeight: 190, overflowY: "auto" }}
          >
            {styledShape && (
              <StylePanel
                key={`${snap.slideId}:${styledShape.id}:${editStatus.rev}`}
                element={styledShape}
                onCommit={(patch) => adapterRef.current?.setElementStyle(styledShape.id, patch)}
              />
            )}
            {formattedText && (
              <TextFormatPanel
                key={`${snap.slideId}:${formattedText.id}:${editStatus.rev}`}
                element={formattedText}
                onCommit={(i, patch) => adapterRef.current?.setTextStyle(formattedText.id, i, patch)}
              />
            )}
            {chartTarget && (
              <ChartDataPanel
                key={`${snap.slideId}:${chartTarget.id}:${editStatus.rev}`}
                element={chartTarget}
                onCommit={(payload) => adapterRef.current?.setChartData(chartTarget.id, payload)}
              />
            )}
            {tableTarget && (
              <TableDataPanel
                key={`${snap.slideId}:${tableTarget.id}:${editStatus.rev}`}
                element={tableTarget}
                onCommit={(rows) => adapterRef.current?.setTableData(tableTarget.id, rows)}
              />
            )}
          </div>
        )}
      </main>
      {galleryOpen && editOn && (
        <LayoutGallery
          sibling={(editedScenes ?? deck.scenes)[snap?.slideIndex ?? 0] ?? null}
          onInsert={doInsertLayout}
          onClose={() => setGalleryOpen(false)}
        />
      )}
      {projectsOpen && (
        <div
          data-projects-panel
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(8,8,8,0.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
          onClick={(e) => { if (e.target === e.currentTarget) setProjectsOpen(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setProjectsOpen(false); } }}
        >
          <div role="dialog" aria-label="Saved projects" style={{ background: "#1e1c1a", color: "#eee", border: "1px solid #555", borderRadius: 10, width: "min(560px, 94vw)", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #444" }}>
              <strong style={{ fontSize: 13 }}>Saved projects</strong>
              <span data-projects-count style={{ fontSize: 11, opacity: 0.7 }}>{projectList.length} stored on this machine</span>
              <button type="button" aria-label="Close projects" onClick={() => setProjectsOpen(false)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid #555", borderRadius: 5, color: "#eee", cursor: "pointer", padding: "3px 9px" }}>✕</button>
            </div>
            <div style={{ padding: "8px 12px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #444" }}>
              <button type="button" data-project-save-current disabled={!editOn} title={editOn ? "Save the current deck as a new project" : "Enter edit mode first"} onClick={saveAsNewProject}>Save current deck as project</button>
              {project && !project.recoverable && (
                <a data-project-export href={`/api/v2/projects/${encodeURIComponent(project.id)}/export.pptx`} style={{ fontSize: 12, color: "#e0705a" }}>Export {project.title} (.pptx)</a>
              )}
            </div>
            <div data-project-list style={{ overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {projectListError && <span role="alert" style={{ fontSize: 12, color: "#f0a090" }}>Could not list projects: {projectListError} — editing continues, nothing is saved.</span>}
              {projectList.length === 0 && !projectListError && <span style={{ fontSize: 12, opacity: 0.7 }}>No saved projects yet. Edit a deck, then “Save current deck as project”.</span>}
              {projectList.map((p) => (
                <div key={p.id} data-project-row={p.id} style={{ border: project?.id === p.id ? "1px solid #e0705a" : "1px solid #444", borderRadius: 6, padding: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {renamingId === p.id ? (
                    <>
                      <input aria-label={`Rename ${p.id}`} value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} style={{ flex: 1, minWidth: 120, background: "#111", color: "#eee", border: "1px solid #555", borderRadius: 4, padding: "3px 6px", fontSize: 12 }} />
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
                      }}>Apply</button>
                      <button type="button" onClick={() => { setRenamingId(null); setRenameConflict(null); }}>Cancel</button>
                      {renameConflict?.id === p.id && (
                        <span role="alert" data-rename-conflict={p.id} style={{ fontSize: 11, color: "#f0c090", flexBasis: "100%" }}>
                          Rename conflict: {renameConflict.message} Your “{renameDraft}” draft is kept.{" "}
                          <button type="button" onClick={async () => { setRenameConflict(null); await refreshProjectList(); }}>Reload list</button>
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, minWidth: 140, fontSize: 12 }}><strong>{p.title}</strong> <span style={{ opacity: 0.65 }}>· {p.slideCount} slides · rev {p.revision}</span></span>
                      <button type="button" data-project-open={p.id} onClick={() => openProject(p.id)}>Open</button>
                      <button type="button" onClick={() => { setRenamingId(p.id); setRenameDraft(p.title); }}>Rename</button>
                      {confirmRemoveId === p.id ? (
                        <>
                          <span style={{ fontSize: 11 }}>Delete “{p.title}”? This cannot be undone.</span>
                          <button type="button" data-project-delete-confirm={p.id} onClick={async () => { try { await apiRemove(p.id); setProjectList((l) => l.filter((x) => x.id !== p.id)); if (project?.id === p.id) { projectRef.current = null; setProject(null); setSaveState("idle"); writeLastProject(null); } setConfirmRemoveId(null); } catch (err) { setProjectListError(err.message); } }}>Confirm delete</button>
                          <button type="button" onClick={() => setConfirmRemoveId(null)}>Keep</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmRemoveId(p.id)}>Delete…</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
