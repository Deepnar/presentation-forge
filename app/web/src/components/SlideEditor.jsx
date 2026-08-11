import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner } from "./ui.jsx";

/**
 * The precision layer: edit one slide's content straight into deck.yaml.
 *
 * Deliberately no model anywhere in this path — clicking a headline and typing
 * must not wake an LLM. Fields are rendered from a per-type descriptor map
 * shaped after deck.schema.json, so the form can never offer a field the
 * schema does not know. Every keystroke re-validates the draft deck through
 * POST /api/validate so schema errors surface while typing, before any save is
 * allowed. A title slide edits deck.title/subtitle because that is what its
 * layout actually draws.
 */

const inputCls =
  "w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent";

/** Empty optional values are dropped so clearing a field really removes it. */
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

/** Editable fields per slide type; maxLengths mirror deck.schema.json. */
const TYPE_FIELDS = {
  section: [{ key: "headline", label: "Headline", kind: "text", maxLength: 80 }],
  bullets: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "bullets", label: "Bullets", kind: "list", item: "Bullet", maxLength: 160, maxItems: 6 },
  ],
  cards: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "standfirst", label: "Standfirst", kind: "textarea", maxLength: 220 },
    {
      key: "cards", label: "Cards", kind: "items", maxItems: 4, itemLabel: "Card",
      fields: [
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "kicker", maxLength: 60, placeholder: "Kicker (optional)" },
        { key: "body", kind: "textarea", maxLength: 320, placeholder: "Body" },
      ],
    },
  ],
  compare: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "standfirst", label: "Standfirst", kind: "textarea", maxLength: 220 },
    { key: "left", label: "Left column", kind: "side" },
    { key: "right", label: "Right column", kind: "side" },
    { key: "verdict", label: "Verdict", kind: "textarea", maxLength: 260 },
  ],
  stats: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "standfirst", label: "Standfirst", kind: "textarea", maxLength: 220 },
    {
      key: "stats", label: "Stats", kind: "items", maxItems: 4, itemLabel: "Stat",
      fields: [
        { key: "value", maxLength: 12, placeholder: "Value" },
        { key: "label", maxLength: 48, placeholder: "Label" },
      ],
    },
  ],
  quote: [
    { key: "quote", label: "Quote", kind: "textarea", maxLength: 280 },
    { key: "attribution", label: "Attribution", kind: "text", maxLength: 80 },
  ],
  callout: [
    { key: "label", label: "Label", kind: "text", maxLength: 24 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 300 },
  ],
  table: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "columns", label: "Columns", kind: "list", item: "Column", maxLength: 28, maxItems: 5 },
    { key: "rows", label: "Rows", kind: "rows", colMaxLength: 120, maxRows: 8 },
  ],
  flow: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "steps", label: "Steps", kind: "items", maxItems: 6, itemLabel: "Step",
      fields: [
        { key: "title", maxLength: 32, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body" },
      ],
    },
  ],
  image: [{ key: "caption", label: "Caption", kind: "textarea", maxLength: 160 }],
  "image-text": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "body", label: "Body", kind: "list", item: "Paragraph", maxLength: 180, maxItems: 4 },
    { key: "caption", label: "Caption", kind: "textarea", maxLength: 120 },
  ],
  timeline: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "events", label: "Events", kind: "items", maxItems: 6, itemLabel: "Event",
      fields: [
        { key: "when", maxLength: 16, placeholder: "When" },
        { key: "what", kind: "textarea", maxLength: 120, placeholder: "What" },
      ],
    },
  ],
  references: [
    { key: "items", label: "References", kind: "list", item: "Reference", maxLength: 220 },
  ],
  chart: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "aside", label: "Aside", kind: "list", item: "Aside", maxLength: 120, maxItems: 3 },
  ],
  title: [],
};

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
    // Cleaned so cleared optionals truly vanish; required fields then fail
    // validation and block the save with a visible reason.
    onSave(clean(draft));
  }

  const title = slide.headline ?? slide.quote ?? slide.title ?? "edit slide";

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-sunken/95 p-6 backdrop-blur-sm">
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

            {slide.type === "chart" && (
              <p className="text-[11.5px] leading-relaxed text-fg-faint">
                Chart categories and series aren't editable inline — ask the chat panel to change the data.
              </p>
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
    case "list":
      return <ListEditor field={field} value={value ?? []} onChange={onChange} />;
    case "items":
      return <ItemListEditor field={field} value={value ?? []} onChange={onChange} />;
    case "side":
      return <SideEditor field={field} value={value ?? {}} onChange={onChange} />;
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
              {field.fields.map((f) => f.kind === "textarea" ? (
                <textarea key={f.key} className={`${inputCls} resize-y`} rows={2} maxLength={f.maxLength}
                  placeholder={f.placeholder} value={item[f.key] ?? ""}
                  onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
              ) : (
                <input key={f.key} className={inputCls} maxLength={f.maxLength} placeholder={f.placeholder}
                  value={item[f.key] ?? ""}
                  onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
              ))}
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
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        {rows.map((row, r) => (
          <div key={r} className="flex items-center gap-1.5">
            {cols.map((_, c) => (
              <input key={c} className={inputCls} maxLength={field.colMaxLength} value={row[c] ?? ""}
                onChange={(e) => patch({ rows: rows.map((x, j) => (j === r ? cols.map((_, k) => (k === c ? e.target.value : x[k])) : x)) })} />
            ))}
            <RemoveButton onClick={() => patch({ rows: rows.filter((_, j) => j !== r) })} />
          </div>
        ))}
        <AddButton label="Add row" onClick={() => patch({ rows: [...rows, cols.map(() => "")] })}
          disabled={field.maxRows != null && rows.length >= field.maxRows} />
      </div>
    </Field>
  );
}
