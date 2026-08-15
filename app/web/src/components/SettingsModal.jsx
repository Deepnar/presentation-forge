import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Badge, Field, Spinner, ConfirmModal, inputCls } from "./ui.jsx";
import { presetsStore } from "../lib/presets.js";
import { setModelMode } from "../lib/modelMode.js";

const DENSITIES = ["sparse", "balanced", "dense"];
const BRANDINGS = [
  { value: "full", label: "Full branding", note: "banner + crest + footer marks" },
  { value: "minimal", label: "Minimal", note: "crest and slide numbers, no banner" },
  { value: "none", label: "No branding", note: "just slide numbers" },
];
const SLIDE_COUNTS = [0, 8, 12, 16, 20];
const PER_MEMBER = [null, 1, 2, 3];
const BRAND_ASSETS = ["crest", "banner", "watermark"];

/**
 * Settings — the ONE management surface, opened from the profile chip or the
 * sidebar row. Three sections:
 *
 * 1. Account: the person (name, email), the cloud backend (status, key
 *    management, routing) and Log out.
 * 2. Saved formats: presets, full CRUD without any chat. A preset fixes team,
 *    slides, slides-per-member, density, theme and branding — the reusable
 *    half of a briefing.
 * 3. Identity: the long-term facts config/identity.yaml holds — institution
 *    and guide — edited inline here. The per-submission fields (subject,
 *    year, semester, exam type, team) are asked in the briefing, never stored
 *    here.
 */
