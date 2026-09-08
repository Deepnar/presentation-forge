import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner } from "./ui.jsx";

const inputCls =
  "w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent";

function clean(v) {
  if (Array.isArray(v)) {
    const out = v.map(clean).filter((x) => x !== "" && x != null && !(Array.isArray(x) && !x.length));
    return out;
  }
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const c = clean(val);
      if (c !== "" && c != null && !(Array.isArray(c) && !c.length)) out[k] = c;
    }
    return out;
  }
  return v;
}

import { TYPE_FIELDS } from "./slideEditorFields.js";

export default function SlideEditor({ deck, index, members, onSave, onClose }) {
  const slide = deck.slides[index];
  const fields = TYPE_FIELDS[slide?.type] ?? [];
  const [draft, setDraft] = useState(() => structuredClone(deck));
  const [valid, setValid] = useState(true);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const timer = useRef(null);

  const slideDraft = draft.slides[index];
  const isTitle = slide.type === "title";
  const memberNames = useMemo(() => (members ?? []).map((m) => m.name).filter(Boolean), [members]);

  useEffect(() => {
    setValidating(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.validateDeck(clean(draft));
        setValid(r.valid);
        setErrors(r.errors ?? []);
      } catch (err) {
        setValid(false);
        setErrors([err.message]);
      } finally {
        setValidating(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [draft]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function patchSlide(patch) {
    setDraft((d) => {
      const out = structuredClone(d);
      out.slides[index] = { ...out.slides[index], ...patch };
      return out;
    });
  }
  function patchDeck(patch) {
    setDraft((d) => ({ ...d, ...patch }));
  }
  function save() {
    setSaving(true);
    onSave(clean(draft));
  }

  const title = slide.headline ?? slide.quote ?? slide.title ?? "edit slide";

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-sunken/95 p-3 backdrop-blur-sm sm:p-6">
      <Panel className="flex max-h-full w-full max-w-2xl flex-col">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3">
          <span className="font-mono text-sm tabular-nums text-fg">{String(index + 1).padStart(2, "0")}</span>
          <span className="rounded bg-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            {slide.type}
          </span>
          <span className="truncate text-sm text-fg-faint">{isTitle ? "Deck title" : title}</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg px-2 py-1 text-fg-muted transition hover:bg-hover hover:text-fg"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {isTitle && (
              <>
                <Field label="Deck title" maxLength={90}>
                  <input className={inputCls} value={draft.title ?? ""} maxLength={90}
                    onChange={(e) => patchDeck({ title: e.target.value })} />
                </Field>
                <Field label="Deck subtitle" maxLength={140} hint="optional">
                  <input className={inputCls} value={draft.subtitle ?? ""} maxLength={140}
                    onChange={(e) => patchDeck({ subtitle: e.target.value })} />
                </Field>
              </>
            )}

            {fields.map((f) => (
              <FieldEditor key={f.key} field={f} value={slideDraft[f.key]}
                onChange={(v) => patchSlide({ [f.key]: v })} />
            ))}

            {slide.type === "freeform" && (
              <div className="rounded-card border border-amber/30 bg-amber/5 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber">
                <span className="font-semibold">Rasterises.</span> This slide becomes an image — a typo or a
                wrong word can't be fixed in PowerPoint afterwards. Text must be real HTML, and scripts or
                network requests won't run.
              </div>
            )}

            <div className="border-t border-line pt-4">
              <Field label="Presenter" hint="Who presents this slide — free text. Leave empty for the deck's presenting member.">
                <input className={inputCls} list="forge-presenter-options" value={slideDraft.presenter ?? ""}
                  placeholder="auto" onChange={(e) => patchSlide({ presenter: e.target.value })} />
                <datalist id="forge-presenter-options">
                  {memberNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </Field>
            </div>

            <Field label="Speaker notes" hint="Never rendered on the slide">
              <textarea className={`${inputCls} resize-y`} rows={3} value={slideDraft.notes ?? ""}
                onChange={(e) => patchSlide({ notes: e.target.value })} />
            </Field>

            {(validating || !valid) && (
              <div className={`rounded-card border px-3 py-2 text-xs leading-relaxed ${
                validating ? "border-line text-fg-faint" : "border-amber/30 bg-amber/5 text-amber"
              }`}>
                {validating ? "Validating…" : (
                  <ul className="space-y-1">
                    {errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
                    {errors.length > 6 && <li>…and {errors.length - 6} more</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!valid || validating || saving}>
            {saving && <Spinner />}
            {saving ? "Saving" : "Save & render"}
          </Button>
        </footer>
      </Panel>
    </div>
  );
}
function Field({ label, hint, maxLength, children }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-fg-faint">{label}</span>
        {maxLength && <span className="text-[10px] tabular-nums text-fg-faint/60">≤ {maxLength}</span>}
      </div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-fg-faint">{hint}</div>}
    </label>
  );
}

function FieldEditor({ field, value, onChange }) {
  switch (field.kind) {
    case "text":
      return (
        <Field label={field.label} maxLength={field.maxLength}>
          <input className={inputCls} value={value ?? ""} maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "textarea":
      return (
        <Field label={field.label} maxLength={field.maxLength}>
          <textarea className={`${inputCls} resize-y`} rows={3} value={value ?? ""} maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "code":
      return (
        <Field label={field.label} maxLength={field.maxLength} hint="Full-bleed 16:9 (1280×720). Inline CSS only; scripts and network are blocked by the renderer's sandbox. Leave the top-right and bottom ~50px clear for the crest and footer.">
          <textarea className={`${inputCls} resize-y font-mono text-[12px] leading-relaxed`} rows={14}
            value={value ?? ""} maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "select":
      return (
        <Field label={field.label}>
          <select
            className={inputCls}
            value={value ?? (field.options ?? [])[0] ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      );
    case "nums":
      return (
        <Field label={field.label}>
          <input className={inputCls} placeholder={field.placeholder}
            value={field.single ? (value ?? "") : (value ?? []).join(", ")}
            onChange={(e) => {
              const raw = e.target.value;
              if (field.single) {
                onChange(raw === "" ? undefined : Number(raw));
              } else {
                const nums = raw.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
                onChange(nums);
              }
            }} />
        </Field>
      );
    case "list":
      return <ListEditor field={field} value={value ?? []} onChange={onChange} />;
    case "items":
      return <ItemListEditor field={field} value={value ?? []} onChange={onChange} />;
    case "nested":
      return <NestedListEditor field={field} value={value ?? []} onChange={onChange} />;
    case "side":
      return <SideEditor field={field} value={value ?? {}} onChange={onChange} />;
    case "mv":
      return <MetricValueEditor field={field} value={value ?? {}} onChange={onChange} />;
    case "ba":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 200, placeholder: "Body" },
      ]} />;
    case "ct":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body" },
      ]} />;
    case "t":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "title", maxLength: 30, placeholder: "Title" },
      ]} />;
    case "l":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "label", maxLength: 30, placeholder: "Label" },
      ]} />;
    case "panelled":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "image", maxLength: 200, placeholder: "Image path" },
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body" },
      ]} />;
    case "axes":
      return <AxesEditor field={field} value={value ?? {}} onChange={onChange} />;
    case "chart":
      return <ChartEditor field={field} value={value ?? {}} onChange={onChange} />;
    case "rows":
      return <RowsEditor field={field} value={value ?? { columns: [], rows: [] }} onChange={onChange} />;
    default:
      return null;
  }
}

