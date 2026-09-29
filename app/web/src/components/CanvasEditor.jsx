import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer } from "react-konva";
import { api } from "../api.js";
import { Button, Spinner, Badge } from "./ui.jsx";

// The slide canvas in inches — the same units the `overrides` block speaks.
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
// Stage width in px; everything scales from here, inches = px / k.
const STAGE_W = 960;
const K = STAGE_W / SLIDE_W;

const round3 = (n) => Math.round(n * 1000) / 1000;

function upsert(list, match, entry) {
  const i = list.findIndex(match);
  const next = [...list];
  if (i < 0) next.push(entry);
  else next[i] = { ...next[i], ...entry };
  return next;
}

function useImage(src) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    let live = true;
    const im = new Image();
    im.onload = () => { if (live) setImg(im); };
    im.src = src;
    return () => { live = false; };
  }, [src]);
  return img;
}

/**
 * Canvas mode: the Canva page. Filmstrip on the left (any slide, one click),
 * the rendered slide as the stage, every tagged box selectable with its name
 * and content on it, free title/subtitle/body textboxes and images addable
 * from the panel. Everything is optimistic — drags land instantly and a
 * debounced autosave commits + re-renders in the background, so the stage
 * never waits on the server but the .pptx stays the truth.
 */
export default function CanvasEditor({ slug, deck, index, pngUrl, themeName, mode, palette, thumbs, onSelectSlide, onSave, onClose }) {
  const slide = deck.slides[index];
  const [placed, setPlaced] = useState(null);
  const [geomErr, setGeomErr] = useState("");
  const [draft, setDraft] = useState(() => structuredClone(slide.overrides ?? {}));
  const [sel, setSel] = useState(null); // { kind: "placed", target } | { kind: "free", list, idx }
  const [saveState, setSaveState] = useState("saved"); // saved | dirty | saving
  const [uploading, setUploading] = useState(false);
  const nodeRef = useRef(null);
  const trRef = useRef(null);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);
  const prevIndex = useRef(index);

  const bg = useImage(pngUrl);

  useEffect(() => {
    setGeomErr("");
    api.geometry(slug, { theme: themeName, mode })
      .then((r) => setPlaced(r.slides?.[index]?.placed ?? {}))
      .catch((err) => setGeomErr(err.message));
  }, [slug, index, themeName, mode, pngUrl, slide]);

  // New slide picked (filmstrip): fresh draft. Same slide re-rendered
  // (autosave round-trip, undo outside): keep the hand if it is mid-gesture,
  // otherwise sync so outside changes are not stranded.
  useEffect(() => {
    if (prevIndex.current !== index) {
      prevIndex.current = index;
      setDraft(structuredClone(slide.overrides ?? {}));
      setSel(null);
      setSaveState("saved");
    } else if (saveState !== "dirty" && saveState !== "saving") {
      setDraft(structuredClone(slide.overrides ?? {}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, index]);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    tr.nodes(nodeRef.current ? [nodeRef.current] : []);
  });

  const dirty = useMemo(
    () => JSON.stringify(draft ?? {}) !== JSON.stringify(slide.overrides ?? {}),
    [draft, slide],
  );

  const elements = draft.elements ?? [];
  const paints = draft.paint ?? [];
  const boxes = draft.textboxes ?? [];
  const images = draft.images ?? [];

  const setElements = (next) => setDraft((d) => ({ ...d, elements: next }));
  const setPaints = (next) => setDraft((d) => ({ ...d, paint: next }));

  const movePlaced = (target, rectInches) => {
    setElements(upsert(elements, (e) => e?.target === target, { target, ...rectInches }));
  };
  const resetPlaced = (target) => {
    setElements(elements.filter((e) => e?.target !== target));
    if (sel?.kind === "placed" && sel.target === target) setSel(null);
  };

  const paintFor = (target) => paints.find((p) => p?.target === target);
  const setPaint = (target, color) => {
    if (!color) setPaints(paints.filter((p) => p?.target !== target));
    else setPaints(upsert(paints, (p) => p?.target === target, { target, color }));
  };

  const addPresetTextbox = (preset) => {
    const presets = {
      title: { text: "New title", x: 1, y: 1, w: 8, h: 1 },
      subtitle: { text: "New subtitle", x: 1, y: 2.2, w: 8, h: 0.7 },
      body: { text: "New text", x: 1, y: 3, w: 3.5, h: 1 },
    };
    const entry = presets[preset] ?? presets.body;
    setDraft((d) => {
      const list = [...(d.textboxes ?? []), entry];
      setSel({ kind: "free", list: "textboxes", idx: list.length - 1 });
      return { ...d, textboxes: list };
    });
  };

  const addImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await api.uploadDeckImage(slug, file);
      setDraft((d) => {
        const list = [...(d.images ?? []), { asset: r.file, x: 9, y: 4, w: 3, h: 2 }];
        setSel({ kind: "free", list: "images", idx: list.length - 1 });
        return { ...d, images: list };
      });
    } catch (err) {
      setGeomErr(err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteFree = () => {
    if (sel?.kind !== "free") return;
    setDraft((d) => ({ ...d, [sel.list]: (d[sel.list] ?? []).filter((_, i) => i !== sel.idx) }));
    setSel(null);
  };

  // Optimistic autosave: every draft change commits + re-renders in the
  // background 900ms after the gesture ends. The stage never waits.
  useEffect(() => {
    if (!dirty) { setSaveState("saved"); return; }
    setSaveState("dirty");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState("saving");
      const next = structuredClone(deck);
      const clean = structuredClone(draft);
      for (const k of ["elements", "paint", "textboxes", "images"]) {
        if (Array.isArray(clean[k]) && clean[k].length === 0) delete clean[k];
      }
      if (Object.keys(clean).length === 0) delete next.slides[index].overrides;
      else next.slides[index].overrides = clean;
      onSave(next);
    }, 900);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const selectedPlacedRect = sel?.kind === "placed" ? { ...(placed?.[sel.target] ?? {}), ...elements.find((e) => e?.target === sel.target) } : null;

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex flex-col bg-sunken/95 backdrop-blur-sm"
      onKeyDown={(e) => {
        // Text fields keep native undo; deck-level undo must not fire mid-edit.
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") e.stopPropagation();
      }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <span className="font-mono text-sm tabular-nums text-fg">{String(index + 1).padStart(2, "0")} / {deck.slides.length}</span>
        <span className="text-[13px] text-fg-muted">Canvas — drag the boxes, the render follows</span>
        <div className="ml-auto flex items-center gap-2">
          {saveState === "dirty" && <Badge className="bg-amber/10 text-amber">editing…</Badge>}
          {saveState === "saving" && <span className="flex items-center gap-1.5 text-[12px] text-fg-faint"><Spinner /> saving</span>}
          {saveState === "saved" && <span className="text-[12px] text-fg-faint">saved</span>}
          <Button size="sm" variant="outline" onClick={onClose}>Back to deck</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Filmstrip: every slide, one click. */}
        <div className="flex w-36 shrink-0 flex-col gap-2 overflow-y-auto border-r border-line p-2">
          {(thumbs ?? []).map((t, i) => (
            <button
              key={i} onClick={() => onSelectSlide(i)}
              className={`shrink-0 overflow-hidden rounded-md border ${i === index ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
              title={`Slide ${i + 1}`}>
              <img src={t} alt={`Slide ${i + 1}`} className="block w-full" draggable={false} />
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-start justify-center overflow-auto p-5">
          {geomErr ? (
            <div className="mt-8 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">{geomErr}</div>
          ) : !placed || !bg ? (
            <div className="mt-8 flex items-center gap-2 text-[15px] text-fg-muted"><Spinner /> Loading slide…</div>
          ) : (
            <Stage width={STAGE_W} height={SLIDE_H * K} onMouseDown={(e) => { if (e.target === e.target.getStage()) setSel(null); }}>
              <Layer>
                <KonvaImage image={bg} width={STAGE_W} height={SLIDE_H * K} listening={false} />
                {Object.entries(placed).map(([target, r]) => {
                  const over = elements.find((e) => e?.target === target) ?? {};
                  const rect = { ...r, ...over };
                  const isSel = sel?.kind === "placed" && sel.target === target;
                  return (
                    <Rect
                      key={target}
                      ref={isSel ? (n) => { nodeRef.current = n; } : undefined}
                      x={rect.x * K} y={rect.y * K} width={rect.w * K} height={rect.h * K}
                      stroke={isSel ? "#4f8ff7" : "rgba(79,143,247,0.35)"}
                      strokeWidth={isSel ? 2 : 1}
                      dash={isSel ? undefined : [6, 4]}
                      draggable
                      onClick={() => setSel({ kind: "placed", target })}
                      onTap={() => setSel({ kind: "placed", target })}
                      onDragEnd={(e) => movePlaced(target, { x: round3(e.target.x() / K), y: round3(e.target.y() / K) })}
                      onTransformEnd={(e) => {
                        const n = e.target;
                        movePlaced(target, {
                          x: round3(n.x() / K), y: round3(n.y() / K),
                          w: round3(Math.max(0.2, (n.width() * n.scaleX()) / K)),
                          h: round3(Math.max(0.2, (n.height() * n.scaleY()) / K)),
                        });
                        n.scaleX(1); n.scaleY(1);
                      }}
                    />
                  );
                })}
                {/* Name + content tags sit above the boxes so the stage reads. */}
                {Object.entries(placed).map(([target, r]) => {
                  const over = elements.find((e) => e?.target === target) ?? {};
                  const rect = { ...r, ...over };
                  const label = contentFor(slide, target);
                  const text = label ? `${target} · ${label.slice(0, 42)}` : target;
                  return (
                    <Text
                      key={`tag-${target}`} x={rect.x * K + 3} y={rect.y * K - 16}
                      text={text} fontSize={11} fontFamily="monospace" fill="#4f8ff7"
                      listening={false}
                    />
                  );
                })}
                {boxes.map((b, i) => (
                  <FreeBox
                    key={`t${i}`} box={b} label={b.text} selected={sel?.kind === "free" && sel.list === "textboxes" && sel.idx === i}
                    nodeRef={nodeRef} onSelect={() => setSel({ kind: "free", list: "textboxes", idx: i })}
                    onMove={(r) => setDraft((d) => ({ ...d, textboxes: d.textboxes.map((x, j) => (j === i ? { ...x, ...r } : x)) }))}
                  />
                ))}
                {images.map((im, i) => (
                  <FreeBox
                    key={`i${i}`} box={im} label={im.asset?.split("/").pop()} selected={sel?.kind === "free" && sel.list === "images" && sel.idx === i}
                    nodeRef={nodeRef} onSelect={() => setSel({ kind: "free", list: "images", idx: i })}
                    onMove={(r) => setDraft((d) => ({ ...d, images: d.images.map((x, j) => (j === i ? { ...x, ...r } : x)) }))}
                  />
                ))}
                <Transformer ref={trRef} rotateEnabled={false} keepRatio={false} />
              </Layer>
            </Stage>
          )}
        </div>

        <aside className="w-72 shrink-0 overflow-y-auto border-l border-line p-4">
          {sel?.kind === "placed" && selectedPlacedRect ? (
            <PlacedPanel
              target={sel.target} rect={selectedPlacedRect} overridden={elements.some((e) => e?.target === sel.target)}
              paint={paintFor(sel.target)} palette={palette} content={contentFor(slide, sel.target)}
              onRect={(r) => movePlaced(sel.target, r)} onReset={() => resetPlaced(sel.target)}
              onPaint={(c) => setPaint(sel.target, c)}
            />
          ) : sel?.kind === "free" ? (
            <FreePanel
              item={(sel.list === "textboxes" ? boxes : images)[sel.idx]} list={sel.list}
              onDelete={deleteFree}
              onText={(text) => setDraft((d) => ({ ...d, textboxes: d.textboxes.map((x, j) => (j === sel.idx ? { ...x, text } : x)) }))}
            />
          ) : (
            <div className="text-[12.5px] leading-relaxed text-fg-muted">
              Click a dashed box to select it. Drag to move, drag a handle to
              resize. Boxes the renderer draws are dashed blue; your own
              textboxes and images sit on top in green.
            </div>
          )}

          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Add text</div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => addPresetTextbox("title")}>Title</Button>
              <Button size="sm" variant="outline" onClick={() => addPresetTextbox("subtitle")}>Subtitle</Button>
              <Button size="sm" variant="outline" onClick={() => addPresetTextbox("body")}>Text</Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Add image</div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ""; }} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading && <Spinner />} Upload image
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Best-effort content line for a placed box, so the stage reads like the
// slide instead of a wireframe. Headline-likes show the headline,
// standfirst shows the standfirst, body-likes show the first row.
function contentFor(slide, target) {
  const t = target.toLowerCase();
  if (t.includes("standfirst")) return slide.standfirst ?? "";
  if (t.includes("headline") || t.includes("title")) return slide.headline ?? slide.title ?? "";
  if (t.includes("body") || t.includes("col") || t.includes("main")) {
    const rows = slide.bullets ?? slide.points ?? slide.items ?? slide.rows ?? slide.stats ?? [];
    const first = rows[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") return first.label ?? first.text ?? first.headline ?? "";
  }
  return "";
}

function FreeBox({ box, label, selected, nodeRef, onSelect, onMove }) {
  return (
    <Rect
      ref={selected ? (n) => { nodeRef.current = n; } : undefined}
      x={(box.x ?? 1) * K} y={(box.y ?? 1) * K} width={(box.w ?? 3) * K} height={(box.h ?? 0.6) * K}
      fill="rgba(46,160,67,0.12)" stroke={selected ? "#2ea043" : "rgba(46,160,67,0.6)"} strokeWidth={selected ? 2 : 1}
      draggable onClick={onSelect} onTap={onSelect}
      onDragEnd={(e) => onMove({ x: round3(e.target.x() / K), y: round3(e.target.y() / K) })}
      onTransformEnd={(e) => {
        const n = e.target;
        onMove({
          x: round3(n.x() / K), y: round3(n.y() / K),
          w: round3(Math.max(0.2, (n.width() * n.scaleX()) / K)),
          h: round3(Math.max(0.2, (n.height() * n.scaleY()) / K)),
        });
        n.scaleX(1); n.scaleY(1);
      }}
    />
  );
}

function Num({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
      <span className="w-4 font-mono text-fg-faint">{label}</span>
      <input
        type="number" step="0.1" value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="w-full min-w-0 rounded border border-line bg-sunken px-1.5 py-1 font-mono text-[12px] text-fg outline-none focus:border-accent"
      />
    </label>
  );
}

function PlacedPanel({ target, rect, overridden, paint, palette, content, onRect, onReset, onPaint }) {
  const set = (k) => (v) => { if (v !== undefined) onRect({ [k]: v }); };
  const tokens = Object.entries(palette ?? {});
  const [custom, setCustom] = useState("");
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="font-mono text-[13px] text-fg">{target}</div>
        {overridden && <Badge className="bg-accent/10 text-accent">moved</Badge>}
      </div>
      {content && <p className="mb-2 line-clamp-2 text-[12px] leading-snug text-fg-muted">“{content}”</p>}
      <div className="grid grid-cols-2 gap-1.5">
        <Num label="x" value={round3(rect.x)} onChange={set("x")} />
        <Num label="y" value={round3(rect.y)} onChange={set("y")} />
        <Num label="w" value={round3(rect.w)} onChange={set("w")} />
        <Num label="h" value={round3(rect.h)} onChange={set("h")} />
      </div>
      {overridden && (
        <Button size="sm" variant="outline" onClick={onReset} className="mt-2">Reset to theme</Button>
      )}

      <div className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Paint</div>
      {tokens.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tokens.map(([name, hex]) => (
            <button
              key={name} title={`palette.${name}`}
              onClick={() => onPaint(paint?.color === `palette.${name}` ? null : `palette.${name}`)}
              className={`h-7 w-7 rounded-md border ${paint?.color === `palette.${name}` ? "border-accent ring-1 ring-accent" : "border-line"}`}
              style={{ background: hex }}
            />
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-fg-faint">No theme palette loaded.</div>
      )}
      <div className="mt-2 flex gap-1.5">
        <input
          value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="#rrggbb or precisely"
          className="min-w-0 flex-1 rounded-lg border border-line bg-sunken px-2 py-1.5 font-mono text-[12px] text-fg outline-none focus:border-accent"
        />
        <Button size="sm" variant="outline" onClick={() => { if (custom.trim()) { onPaint(custom.trim()); setCustom(""); } }} disabled={!custom.trim()}>Set</Button>
      </div>
      {paint?.color && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-fg-muted">
          <span className="font-mono">{paint.color}</span>
          <button onClick={() => onPaint(null)} className="text-accent hover:underline">reset</button>
        </div>
      )}
      <p className="mt-2 text-[11.5px] leading-relaxed text-fg-faint">
        Palette picks stay token paths, so a theme switch re-derives them; a
        custom value is kept verbatim.
      </p>
    </div>
  );
}

function FreePanel({ item, list, onDelete, onText }) {
  if (!item) return null;
  return (
    <div>
      <div className="mb-1 font-mono text-[13px] text-fg">
        {list === "textboxes" ? "textbox" : (item.asset?.split("/").pop() ?? "image")}
      </div>
      {list === "textboxes" && (
        <textarea
          value={item.text ?? ""} onChange={(e) => onText(e.target.value)} rows={3}
          className="w-full resize-y rounded-lg border border-line bg-sunken p-2 text-[12.5px] text-fg outline-none focus:border-accent"
        />
      )}
      <div className="mt-1 font-mono text-[11px] text-fg-faint">
        x {item.x} · y {item.y} · {item.w} × {item.h}
      </div>
      <Button size="sm" variant="outline" onClick={onDelete} className="mt-2">Delete</Button>
    </div>
  );
}