export default function SettingsModal({ open, onClose, user, identity, onIdentityChanged, onLogout }) {
  if (!open) return null;
  return (
    <div
      className="fade-in fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] p-4 backdrop-blur-md"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fade-in flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-panel shadow-[var(--shadow-float)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold tracking-tight text-fg">Settings</div>
            <div className="text-[11.5px] text-fg-faint">
              What stays the same across your decks — and how you connect.
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
            aria-label="Close settings"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <AccountSection user={user} onClose={onClose} onLogout={onLogout} />
          <PresetsSection />
          <IdentitySection identity={identity} onIdentityChanged={onIdentityChanged} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- account */

function AccountSection({ user, onClose, onLogout }) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [cloud, setCloud] = useState(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [state, setState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    api.cloud().then((r) => setCloud(r.cloud ?? null)).catch(() => setCloud(null));
  }, []);

  async function saveKey() {
    setCloudBusy(true);
    setState({ status: "busy", message: "" });
    try {
      await api.cloudSaveKey(keyDraft.trim());
      setKeyDraft("");
      const r = await api.cloud();
      setCloud(r.cloud);
      setState({ status: "saved", message: "Key saved to config/local.yaml" });
    } catch (err) {
      setState({ status: "error", message: err.message });
    } finally {
      setCloudBusy(false);
    }
  }

  async function removeKey() {
    if (!window.confirm("Remove the cloud API key from config/local.yaml?")) return;
    setCloudBusy(true);
    setState({ status: "busy", message: "" });
    try {
      await api.cloudClearKey();
      const r = await api.cloud();
      setCloud(r.cloud);
      setState({ status: "saved", message: "Key removed." });
    } catch (err) {
      setState({ status: "error", message: err.message });
    } finally {
      setCloudBusy(false);
    }
  }

  async function testKey() {
    setCloudBusy(true);
    setState({ status: "busy", message: "Testing…" });
    try {
      const r = await api.cloudTest();
      setState(r.ok ? { status: "saved", message: r.detail } : { status: "error", message: r.detail });
    } catch (err) {
      setState({ status: "error", message: err.message });
    } finally {
      setCloudBusy(false);
    }
  }

  async function setRoute(route) {
    setCloudBusy(true);
    setState({ status: "busy", message: "" });
    try {
      await api.cloudRoute(route);
      setModelMode(route);
      const r = await api.cloud();
      setCloud(r.cloud);
      setState({ status: "saved", message: `Default routing: ${route}` });
    } catch (err) {
      setState({ status: "error", message: err.message });
    } finally {
      setCloudBusy(false);
    }
  }

  const name = user?.name ?? "Account";

  return (
    <section className="rounded-card border border-line bg-sunken/40 p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-[14px] font-semibold uppercase text-accent">
          {name[0] ?? "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-fg">{name}</div>
          <div className="truncate text-[12px] text-fg-muted">{user?.email}</div>
        </div>
        <button
          onClick={() => setConfirmLogout(true)}
          className="rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
        >
          Log out
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-panel p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">Cloud</div>
          {cloud?.keySet && (
            <Badge className="bg-accent/10 text-accent">{cloud.models?.length ?? 0} models</Badge>
          )}
        </div>
        <div className="mt-1.5 text-[12.5px] text-fg-muted">
          {cloud?.keySet
            ? `${cloud.label ?? "Hosted models"} — connected`
            : cloud?.configured
              ? "No API key attached yet"
              : "No cloud provider configured"}
        </div>
        {cloud?.keySet && (
          <div className="mt-1 font-mono text-[10.5px] text-fg-faint">{cloud.baseURL}</div>
        )}

        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1">
              <div className="mb-1 text-[11px] font-medium text-fg-faint">API key</div>
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={cloud?.keySet ? "…(key attached — type to replace)" : "sk-…"}
                autoComplete="off"
                className={`${inputCls} font-mono`}
              />
            </label>
            <Button variant="primary" size="sm" onClick={saveKey} disabled={cloudBusy || !keyDraft.trim()}>
              Save key
            </Button>
            {cloud?.keySet && (
              <Button variant="outline" size="sm" onClick={removeKey} disabled={cloudBusy}>Remove</Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={testKey} disabled={cloudBusy}>Test connection</Button>
            {cloudBusy && <Spinner className="text-fg-faint" />}
            {state.status === "saved" && <span className="text-[11.5px] text-accent">{state.message}</span>}
            {state.status === "error" && <span className="text-[11.5px] text-danger">{state.message}</span>}
          </div>

          <div className="border-t border-line pt-2.5">
            <div className="mb-1 text-[11px] font-medium text-fg-faint">Default routing — where "auto" in the model pickers points</div>
            <div className="flex w-fit items-center gap-0.5 rounded-full bg-sunken p-0.5">
              {["local", "cloud"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRoute(r)}
                  disabled={cloudBusy}
                  className={`pill px-2.5 py-1 text-[11.5px] font-medium uppercase transition disabled:opacity-50 ${
                    cloud?.route === r ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {confirmLogout && (
        <ConfirmModal
          title="Log out of Presentation Forge?"
          body="Your work is saved — decks, reports and chats stay on this machine. Sign back in any time to continue where you left off."
          confirmLabel="Log out"
          danger
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => { setConfirmLogout(false); onClose?.(); onLogout(); }}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------- presets */

function PresetsSection() {
  const [presets, setPresets] = useState(presetsStore.get());
  const [editing, setEditing] = useState(null); // null | "new" | preset
  const [confirming, setConfirming] = useState(null); // preset id awaiting confirm

  useEffect(() => presetsStore.subscribe(setPresets), []);

  async function refresh() {
    try { setPresets(await presetsStore.refresh()); } catch { /* keep what we have */ }
  }

  async function save(draft, isNew) {
    const payload = { name: draft.name, team: draft.team, maxSlides: draft.maxSlides, theme: draft.theme, density: draft.density, branding: draft.branding, slidesPerMember: draft.slidesPerMember };
    const saved = isNew
      ? await api.savePreset(payload)
      : await api.updatePreset(draft.id, payload);
    await refresh();
    setEditing(null);
    return saved;
  }

  async function remove(id) {
    try {
      await api.deletePreset(id);
      await refresh();
    } catch (err) {
      window.alert(`Could not delete preset: ${err.message}`);
    }
    setConfirming(null);
  }

  return (
    <section className="rounded-card border border-line bg-panel p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight text-fg">Saved formats</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-fg-faint">
            Reusable briefing presets — a new chat's "Use a saved format?" offers exactly these.
          </p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            + New format
          </Button>
        )}
      </div>

      {editing ? (
        <PresetEditor
          preset={editing === "new" ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="mt-3 space-y-1.5">
          {presets.length === 0 && (
            <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-[11.5px] leading-relaxed text-fg-faint">
              No saved formats yet — create one here, or from a briefing's summary
              card with "Save as preset…".
            </div>
          )}
          {presets.map((p) => (
            <div key={p.id} className="group flex items-center gap-2 rounded-lg border border-line bg-sunken/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-fg">{p.name}</div>
                <div className="truncate text-[10.5px] text-fg-faint">{presetSummary(p)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => setEditing(p)}
                  className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-fg"
                  title="Edit this format"
                  aria-label={`Edit ${p.name}`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                </button>
                {confirming === p.id ? (
                  <button
                    onClick={() => remove(p.id)}
                    className="rounded px-1.5 py-1 text-[11px] font-medium text-danger transition hover:bg-danger/10"
                  >
                    Delete?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirming(p.id)}
                    className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber"
                    title="Delete this format"
                    aria-label={`Delete ${p.name}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function presetSummary(p) {
  const members = (p.team?.members ?? []).filter((m) => m.name?.trim()).length;
  return [
    p.maxSlides ? `${p.maxSlides} slides` : "auto slides",
    `${members} people`,
    `${p.density} density`,
    p.theme || "default theme",
    p.branding && p.branding !== "full" ? `${p.branding} branding` : null,
  ].filter(Boolean).join(" · ");
}

function PresetEditor({ preset, onSave, onCancel }) {
  const [themes, setThemes] = useState([]);
  const [name, setName] = useState(preset?.name ?? "");
  const [team, setTeam] = useState({ label: preset?.team?.label ?? "", members: (preset?.team?.members ?? []).map((m) => ({ ...m })) });
  const [maxSlides, setMaxSlides] = useState(preset?.maxSlides ?? 0);
  const [slidesPerMember, setSlidesPerMember] = useState(preset?.slidesPerMember ?? null);
  const [density, setDensity] = useState(preset?.density ?? "balanced");
  const [theme, setTheme] = useState(preset?.theme ?? "");
  const [branding, setBranding] = useState(preset?.branding ?? "full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api.themes().then((r) => setThemes(r.themes ?? [])).catch(() => {}); }, []);

  const editMember = (i, patch) => setTeam((t) => ({ ...t, members: t.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const addMember = () => setTeam((t) => ({ ...t, members: [...t.members, { name: "", roll: "", presenting: false }] }));
  const named = team.members.filter((m) => m.name?.trim());
  const canSave = name.trim() && named.length > 0;

  async function submit() {
    if (!canSave || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        id: preset?.id,
        name: name.trim(),
        team: { label: team.label.trim(), members: named },
        maxSlides,
        slidesPerMember,
        density,
        theme,
        branding,
      }, !preset);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line bg-sunken/40 p-3.5">
      <Field label="Format name" placeholder="e.g. IE preset" value={name} onChange={setName} />

      <div>
        <div className="mb-1.5 text-[12px] font-medium text-fg-faint">Team</div>
        <div className="grid grid-cols-[1fr_4.5rem_5rem_2rem] items-center gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
          <div>Name</div><div>Roll</div><div>Presents</div><div />
        </div>
        <div className="space-y-1.5">
          {team.members.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_5rem_2rem] items-center gap-2">
              <input
                value={m.name ?? ""}
                onChange={(e) => editMember(i, { name: e.target.value })}
                placeholder="Full name"
                className={`${inputCls} py-1.5 text-[12.5px]`}
              />
              <input
                value={m.roll ?? ""}
                onChange={(e) => editMember(i, { roll: e.target.value })}
                placeholder="21"
                className={`${inputCls} py-1.5 text-[12.5px] tabular-nums`}
              />
              <label className="flex cursor-pointer items-center justify-center gap-1 text-[11px] text-fg-muted">
                <input
                  type="checkbox"
                  checked={Boolean(m.presenting)}
                  onChange={(e) => editMember(i, { presenting: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[--accent]"
                />
                presents
              </label>
              <button
                onClick={() => setTeam((t) => ({ ...t, members: t.members.filter((_, j) => j !== i) }))}
                className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber"
                title="Remove member"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addMember}
          className="mt-1.5 w-full rounded-lg border border-dashed border-line py-1.5 text-[12px] text-fg-faint transition hover:border-accent/50 hover:text-accent"
        >
          + Add member
        </button>
        <div className="mt-1.5">
          <input
            value={team.label}
            onChange={(e) => setTeam((t) => ({ ...t, label: e.target.value }))}
            placeholder="Group label (optional)"
            className={`${inputCls} py-1.5 text-[12.5px]`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SettingSelect
          label="Slides"
          value={maxSlides}
          onChange={(v) => setMaxSlides(v)}
          options={SLIDE_COUNTS.map((n) => ({ value: n, label: n === 0 ? "Auto" : `${n}` }))}
        />
        <SettingSelect
          label="Slides per presenting member"
          value={slidesPerMember}
          onChange={(v) => setSlidesPerMember(v)}
          options={PER_MEMBER.map((n) => ({ value: n, label: n === null ? "Auto" : `${n} each` }))}
        />
        <SettingSelect
          label="Density"
          value={density}
          onChange={(v) => setDensity(v)}
          options={DENSITIES.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))}
        />
        <label className="block">
          <div className="mb-1.5 text-[12px] font-medium text-fg-faint">Theme</div>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className={`${inputCls} appearance-none py-1.5 text-[12.5px]`}
          >
            <option value="">Default (warm-humanist)</option>
            {themes.map((t) => (
              <option key={t.name} value={t.name}>{t.label ?? t.name}</option>
            ))}
          </select>
        </label>
        <SettingSelect
          label="Branding"
          value={branding}
          onChange={(v) => setBranding(v)}
          options={BRANDINGS}
          className="col-span-2"
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        {error && <span className="mr-auto text-[11.5px] text-danger">{error}</span>}
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={submit} disabled={!canSave || busy}>
          {busy ? <Spinner /> : null}
          {preset ? "Save changes" : "Create format"}
        </Button>
      </div>
    </div>
  );
}

function SettingSelect({ label, value, onChange, options, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1.5 text-[12px] font-medium text-fg-faint">{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value ?? "") === raw);
          onChange(match ? match.value : value);
        }}
        className={`${inputCls} appearance-none py-1.5 text-[12.5px]`}
      >
        {options.map((o) => (
          <option key={String(o.value ?? "null")} value={o.value ?? ""}>
            {o.label}{o.note ? ` — ${o.note}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------- identity */

function IdentitySection({ identity, onIdentityChanged }) {
  const [draft, setDraft] = useState(null);
  const [state, setState] = useState({ status: "idle", message: "" });
  const [brand, setBrand] = useState(null);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandState, setBrandState] = useState({ status: "idle", message: "" });
  const fileRefs = { crest: useRef(null), banner: useRef(null), watermark: useRef(null) };

  // The identity prop is the whole config file; the draft edits institution
  // and guide, keeping brand/chrome and anything else untouched.
  useEffect(() => {
    setDraft(structuredClone(identity ?? {}));
  }, [identity]);

  useEffect(() => {
    api.brand().then((r) => setBrand(r.brand)).catch(() => {});
  }, []);

  const set = (pathStr, value) => {
    setDraft((prev) => {
      const next = structuredClone(prev ?? {});
      const keys = pathStr.split(".");
      let node = next;
      for (const k of keys.slice(0, -1)) node = node[k] ??= {};
      node[keys.at(-1)] = value;
      return next;
    });
    setState({ status: "dirty", message: "" });
  };

  async function save() {
    if (!draft) return;
    setState({ status: "saving", message: "" });
    try {
      // Identity holds ONLY the long-term facts — institution and guide. Any
      // pre-redesign academic/team defaults in the file are dropped here,
      // since those are per-submission and asked in the briefing now.
      const next = structuredClone(draft);
      delete next.academic;
      delete next.team;
      await api.saveIdentity(next);
      setState({ status: "saved", message: "Saved to config/identity.yaml" });
      onIdentityChanged?.(next);
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }

  async function uploadBrand(name, file) {
    if (!file) return;
    setBrandBusy(true);
    setBrandState({ status: "busy", message: `Uploading ${name}…` });
    try {
      await api.brandUpload(name, file);
      const r = await api.brand();
      setBrand(r.brand);
      setBrandState({ status: "saved", message: `${name} uploaded and normalised.` });
    } catch (err) {
      setBrandState({ status: "error", message: err.message });
    } finally {
      setBrandBusy(false);
      if (fileRefs[name]) fileRefs[name].value = "";
    }
  }

  async function removeBrand(name) {
    if (!window.confirm(`Remove the ${name} mark? It falls back to a placeholder.`)) return;
    setBrandBusy(true);
    setBrandState({ status: "busy", message: `Removing ${name}…` });
    try {
      const r = await api.brandRemove(name);
      setBrand(r.brand);
      setBrandState({ status: "saved", message: `${name} removed.` });
    } catch (err) {
      setBrandState({ status: "error", message: err.message });
    } finally {
      setBrandBusy(false);
    }
  }

  if (!draft) return null;

  return (
    <section className="rounded-card border border-line bg-panel p-5">
      <div className="mb-3">
        <h2 className="text-[13px] font-semibold tracking-tight text-fg">Identity</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-fg-faint">
          The long-term facts every deck starts from — institution and guide.
          Per-submission details (subject, year, semester, exam type, team) are
          asked in the briefing, not stored here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">Institution</div>
        </div>
        <Field label="Name" value={draft.institution?.name ?? ""} onChange={(v) => set("institution.name", v)} />
        <Field label="Short" value={draft.institution?.short ?? ""} onChange={(v) => set("institution.short", v)} />
        <Field label="Department" value={draft.institution?.department ?? ""} onChange={(v) => set("institution.department", v)} />
        <Field label="University" value={draft.institution?.university ?? ""} onChange={(v) => set("institution.university", v)} />

        <div className="mt-2 sm:col-span-2">
          <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">Guide</div>
        </div>
        <Field label="Name" value={draft.guide?.name ?? ""} onChange={(v) => set("guide.name", v)} />
        <Field label="Designation" value={draft.guide?.designation ?? ""} onChange={(v) => set("guide.designation", v)} />
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-2 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">Brand marks</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {BRAND_ASSETS.map((name) => {
            const file = brand?.sources?.[name];
            const label = name === "crest" ? "Crest" : name === "banner" ? "Banner" : "Watermark";
            return (
              <div key={name} className="rounded-lg border border-line bg-sunken/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] font-medium text-fg">{label}</div>
                  {file
                    ? <Badge className="bg-accent/10 text-accent">set</Badge>
                    : <Badge className="bg-transparent text-fg-faint">missing</Badge>}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Button size="sm" variant="outline" disabled={brandBusy} onClick={() => fileRefs[name].click()}>
                    Upload
                  </Button>
                  {file && (
                    <Button size="sm" variant="outline" disabled={brandBusy} onClick={() => removeBrand(name)}>
                      Remove
                    </Button>
                  )}
                  <input
                    ref={fileRefs[name]}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/tiff,image/gif"
                    className="hidden"
                    onChange={(e) => uploadBrand(name, e.target.files?.[0])}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {brand?.placeholder && (
          <div className="mt-2 text-[11px] text-amber">No real marks found — the renderer is using neutral placeholders.</div>
        )}
        {brandState.status === "busy" && (
          <div className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-faint"><Spinner /> {brandState.message}</div>
        )}
        {brandState.status === "saved" && <div className="mt-2 text-[11.5px] text-accent">{brandState.message}</div>}
        {brandState.status === "error" && <div className="mt-2 text-[11.5px] text-danger">{brandState.message}</div>}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        <Button variant="primary" onClick={save} disabled={state.status === "saving"}>
          {state.status === "saving" && <Spinner />}
          Save identity
        </Button>
        {state.status === "dirty" && <span className="text-xs text-fg-faint">Unsaved changes</span>}
        {state.status === "saved" && <span className="text-xs text-accent">{state.message}</span>}
        {state.status === "error" && <span className="text-xs text-danger">{state.message}</span>}
      </div>
    </section>
  );
}