function AddButton({ label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[11px] text-fg-muted transition hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-40">
      + {label}
    </button>
  );
}

function RemoveButton({ onClick }) {
  return (
    <button onClick={onClick} title="Remove"
      className="grid h-7 w-7 shrink-0 place-items-center self-end rounded-md text-fg-faint transition hover:bg-hover hover:text-amber">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}

function ListEditor({ field, value, onChange }) {
  return (
    <Field label={field.label}>
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input className={inputCls} value={item ?? ""} maxLength={field.maxLength}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
            <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton label={`Add ${(field.item ?? "item").toLowerCase()}`}
          onClick={() => onChange([...value, ""])}
          disabled={field.maxItems != null && value.length >= field.maxItems} />
      </div>
    </Field>
  );
}

function ItemListEditor({ field, value, onChange }) {
  return (
    <Field label={field.label}>
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded-card border border-line bg-panel p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-fg-faint">
                {field.itemLabel} {i + 1}
              </span>
              <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
            <div className="space-y-1.5">
              {field.fields.map((f) => itemField(f, item, (v) =>
                onChange(value.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))))}
            </div>
          </div>
        ))}
        <AddButton label={`Add ${(field.itemLabel ?? "item").toLowerCase()}`}
          onClick={() => onChange([...value, {}])}
          disabled={field.maxItems != null && value.length >= field.maxItems} />
      </div>
    </Field>
  );
}

