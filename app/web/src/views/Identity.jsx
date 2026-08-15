import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Badge, Field, Spinner, inputCls } from "../components/ui.jsx";
import { setModelMode } from "../lib/modelMode.js";

/**
 * Edits config/identity.yaml — the remembered defaults every new deck starts
 * from. Everything is free text on purpose: team size, designations and
 * academic year change every submission, so nothing here is a fixed enum.
 * The Cloud section below it attaches an opt-in hosted backend; its key lives
 * in gitignored config/local.yaml and never returns to this page. Managing
 * the key requires a login (the key is the one sensitive thing on the box).
 */
export default function Identity({ user, onAuthClick }) {
  const [id, setId] = useState(null);
  const [state, setState] = useState({ status: "idle", message: "" });
  const [cloud, setCloud] = useState(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudState, setCloudState] = useState({ status: "idle", message: "" });
  const [brand, setBrand] = useState(null);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandState, setBrandState] = useState({ status: "idle", message: "" });
  const fileRefs = { crest: useRef(null), banner: useRef(null), watermark: useRef(null) };

  useEffect(() => {
    api.identity().then((r) => setId(r.identity));
  }, []);

  useEffect(() => {
    api.cloud().then((r) => setCloud(r.cloud)).catch(() => {});
    api.brand().then((r) => setBrand(r.brand)).catch(() => {});
  }, []);
  if (!id) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-9">
        <div className="skeleton h-8 w-52 rounded-lg" />
        <div className="skeleton mt-6 h-64 rounded-card" />
      </div>
    );
  }

  const set = (pathStr, value) => {
    setId((prev) => {
      const next = structuredClone(prev);
      const keys = pathStr.split(".");
      let node = next;
      for (const k of keys.slice(0, -1)) node = node[k] ??= {};
      node[keys.at(-1)] = value;
      return next;
    });
    setState({ status: "dirty", message: "" });
  };

  const members = id.team?.members ?? [];
  const setMembers = (list) => set("team.members", list);

  async function save() {
    setState({ status: "saving", message: "" });
    try {
      await api.saveIdentity(id);
      setState({ status: "saved", message: "Saved to config/identity.yaml" });
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }

  async function saveKey() {
    setCloudBusy(true);
    setCloudState({ status: "busy", message: "" });
    try {
      await api.cloudSaveKey(keyDraft.trim());
      setKeyDraft("");
      const r = await api.cloud();
      setCloud(r.cloud);
      setCloudState({ status: "saved", message: "Key saved to config/local.yaml" });
    } catch (err) {
      setCloudState({ status: "error", message: err.message });
    } finally {
      setCloudBusy(false);
    }
  }

  async function removeKey() {
    if (!window.confirm("Remove the cloud API key from config/local.yaml?")) return;
    setCloudBusy(true);
    setCloudState({ status: "busy", message: "" });
    try {
      await api.cloudClearKey();
      const r = await api.cloud();
      setCloud(r.cloud);
      setCloudState({ status: "saved", message: "Key removed." });
    } catch (err) {
      setCloudState({ status: "error", message: err.message });
    } finally {
      setCloudBusy(false);
    }
  }

  async function testKey() {
    setCloudBusy(true);
    setCloudState({ status: "busy", message: "Testing…" });
    try {
      const r = await api.cloudTest();
      setCloudState(r.ok
        ? { status: "saved", message: r.detail }
        : { status: "error", message: r.detail });
    } catch (err) {
      setCloudState({ status: "error", message: err.message });
    } finally {
      setCloudBusy(false);
    }
  }

  async function setRoute(route) {
    setCloudBusy(true);
    setCloudState({ status: "busy", message: "" });
    try {
      await api.cloudRoute(route);
      setModelMode(route);
      const r = await api.cloud();
      setCloud(r.cloud);
      setCloudState({ status: "saved", message: `Default routing: ${route}` });
    } catch (err) {
      setCloudState({ status: "error", message: err.message });
    } finally {
      setCloudBusy(false);
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

  return (
    <div className="mx-auto max-w-3xl px-10 py-10 pb-28">
      <header className="mb-7">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.015em]">Identity</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
          Defaults for new decks and reports. Any deck can override these in its
          own metadata. Blank fields are omitted from output rather than
          rendered empty.
        </p>
      </header>

      <Section title="Academic" hint="Changes most often — subject and year are per-submission.">
        <Field label="Subject" placeholder="Computer Graphics"
          value={id.academic?.subject} onChange={(v) => set("academic.subject", v)} />
        <Field label="Academic year" placeholder="2026-2027"
          value={id.academic?.year} onChange={(v) => set("academic.year", v)} />
        <Field label="Semester" placeholder="VI"
          value={id.academic?.semester} onChange={(v) => set("academic.semester", v)} />
        <Field label="Exam type" placeholder="Innovative Examination (IE)"
          value={id.academic?.exam_type} onChange={(v) => set("academic.exam_type", v)} />
      </Section>

      <Section title="Guide">
        <Field label="Name" placeholder="Dr. A. Sharma"
          value={id.guide?.name} onChange={(v) => set("guide.name", v)} />
        <Field label="Designation" placeholder="Assistant Professor"
          value={id.guide?.designation} onChange={(v) => set("guide.designation", v)} />
      </Section>

      <Section title="Team" hint="Any size. “Presents” marks who appears in slide chrome.">
        <Field className="col-span-2" label="Group label" placeholder="Group no. 2b [18-24]"
          value={id.team?.label} onChange={(v) => set("team.label", v)} />

        <div className="col-span-2 mt-1">
          <div className="mb-2 grid grid-cols-[1fr_5.5rem_4.5rem_2rem] gap-2 px-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
            <div>Name</div><div>Roll</div><div>Presents</div><div />
          </div>

          <div className="space-y-1.5">
            {members.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_5.5rem_4.5rem_2rem] items-center gap-2">
                <input
                  value={m.name ?? ""}
                  placeholder="Full name"
                  onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className={inputCls}
                />
                <input
                  value={m.roll ?? ""}
                  placeholder="21"
                  onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, roll: e.target.value } : x))}
                  className={`${inputCls} tabular-nums`}
                />
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={Boolean(m.presenting)}
                    onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, presenting: e.target.checked } : x))}
                    className="h-4 w-4 cursor-pointer accent-[#c96a59]"
                  />
                </div>
                <button
                  onClick={() => setMembers(members.filter((_, j) => j !== i))}
                  className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-danger"
                  aria-label={`Remove ${m.name || "member"}`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setMembers([...members, { name: "", roll: "", presenting: false }])}
            className="mt-2.5 w-full rounded-lg border border-dashed border-line py-2 text-xs text-fg-faint transition hover:border-accent/50 hover:text-accent"
          >
            + Add member
          </button>
        </div>
      </Section>

      <Section title="Institution" hint="Rarely changes.">
        <Field label="Name" value={id.institution?.name} onChange={(v) => set("institution.name", v)} />
        <Field label="Short" value={id.institution?.short} onChange={(v) => set("institution.short", v)} />
        <Field label="Department" value={id.institution?.department} onChange={(v) => set("institution.department", v)} />
        <Field label="University" value={id.institution?.university} onChange={(v) => set("institution.university", v)} />
      </Section>

      <section className="panel-surface mt-8 rounded-card border border-line bg-panel p-5">
        <div className="mb-4">
          <h2 className="text-[13px] font-semibold tracking-tight text-fg">Brand</h2>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-fg-faint">
            Institutional marks are trademarks and stay out of the repository.
            Upload them here — the file lands in the gitignored{" "}
            <code className="font-mono">brand/logos/</code> directory and the
            normaliser re-runs automatically, so your marks appear on the next
            render without touching the repo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {["crest", "banner", "watermark"].map((name) => {
            const file = brand?.sources?.[name];
            const label = name === "crest" ? "Crest" : name === "banner" ? "Banner" : "Watermark";
            return (
              <div key={name} className="rounded-lg border border-line bg-sunken p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12.5px] font-medium text-fg">{label}</div>
                  {file ? (
                    <Badge className="bg-accent/10 text-accent">set</Badge>
                  ) : (
                    <Badge className="bg-transparent text-fg-faint">missing</Badge>
                  )}
                </div>
                <div className="mt-1 truncate font-mono text-[10.5px] text-fg-faint">
                  {file ?? "placeholder"}
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <Button size="sm" variant="outline" disabled={brandBusy}
                    onClick={() => fileRefs[name].click()}>
                    Upload
                  </Button>
                  {file && (
                    <Button size="sm" variant="outline" disabled={brandBusy}
                      onClick={() => removeBrand(name)}>
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
          <div className="mt-3 text-[11px] leading-relaxed text-amber">
            No real marks found — the renderer is using neutral placeholders.
          </div>
        )}
        {brandState.status === "busy" && (
          <div className="mt-3 flex items-center gap-2 text-[11.5px] text-fg-faint">
            <Spinner /> {brandState.message}
          </div>
        )}
        {brandState.status === "saved" && (
          <div className="mt-3 text-[11.5px] text-accent">{brandState.message}</div>
        )}
        {brandState.status === "error" && (
          <div className="mt-3 text-[11.5px] text-danger">{brandState.message}</div>
        )}
      </section>

      <section className="panel-surface mt-8 rounded-card border border-line bg-panel p-5">
        <div className="mb-4">
          <h2 className="text-[13px] font-semibold tracking-tight text-fg">Cloud</h2>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-fg-faint">
            Attach your provider's API key so the app can also use hosted
            models next to the local ones. The models available are the ones
            this host has enabled — the list below comes from the server. The
            key is stored in gitignored config/local.yaml, never committed,
            and never sent back to this page after saving.
          </p>
        </div>

        {!user ? (
          <div className="rounded-lg border border-dashed border-line bg-sunken/40 px-4 py-5 text-center">
            <div className="text-[12.5px] text-fg-muted">
              The cloud API key is the one sensitive thing on this machine — log
              in to manage it.
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={onAuthClick}>
              Log in / Register
            </Button>
          </div>
        ) : cloud?.configured ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Badge className="bg-raised text-fg-muted">{cloud.label}</Badge>
              <span className="font-mono text-[10.5px] text-fg-faint">{cloud.baseURL}</span>
              <span className={cloud.keySet ? "text-accent" : "text-amber"}>
                {cloud.keySet ? "key attached" : "no key attached"}
              </span>
            </div>

            {cloud.models?.length > 0 && (
              <div className="rounded-lg border border-line bg-sunken/40 px-3 py-2.5">
                <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">
                  Models this host has enabled
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cloud.models.map((m) => (
                    <span key={m} className="rounded-full border border-line bg-panel px-2 py-0.5 font-mono text-[10.5px] text-fg-muted">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-1.5 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <div className="mb-1.5 text-[11px] font-medium text-fg-faint">API key</div>
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                  className={`${inputCls} font-mono`}
                />
              </label>
              <Button variant="primary" size="sm" onClick={saveKey} disabled={cloudBusy || !keyDraft.trim()}>
                Save key
              </Button>
              {cloud.keySet && (
                <Button variant="outline" size="sm" onClick={removeKey} disabled={cloudBusy}>
                  Remove
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={testKey} disabled={cloudBusy}>
                Test connection
              </Button>
              {cloudBusy && <Spinner className="text-fg-faint" />}
              {cloudState.status === "saved" && (
                <span className="text-[11.5px] text-accent">{cloudState.message}</span>
              )}
              {cloudState.status === "error" && (
                <span className="text-[11.5px] text-danger">{cloudState.message}</span>
              )}
            </div>

            <div className="border-t border-line pt-3">
              <div className="mb-1.5 text-[11px] font-medium text-fg-faint">
                Default routing — where "auto" in the model pickers points
              </div>
              <div className="flex items-center gap-0.5 rounded-full bg-sunken p-0.5">
                <button
                  onClick={() => setRoute("local")}
                  disabled={cloudBusy}
                  className={`pill px-2.5 py-1 text-[11.5px] font-medium transition disabled:opacity-50 ${
                    cloud.route === "local" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"
                  }`}
                >
                  LOCAL
                </button>
                <button
                  onClick={() => setRoute("cloud")}
                  disabled={cloudBusy}
                  className={`pill px-2.5 py-1 text-[11.5px] font-medium transition disabled:opacity-50 ${
                    cloud.route === "cloud" ? "bg-accent/15 text-accent" : "text-fg-faint hover:text-fg-muted"
                  }`}
                >
                  CLOUD
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[12px] leading-relaxed text-fg-faint">
            No cloud provider configured — add one under <code className="font-mono">providers:</code> in
            config/models.yaml with an <code className="font-mono">env:</code> key reference. The
            model list can be declared with <code className="font-mono">models:</code> or left for
            the server to fetch from the provider's own <code className="font-mono">/models</code> endpoint.
          </div>
        )}
      </section>

      {/* Sticky within the scroll column — the bar belongs to the form, never
          the app chrome. A fixed full-width bar would cover the sidebar's
          bottom nav, which is exactly the overlap this replaces. */}
      <div className="sticky bottom-0 z-10 border-t border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-10 py-3.5">
          <Button variant="primary" onClick={save} disabled={state.status === "saving"}>
            {state.status === "saving" && <Spinner />}
            Save defaults
          </Button>
          {state.status === "dirty" && (
            <span className="text-xs text-fg-faint">Unsaved changes</span>
          )}
          {state.status === "saved" && (
            <span className="text-xs text-accent">{state.message}</span>
          )}
          {state.status === "error" && (
            <span className="text-xs text-danger">{state.message}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="mt-8 rounded-card border border-line bg-panel p-5">
      <div className="mb-4">
        <h2 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] text-fg-faint">{hint}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}
