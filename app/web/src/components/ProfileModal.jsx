import { useEffect, useState } from "react";
import { api } from "../api.js";
import { getAppearance, setAppearance, subscribeAppearance } from "../lib/appearance.js";
import { Button, Badge, Spinner, ConfirmModal, inputCls } from "./ui.jsx";
import { setModelMode } from "../lib/modelMode.js";

/** Sun / moon / monitor, at the size a chip allows. */
const APPEARANCES = [
  {
    value: "light",
    title: "Light",
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: "dark",
    title: "Dark",
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    ),
  },
  {
    value: "system",
    title: "Follow the system",
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
      </svg>
    ),
  },
];

export default function ProfileModal({ open, onClose, user, onLogout }) {
  const [appearance, setAppearanceState] = useState(getAppearance);
  // The store is the source of truth — Settings can change it while this is
  // open, and the OS can change it under a "system" preference.
  useEffect(() => subscribeAppearance((m) => setAppearanceState(m)), []);
  const [auto, setAuto] = useState(null);
  const [cloud, setCloud] = useState(null);
  const [usage, setUsage] = useState(null);
  const [limits, setLimits] = useState(null);
  const [vaultHasKey, setVaultHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({ status: "idle", message: "" });
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.cloud().then((r) => setCloud(r.cloud ?? null)).catch(() => {});
    api.autoStatus().then((r) => { setAuto(r.auto ?? null); setLimits(r.limits ?? null); }).catch(() => {});
    api.autoUsage().then((r) => { setUsage(r.usage); setLimits(r.limits); }).catch(() => {});
    api.keysStatus().then((r) => setVaultHasKey(Boolean(r.hasKey))).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function saveKey() {
    setBusy(true); setState({ status: "busy", message: "" });
    try {
      await api.keysSave(keyDraft.trim(), cloud?.provider ?? "openai");
      setKeyDraft(""); setVaultHasKey(true);
      const r = await api.cloud(); setCloud(r.cloud);
      setState({ status: "saved", message: "Key saved — encrypted, never shown again" });
    } catch (e) { setState({ status: "error", message: e.message }); } finally { setBusy(false); }
  }
  async function removeKey() {
    if (!window.confirm("Remove your personal API key? Auto will still work.")) return;
    setBusy(true); try { await api.keysClear(); setVaultHasKey(false); setState({ status: "saved", message: "Personal key removed" }); } catch (e) { setState({ status: "error", message: e.message }); } finally { setBusy(false); }
  }
  async function testKey() {
    setBusy(true); setState({ status: "busy", message: "Testing…" });
    try { const r = await api.cloudTest(); setState(r.ok ? { status: "saved", message: r.detail } : { status: "error", message: r.detail }); } catch (e) { setState({ status: "error", message: e.message }); } finally { setBusy(false); }
  }
  async function testAuto() {
    setBusy(true); setState({ status: "busy", message: "Testing Auto…" });
    try { const r = await api.autoTest(); setState(r.ok ? { status: "saved", message: r.detail } : { status: "error", message: r.detail }); } catch (e) { setState({ status: "error", message: e.message }); } finally { setBusy(false); }
  }
  async function setRoute(route) {
    setBusy(true); try { await api.cloudRoute(route); setModelMode(route); const r = await api.cloud(); setCloud(r.cloud); const a = await api.autoStatus(); setAuto(a.auto); setState({ status: "saved", message: `Route: ${route}` }); } catch (e) { setState({ status: "error", message: e.message }); } finally { setBusy(false); }
  }

  if (!open) return null;
  const name = user?.name ?? "Account";
  const route = cloud?.route ?? auto?.route ?? "auto";
  const showAuto = route === "auto";
  const showCloud = route === "cloud";

  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] p-4 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="fade-in flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-panel shadow-[var(--shadow-float)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold tracking-tight">Profile</div>
            <div className="text-[11.5px] text-fg-faint">API keys, routing and account</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-fg-faint hover:bg-hover hover:text-fg" aria-label="Close">✕</button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <section className="rounded-card border border-line bg-sunken/40 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-[14px] font-semibold uppercase text-accent">{name[0] ?? "?"}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold">{name}</div><div className="truncate text-[12px] text-fg-muted">{user?.email}</div></div>
              <button onClick={() => setConfirmLogout(true)} className="rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10">Log out</button>
            </div>
          </section>

          {/* Appearance lives in Settings too, with its swatches and the
              reasoning. This is the two-second version, next to the account it
              belongs to — the full control is two modals away and nobody
              opens Settings to change the lights. */}
          <section className="flex items-center gap-3 rounded-card border border-line bg-sunken/40 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-fg">Appearance</div>
              <div className="text-[11px] text-fg-faint">Interface only — a deck keeps its own theme.</div>
            </div>
            <div role="radiogroup" aria-label="Appearance" className="flex shrink-0 rounded-pill border border-line bg-panel p-0.5">
              {APPEARANCES.map((o) => {
                const on = appearance === o.value;
                return (
                  <button
                    key={o.value}
                    role="radio"
                    aria-checked={on}
                    title={o.title}
                    onClick={() => setAppearance(o.value)}
                    className={`grid h-7 w-8 place-items-center rounded-pill transition ${
                      on ? "bg-accent text-on-accent" : "text-fg-faint hover:bg-hover hover:text-fg"
                    }`}
                  >
                    {o.icon}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-card border border-line bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-semibold">Routing</div>
              <span className="text-[11px] text-fg-faint">Auto = Free · Cloud = Your key</span>
            </div>
            {/* Toggle — single control, not two pills */}
            <div className="flex items-center gap-3">
              <span className={`text-[11px] font-medium ${showAuto ? "text-accent" : "text-fg-faint"}`}>Auto</span>
              <button
                onClick={() => setRoute(showAuto ? "cloud" : "auto")}
                disabled={busy || (!showAuto && !cloud?.configured)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${showAuto ? "bg-accent" : "bg-accent"} ${busy ? "opacity-50" : ""}`}
                aria-label="Toggle Auto/Cloud"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-on-accent shadow transition ${showAuto ? "translate-x-1" : "translate-x-6"}`} />
              </button>
              <span className={`text-[11px] font-medium ${showCloud ? "text-accent" : "text-fg-faint"}`}>Cloud</span>
              <span className="ml-auto text-[10.5px] text-fg-faint">{route === "auto" ? "Using Auto" : "Using Cloud"}</span>
            </div>
          </section>

          {showAuto && (
            <section className="rounded-card border border-line bg-panel p-4">
              <div className="flex items-center justify-between"><div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Auto — Free shared model</div>{auto?.keySet ? <Badge className="bg-accent/10 text-accent">Ready</Badge> : <Badge className="bg-danger/10 text-danger">Unavailable</Badge>}</div>
              {usage && limits && (
                <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                  <div className="rounded border border-line bg-sunken/40 p-2"><div className="text-fg-faint">Last {limits.windowHours}h</div><div className="mt-1 font-mono text-fg">{usage.window.requests}/{limits.windowRequests} req · {usage.window.slides}/{limits.windowSlides} slides</div></div>
                  <div className="rounded border border-line bg-sunken/40 p-2"><div className="text-fg-faint">This week</div><div className="mt-1 font-mono text-fg">{usage.week.requests}/{limits.weeklyRequests} req · {usage.week.slides}/{limits.weeklySlides} slides</div></div>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={testAuto} disabled={busy}>Test Auto</Button>
                {state.status === "saved" && <span className="text-[11px] text-accent">{state.message}</span>}
                {state.status === "error" && <span className="text-[11px] text-danger">{state.message}</span>}
              </div>
            </section>
          )}

          {showCloud && (
            <section className="rounded-card border border-line bg-panel p-4">
              <div className="flex items-center justify-between"><div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Cloud — Your key (encrypted)</div>{vaultHasKey ? <Badge className="bg-accent/10 text-accent">saved</Badge> : <Badge className="bg-transparent text-fg-faint">none</Badge>}</div>
              <div className="mt-2 flex gap-2">
                <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder={vaultHasKey ? "…attached — type to replace" : "sk-…"} className={`${inputCls} font-mono flex-1`} />
                <Button size="sm" variant="primary" onClick={saveKey} disabled={busy || !keyDraft.trim()}>Save</Button>
                {vaultHasKey && <Button size="sm" variant="outline" onClick={removeKey} disabled={busy}>Remove</Button>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={testKey} disabled={busy || !vaultHasKey}>Test key</Button>
                {busy && <Spinner />}
                {state.status === "saved" && <span className="text-[11px] text-accent">{state.message}</span>}
                {state.status === "error" && <span className="text-[11px] text-danger">{state.message}</span>}
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-fg-faint">Keys are AES-256-GCM encrypted with server pepper — never logged, never returned.</p>
            </section>
          )}
        </div>
        {confirmLogout && (
          <ConfirmModal title="Log out?" body="Your work stays on this machine." confirmLabel="Log out" danger onCancel={() => setConfirmLogout(false)} onConfirm={() => { setConfirmLogout(false); onClose?.(); onLogout?.(); }} />
        )}
      </div>
    </div>
  );
}