function itemField(f, item, onPatch) {
  switch (f.kind) {
    case "textarea":
      return (
        <textarea key={f.key} className={`${inputCls} resize-y`} rows={2} maxLength={f.maxLength}
          placeholder={f.placeholder} value={item[f.key] ?? ""}
          onChange={(e) => onPatch(e.target.value)} />
      );
    case "bool":
      return (
        <label key={f.key} className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={item[f.key] !== false}
            onChange={(e) => onPatch(e.target.checked)} />
          {f.label ?? "Checked"}
        </label>
      );
    case "select":
      return (
        <select key={f.key} className={inputCls} value={item[f.key] ?? (f.options ?? [])[0]}
          onChange={(e) => onPatch(e.target.value)}>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "nums":
      return (
        <input key={f.key} className={inputCls} placeholder={f.placeholder}
          value={f.single ? (item[f.key] ?? "") : (item[f.key] ?? []).join(", ")}
          onChange={(e) => {
            const raw = e.target.value;
            if (f.single) onPatch(raw === "" ? undefined : Number(raw));
            else {
              const nums = raw.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
              onPatch(nums);
            }
          }} />
      );
    case "list":
      return (
        <div key={f.key}>
          <ListEditor field={{ label: f.itemLabel ?? "Items", ...f }} value={item[f.key] ?? []}
            onChange={(v) => onPatch(v)} />
        </div>
      );
    case "nested":
      return (
        <div key={f.key}>
          <NestedListEditor field={f} value={item[f.key] ?? []} onChange={(v) => onPatch(v)} />
        </div>
      );
    default:
      return (
        <input key={f.key} className={inputCls} maxLength={f.maxLength} placeholder={f.placeholder}
          value={item[f.key] ?? ""}
          onChange={(e) => onPatch(e.target.value)} />
      );
  }
}

function NestedListEditor({ field, value, onChange }) {
  return (
    <Field label={field.itemLabel ?? "Items"}>
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="rounded border border-line bg-sunken p-2">
            <div className="flex items-center gap-1.5">
              <input className={inputCls} value={item.label ?? ""} maxLength={30}
                placeholder="Label"
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
            {field.fields?.some((f) => f.kind === "textarea") && (
              <textarea className={`${inputCls} mt-1.5 resize-y`} rows={2}
                value={item.body ?? ""} maxLength={field.fields.find((f) => f.kind === "textarea")?.maxLength ?? 120}
                placeholder="Body"
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
            )}
            {field.fields?.some((f) => f.kind === "nested") && (
              <div className="mt-1.5">
                <NestedListEditor
                  field={field.fields.find((f) => f.kind === "nested")}
                  value={item.children ?? []}
                  onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, children: v } : x)))} />
              </div>
            )}
          </div>
        ))}
        <AddButton label={`Add ${(field.itemLabel ?? "item").toLowerCase()}`}
          onClick={() => onChange([...value, {}])}
          disabled={field.maxItems != null && value.length >= field.maxItems} />
      </div>
    </Field>
  );
}

function MetricValueEditor({ field, value, onChange }) {
  const patch = (p) => onChange({ ...value, ...p });
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        <input className={inputCls} placeholder="Value" maxLength={12} value={value.value ?? ""}
          onChange={(e) => patch({ value: e.target.value })} />
        <input className={inputCls} placeholder="Label" maxLength={30} value={value.label ?? ""}
          onChange={(e) => patch({ label: e.target.value })} />
      </div>
    </Field>
  );
}

function PairEditor({ field, value, onChange, fields }) {
  const patch = (p) => onChange({ ...value, ...p });
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        {fields.map((f) => f.kind === "textarea" ? (
          <textarea key={f.key} className={`${inputCls} resize-y`} rows={2} maxLength={f.maxLength}
            placeholder={f.placeholder} value={value[f.key] ?? ""}
            onChange={(e) => patch({ [f.key]: e.target.value })} />
        ) : (
          <input key={f.key} className={inputCls} maxLength={f.maxLength} placeholder={f.placeholder}
            value={value[f.key] ?? ""}
            onChange={(e) => patch({ [f.key]: e.target.value })} />
        ))}
      </div>
    </Field>
  );
}

function AxesEditor({ field, value, onChange }) {
  const axis = (key, label) => {
    const a = value[key] ?? {};
    const patch = (p) => onChange({ ...value, [key]: { ...a, ...p } });
    return (
      <div className="rounded border border-line bg-sunken p-2">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">{label}</div>
        <div className="space-y-1.5">
          <input className={inputCls} placeholder="Axis label" maxLength={20} value={a.label ?? ""}
            onChange={(e) => patch({ label: e.target.value })} />
          <div className="grid grid-cols-2 gap-1.5">
            <input className={inputCls} placeholder="Low" maxLength={16} value={a.low ?? ""}
              onChange={(e) => patch({ low: e.target.value })} />
            <input className={inputCls} placeholder="High" maxLength={16} value={a.high ?? ""}
              onChange={(e) => patch({ high: e.target.value })} />
          </div>
        </div>
      </div>
    );
  };
  return (
    <Field label={field.label}>
      <div className="space-y-2">
        {axis("x", "X axis")}
        {axis("y", "Y axis")}
      </div>
    </Field>
  );
}

function ChartEditor({ field, value, onChange }) {
  const patch = (p) => onChange({ ...value, ...p });
  const c = value ?? {};
  const series = c.series ?? [];
  const kinds = ["bar", "hbar", "line", "pie", "doughnut", "area", "scatter", "radar", "stacked-bar"];
  return (
    <Field label={field.label} hint="The values are the data the chart draws — every one is checked against the research. One value per category, in the same order.">
      <div className="space-y-2.5 rounded-card border border-line bg-panel p-2.5">
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Kind</div>
          <select className={inputCls} value={kinds.includes(c.kind) ? c.kind : "bar"} onChange={(e) => patch({ kind: e.target.value })}>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Categories</div>
          <ListEditor field={{ label: "Categories", item: "Category", maxLength: 40, maxItems: 12 }}
            value={c.categories ?? []} onChange={(v) => patch({ categories: v })} />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Unit (optional)</div>
          <input className={inputCls} value={c.unit ?? ""} maxLength={16} placeholder="e.g. GW, %, ₹"
            onChange={(e) => patch({ unit: e.target.value })} />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Series</div>
          <div className="space-y-2">
            {series.map((s, i) => (
              <div key={i} className="rounded border border-line bg-sunken p-2">
                <div className="flex items-center gap-1.5">
                  <input className={inputCls} placeholder="Series name" value={s.name ?? ""} maxLength={40}
                    onChange={(e) => patch({ series: series.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <RemoveButton onClick={() => patch({ series: series.filter((_, j) => j !== i) })} />
                </div>
                <div className="mt-1.5">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Values</div>
                  <input className={inputCls} placeholder="Numbers, comma or space separated — one per category"
                    value={(s.values ?? []).join(", ")}
                    onChange={(e) => {
                      const nums = e.target.value.split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => !Number.isNaN(x));
                      patch({ series: series.map((x, j) => (j === i ? { ...x, values: nums } : x)) });
                    }} />
                </div>
              </div>
            ))}
            <AddButton label="Add series" disabled={series.length >= 4}
              onClick={() => patch({ series: [...series, { name: "", values: [] }] })} />
          </div>
        </div>
      </div>
    </Field>
  );
}

function SideEditor({ field, value, onChange }) {
  const patch = (p) => onChange({ ...value, ...p });
  const points = value.points ?? [];
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        <input className={inputCls} placeholder="Title" maxLength={40} value={value.title ?? ""}
          onChange={(e) => patch({ title: e.target.value })} />
        <input className={inputCls} placeholder="Kicker (optional)" maxLength={60} value={value.kicker ?? ""}
          onChange={(e) => patch({ kicker: e.target.value })} />
        <textarea className={`${inputCls} resize-y`} rows={2} placeholder="Body" maxLength={320} value={value.body ?? ""}
          onChange={(e) => patch({ body: e.target.value })} />
        {points.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input className={inputCls} placeholder={`Point ${i + 1}`} maxLength={120} value={p ?? ""}
              onChange={(e) => patch({ points: points.map((x, j) => (j === i ? e.target.value : x)) })} />
            <RemoveButton onClick={() => patch({ points: points.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <AddButton label="Add point" onClick={() => patch({ points: [...points, ""] })} disabled={points.length >= 4} />
      </div>
    </Field>
  );
}

function RowsEditor({ field, value, onChange }) {
  const cols = value.columns ?? [];
  const rows = value.rows ?? [];
  const patch = (p) => onChange({ ...value, ...p });
  const textRows = field.textRows;
  const cellAt = (row, c) => {
    if (textRows) return Array.isArray(row.text) ? row.text[c] : c === 0 ? row.text : "";
    return row[c];
  };
  const setCell = (row, c, v) => {
    if (textRows) {
      const cells = Array.isArray(row.text) ? [...row.text] : [row.text ?? ""];
      while (cells.length <= c) cells.push("");
      cells[c] = v;
      return { ...row, text: cells };
    }
    const out = [...row];
    out[c] = v;
    return out;
  };
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        {rows.map((row, r) => (
          <div key={r} className="flex items-center gap-1.5">
            {cols.map((col, c) => (
              <input key={c} className={inputCls} maxLength={field.colMaxLength}
                value={cellAt(row, c) ?? ""}
                onChange={(e) => patch({ rows: rows.map((x, j) => (j === r ? setCell(x, c, e.target.value) : x)) })} />
            ))}
            <RemoveButton onClick={() => patch({ rows: rows.filter((_, j) => j !== r) })} />
          </div>
        ))}
        <AddButton label="Add row"
          onClick={() => patch({
            rows: [...rows, textRows ? { text: cols.map(() => "") } : cols.map(() => "")],
          })}
          disabled={field.maxRows != null && rows.length >= field.maxRows} />
      </div>
    </Field>
  );
}
