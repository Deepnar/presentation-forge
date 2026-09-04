import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Badge } from "../components/ui.jsx";

export default function Admin({ onBack }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [decks, setDecks] = useState([]);
  const [hosted, setHosted] = useState(false);
  const [tab, setTab] = useState("overview"); // overview | users | decks | analytics | system
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  const load = async () => {
    setBusy(true); setErr("");
    try {
      const [s, u, d, h] = await Promise.all([
        api.adminStats(),
        api.adminUsers().catch(() => ({ users: [] })),
        api.adminDecks().catch(() => ({ decks: [] })),
        api.adminHosted().catch(() => ({ hosted: false })),
      ]);
      setStats(s);
      setUsers(u.users ?? []);
      setDecks(d.decks ?? []);
      setHosted(Boolean(h.hosted ?? s.hosted));
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  // The Auto probe is answered out of band so the page never blocks on it (see
  // autoHealth in src/cloud.js). Collect the result when it lands instead of
  // leaving "checking…" on screen until someone presses Refresh.
  useEffect(() => {
    if (!stats?.system?.auto?.pending) return;
    const t = setTimeout(() => { api.adminStats().then(setStats).catch(() => {}); }, 4000);
    return () => clearTimeout(t);
  }, [stats?.system?.auto?.pending]);

  const toggleHosted = async () => {
    try {
      const r = await api.adminSetHosted(!hosted);
      setHosted(Boolean(r.hosted));
      window.dispatchEvent(new CustomEvent("forge:hostedChanged", { detail: { hosted: r.hosted } }));
      const s = await api.adminStats();
      setStats(s);
      setTimeout(() => window.location.reload(), 500);
    } catch (e) { window.alert(e.message); }
  };

  const setRole = async (email, role) => {
    try { await api.adminSetRole(email, role); await load(); } catch (e) { window.alert(e.message); }
  };
  const delUser = async (email) => {
    if (!window.confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try { await api.adminDeleteUser(email); await load(); } catch (e) { window.alert(e.message); }
  };
  const clearUsage = async (email) => {
    if (!window.confirm(`Clear ${email}'s Auto usage? Their window and weekly counters go back to zero.`)) return;
    try { await api.adminClearUsage(email); await load(); } catch (e) { window.alert(e.message); }
  };

  if (busy) return <div className="mx-auto max-w-6xl p-8 text-[13px] text-fg-muted">Loading admin…</div>;
  if (err) {
    const is403 = /admin only|403/i.test(err);
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Panel className="p-6 text-center">
          <div className="text-[14px] font-semibold text-fg">{is403 ? "Admin only" : "Failed to load admin"}</div>
          <div className="mt-1 text-[12px] text-fg-muted break-words">{err}</div>
          {is403 && <div className="mt-2 text-[11px] text-fg-faint">Signed in as a non-admin account. Ask an existing admin to promote you. The operator account is seeded at boot from <code className="font-mono">FORGE_ADMIN_EMAIL</code>.</div>}
          {onBack && <Button className="mt-4" variant="outline" onClick={onBack}>Back</Button>}
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-semibold tracking-tight text-fg">Admin</h1>
            <Badge className={hosted ? "bg-amber/10 text-amber" : "bg-success/10 text-success"}>{hosted ? "hosted" : "local"}</Badge>
          </div>
          <div className="text-[12px] text-fg-faint">Is anything broken, who is using this, and what is it costing. Start at System when something is wrong.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
          {onBack && <Button size="sm" variant="outline" onClick={onBack}>Back to chats</Button>}
        </div>
      </header>

      <div className="flex gap-1.5">
        {["overview","users","decks","analytics","system"].map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`pill px-3 py-1.5 text-[12px] font-medium capitalize transition ${tab===k ? "bg-accent text-on-accent" : "bg-panel text-fg-muted hover:bg-hover hover:text-fg"}`}>{k}</button>
        ))}
      </div>

      {tab === "overview" && <Overview stats={stats} hosted={hosted} />}
      {tab === "users" && <UsersTab users={users} limits={stats?.limits} onRole={setRole} onDelete={delUser} onClearUsage={clearUsage} />}
      {tab === "decks" && <DecksTab decks={decks} />}
      {tab === "analytics" && <Analytics stats={stats} />}
      {tab === "system" && <SystemTab stats={stats} hosted={hosted} onToggle={toggleHosted} onReload={load} />}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-card border border-line bg-panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-fg-muted">{sub}</div>}
    </div>
  );
}

function Overview({ stats, hosted }) {
  if (!stats) return null;
  const s = stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Users" value={s.users.total} sub={`${s.users.admins} admins · +${s.users.week} this week`} />
        <StatCard label="Decks" value={s.decks.total} sub={`${s.decks.slides} slides · ${s.decks.reports} reports`} />
        <StatCard label="Storage" value={`${(s.decks.size/1024/1024).toFixed(1)} MB`} sub={`${s.decks.total} decks, previews included`} />
        {/* NOT "model calls". src/limits.js is explicit that one recorded event
            is one pipeline operation, which makes many model calls behind it —
            and that reading the events as calls makes every number look an
            order of magnitude tighter than it is. */}
        <StatCard label="Auto runs" value={s.usage.totalRequests} sub={`${s.usage.totalSlides} slides · plans, generates, chat turns`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-2 text-[12px] font-semibold text-fg">Themes</div>
          <BarChart data={Object.entries(s.decks.byTheme ?? {}).sort((a,b)=>b[1]-a[1]).slice(0,8)} />
        </Panel>
        <Panel className="p-4">
          <div className="mb-2 text-[12px] font-semibold text-fg">Top owners</div>
          <BarChart data={Object.entries(s.decks.byOwner ?? {}).sort((a,b)=>b[1]-a[1]).slice(0,8)} />
        </Panel>
      </div>
      <Panel className="p-4">
        <div className="mb-2 text-[12px] font-semibold text-fg">Recent decks</div>
        <div className="space-y-1">
          {(s.decks.recent ?? []).map((d) => (
            <div key={d.slug} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{d.title ?? d.slug}</span>
              <span className="hidden sm:inline truncate text-[11px] text-fg-faint">{d.owner ?? "legacy"} · {d.theme ?? "none"} · {d.slides} slides</span>
              <span className="text-[11px] text-fg-faint">{new Date(d.updated).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function BarChart({ data }) {
  if (!data.length) return <div className="text-[12px] text-fg-faint">No data</div>;
  const max = Math.max(...data.map(([,v])=>v), 1);
  return (
    <div className="space-y-1.5">
      {data.map(([k,v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-28 truncate text-right text-[11px] text-fg-muted">{k}</span>
          <div className="h-2 flex-1 rounded-full bg-sunken">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${(v/max*100).toFixed(0)}%` }} />
          </div>
          <span className="w-8 text-[11px] tabular-nums text-fg">{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * What one account has spent, against what it is allowed.
 *
 * The window is the number that actually blocks somebody — the weekly cap is
 * the slower one — so it leads, and it turns amber as it approaches rather
 * than only once refused, which is when the operator hears about it.
 */
function UsageCell({ usage, limits }) {
  const w = usage?.windowRequests ?? 0;
  const wk = usage?.weekRequests ?? 0;
  if (!wk) return <span className="text-fg-faint">—</span>;
  const cap = limits?.windowRequests;
  const near = cap ? w >= cap : false;
  return (
    <span className={near ? "text-amber" : "text-fg-muted"}>
      {cap ? `${w}/${cap}` : w}
      <span className="text-fg-faint"> now · {wk} this week</span>
    </span>
  );
}

const USERS_PAGE = 50;

function UsersTab({ users, limits, onRole, onDelete, onClearUsage }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(USERS_PAGE);
  const filtered = users.filter((u) => !q || u.email.toLowerCase().includes(q.toLowerCase()) || u.name.toLowerCase().includes(q.toLowerCase()));
  // The table rendered every account at once. That is fine at ten and is not
  // the shape to keep: this box already carries 116, most of them throwaway
  // test accounts, and search is the way anyone finds one.
  const page = filtered.slice(0, shown);
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-[12px] font-semibold text-fg">Users · {users.length}</div>
        <input value={q} onChange={(e)=>{setQ(e.target.value); setShown(USERS_PAGE);}} placeholder="Search email/name…" className="ml-auto w-52 rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[12px] outline-none placeholder:text-fg-faint focus:border-accent" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[11px] uppercase tracking-wider text-fg-faint">
            <tr><th className="px-2 py-1.5">Email</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Role</th><th className="px-2 py-1.5">Auto usage</th><th className="px-2 py-1.5">Created</th><th className="px-2 py-1.5">Actions</th></tr>
          </thead>
          <tbody>
            {page.map((u) => (
              <tr key={u.email} className="border-t border-line/60 hover:bg-hover/50">
                <td className="px-2 py-2 font-mono text-[11.5px] text-fg">{u.email}</td>
                <td className="px-2 py-2 text-fg-muted">{u.name}</td>
                <td className="px-2 py-2">{u.admin ? <Badge className="bg-accent/10 text-accent">admin</Badge> : <span className="text-fg-faint">user</span>}</td>
                <td className="px-2 py-2 tabular-nums"><UsageCell usage={u.usage} limits={limits} /></td>
                <td className="px-2 py-2 text-fg-faint">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}{u.google ? " · google" : ""}</td>
                <td className="px-2 py-2">
                  <span className="flex gap-1">
                    {u.admin ? (
                      <Button size="sm" variant="outline" onClick={() => onRole(u.email, "user")}>Remove admin</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onRole(u.email, "admin")}>Make admin</Button>
                    )}
                    {(u.usage?.weekRequests ?? 0) > 0 && (
                      <Button size="sm" variant="outline" onClick={() => onClearUsage(u.email)} title="Zero this account's Auto counters">Clear usage</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onDelete(u.email)} className="text-danger hover:bg-danger/10">Delete</Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > page.length && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShown((n) => n + USERS_PAGE)}>
            Show {Math.min(USERS_PAGE, filtered.length - page.length)} more
          </Button>
          <span className="text-[11px] text-fg-faint">{page.length} of {filtered.length}{q ? " matching" : ""}</span>
        </div>
      )}
      <div className="mt-2 text-[11px] text-fg-faint">Admin is a role, never an address — registration does not verify email. See System for how the gate works.</div>
    </Panel>
  );
}

function DecksTab({ decks }) {
  const [q, setQ] = useState("");
  const filtered = decks.filter((d) => !q || d.slug.includes(q.toLowerCase()) || (d.title ?? "").toLowerCase().includes(q.toLowerCase()) || (d.owner ?? "").toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-[12px] font-semibold text-fg">All decks · {decks.length}</div>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search slug/title/owner…" className="ml-auto w-52 rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[12px] outline-none placeholder:text-fg-faint focus:border-accent" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[11px] uppercase tracking-wider text-fg-faint">
            <tr><th className="px-2 py-1.5">Slug</th><th className="px-2 py-1.5">Title</th><th className="px-2 py-1.5">Owner</th><th className="px-2 py-1.5">Theme</th><th className="px-2 py-1.5">Slides</th><th className="px-2 py-1.5">Size</th><th className="px-2 py-1.5">Updated</th></tr>
          </thead>
          <tbody>
            {filtered.slice(0,100).map((d) => (
              <tr key={d.slug} className="border-t border-line/60 hover:bg-hover/50">
                <td className="px-2 py-1.5 font-mono text-[11px] text-fg-muted">{d.slug}</td>
                <td className="px-2 py-1.5 max-w-[18rem] truncate text-fg">{d.title ?? "—"}</td>
                <td className="px-2 py-1.5 font-mono text-[11px] text-fg-faint">{d.owner ?? "legacy"}</td>
                <td className="px-2 py-1.5 text-fg-faint">{d.theme ?? "none"}</td>
                <td className="px-2 py-1.5 tabular-nums text-fg">{d.slides}</td>
                <td className="px-2 py-1.5 tabular-nums text-fg-faint">{d.size ? `${(d.size/1024).toFixed(0)}k` : "—"}</td>
                <td className="px-2 py-1.5 text-fg-faint">{d.updated ? new Date(d.updated).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length>100 && <div className="mt-2 text-[11px] text-fg-faint">Showing 100 of {filtered.length}</div>}
    </Panel>
  );
}

function Analytics({ stats }) {
  if (!stats) return null;
  const byUser = stats.usage?.byUser ?? [];
  const maxReq = Math.max(...byUser.map((u)=>u.requests), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Auto runs (all time)" value={stats.usage.totalRequests} sub="plans, generates, chat turns" />
        <StatCard label="Slides generated" value={stats.usage.totalSlides} />
        <StatCard label="Accounts with usage" value={byUser.length} sub={byUser.length ? `top: ${byUser[0].requests} runs` : "none yet"} />
      </div>
      <Panel className="p-4">
        <div className="mb-2 text-[12px] font-semibold text-fg">Top users by Auto requests</div>
        {byUser.length ? (
          <div className="space-y-1.5">
            {byUser.map((u) => (
              <div key={u.email} className="flex items-center gap-2">
                <span className="w-40 truncate text-right font-mono text-[11px] text-fg-muted">{u.email}</span>
                <div className="h-2 flex-1 rounded-full bg-sunken"><div className="h-2 rounded-full bg-accent" style={{ width: `${(u.requests/maxReq*100).toFixed(0)}%` }} /></div>
                <span className="w-16 text-[11px] tabular-nums text-fg">{u.requests} · {u.slides}s</span>
              </div>
            ))}
          </div>
        ) : <div className="text-[12px] text-fg-faint">No usage yet</div>}
      </Panel>
      <Panel className="p-4">
        <div className="mb-2 text-[12px] font-semibold text-fg">Limits per account (env-overridable)</div>
        <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3">
          {Object.entries(stats.limits ?? {}).map(([k,v]) => (
            <div key={k} className={`rounded-lg px-2.5 py-1.5 ${k === "weeklyTokens" ? "bg-sunken opacity-50" : "bg-sunken"}`}>
              <span className="font-mono text-[11px] text-fg-faint">{k}</span>
              <span className="float-right font-medium text-fg">{String(v)}</span>
            </div>
          ))}
        </div>
        {/* A cap nothing can reach reads as protection that is not there. No
            call site records a token count — every one passes 0 — so this one
            can never fire, and saying so beats printing it like the others. */}
        <div className="mt-2 text-[11px] text-fg-faint">
          <code className="font-mono">weeklyTokens</code> is inert: nothing records token counts yet, so it can never be reached.
        </div>
      </Panel>
    </div>
  );
}

function SystemTab({ stats, hosted, onToggle, onReload }) {
  if (!stats) return null;
  return (
    <div className="space-y-4">
      <DonorPanel donor={stats.system.donor} mailOk={stats.system.mailOk} onReload={onReload} />
      <IdentityPanel identity={stats.system.identity} />
      <RolePanel audit={stats.system.roles} />
      <Panel className="p-4">
        <div className="mb-2 text-[12px] font-semibold text-fg">Website mode — hosted ↔ local</div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${hosted ? "bg-amber/15 text-amber" : "bg-emerald-500/10 text-emerald-600"}`}>{hosted ? "HOSTED — Forge + BYOK only" : "LOCAL — Ollama fallback on"}</span>
          <Button size="sm" variant="outline" onClick={onToggle}>{hosted ? "Switch to local (test)" : "Switch to hosted"}</Button>
          <span className="text-[11px] text-fg-faint">Writes <code className="font-mono">config/hosted.json</code>, which <strong className="text-fg-muted">overrides</strong> <code className="font-mono">FORGE_HOSTED</code> until it is removed.</span>
        </div>
      </Panel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-2 text-[12px] font-semibold text-fg">Backends</div>
          <div className="space-y-1.5 text-[12px]">
            <Row
              label="Forge Auto"
              ok={stats.system.auto?.pending ? null : stats.system.auto?.ok}
              detail={stats.system.auto?.pending
                ? "checking — the probe takes up to 20s when the gateway is down"
                : stats.system.auto?.ok ? "generating" : (stats.system.auto?.detail ?? "not reachable")}
            />
            <Row label="Ollama" ok={stats.system.ollamaOk} detail={hosted ? "disabled in hosted" : (stats.system.ollamaOk ? "reachable" : "not reachable")} />
            <Row label="SearXNG" ok={stats.system.searxngOk} detail={stats.system.searxngOk ? "ok" : "down"} />
            {/* Not a backend, but it fails the same way: silently, and only
                for the one person who cannot get back into their account. */}
            <Row label="Email (SMTP)" ok={stats.system.mailOk} detail={stats.system.mailOk ? "can send" : "no password reset"} />
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mb-2 text-[12px] font-semibold text-fg">System</div>
          <div className="space-y-1 text-[12px] leading-relaxed text-fg-muted">
            <div>Uptime: <span className="text-fg">{(stats.system.uptime/3600).toFixed(1)}h</span></div>
            <div>Node: <span className="font-mono text-fg">{stats.system.node}</span></div>
            <div>Disk: <code className="font-mono text-[11px] text-fg">{stats.system.diskFree ?? "—"}</code></div>
          </div>
        </Panel>
      </div>
      <AutoKeyPanel onReload={onReload} />
      <ControlsPanel settings={stats.system.settings} storageMb={stats.decks.size / 1024 / 1024} onReload={onReload} />
      <Panel className="p-4">
        <div className="mb-2 text-[12px] font-semibold text-fg">How this admin page is gated</div>
        <div className="text-[12px] leading-relaxed text-fg-muted">RBAC: <code className="font-mono">role=admin</code> in the users table — the only thing that grants admin. <code className="font-mono">FORGE_ADMIN_EMAIL</code> sets that role at boot; it is not a credential at request time. Use the Users tab to promote anyone — search email → Make admin. That account then sees Admin in the sidebar and can reach all <code className="font-mono">/api/admin/*</code>. Demote via Remove admin. The last admin cannot be deleted.</div>
      </Panel>
    </div>
  );
}
/**
 * The report template, and the fact that half the product does not work without
 * it.
 *
 * The donor is gitignored and excluded from the build context, so a fresh
 * hosted box has none — and every other screen looks perfectly healthy while
 * every report route refuses. The upload endpoint has existed since hosting
 * readiness landed; nothing in the app ever offered it, so the only way to
 * install a template was curl.
 */
function DonorPanel({ donor, mailOk, onReload }) {
  const file = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = donor?.ok === true;

  async function upload(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setErr("");
    try {
      await api.adminDonorUpload(f);
      await onReload();
    } catch (ex) {
      setErr(ex.message);
    } finally { setBusy(false); }
  }

  return (
    <Panel className={`p-4 ${ok ? "" : "border-amber/40"}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber"}`} />
        <span className="text-[12px] font-semibold text-fg">Report template</span>
        {!ok && <Badge>reports are unavailable</Badge>}
      </div>
      <div className="text-[12px] leading-relaxed text-fg-muted">
        {ok ? (
          <>Serving <code className="font-mono text-fg">{donor.detail}</code> from <code className="font-mono text-[11px]">{donor.dir}</code>. Every report is drawn on this document.</>
        ) : donor?.reason === "ambiguous" ? (
          <>There are {donor.donors.length} templates in <code className="font-mono text-[11px]">{donor.dir}</code> and the renderer will not guess between them. Upload the one you want — it replaces the rest.</>
        ) : (
          <>No template is installed, so every report on this server fails at render time while the rest of the app looks healthy. Upload the institutional <code className="font-mono">.docx</code>; its chrome, margins and headers become the report's.</>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept=".docx" onChange={upload} className="hidden" />
        <Button size="sm" variant={ok ? "outline" : "primary"} onClick={() => file.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : ok ? "Replace template" : "Upload template"}
        </Button>
        {!mailOk && (
          <span className="text-[11px] text-fg-faint">
            SMTP is also unset — password reset cannot be delivered on this box.
          </span>
        )}
      </div>
      {err && <div className="mt-2 text-[12px] text-danger">{err}</div>}
    </Panel>
  );
}

/**
 * The institution an unconfigured deck goes out under.
 *
 * Same class of fault as the missing donor, and harder to notice: nothing
 * fails. The render succeeds, the .pptx opens, and the only symptom is the
 * wrong college on a submitted deck. Per-account identity is set in Settings;
 * this is the fallback underneath it, and on a fresh box it is the committed
 * example.
 */
function IdentityPanel({ identity }) {
  if (!identity) return null;
  const ok = identity.ok;
  return (
    <Panel className={`p-4 ${ok ? "" : "border-amber/40"}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber"}`} />
        <span className="text-[12px] font-semibold text-fg">Default identity</span>
        {!ok && <Badge>decks render under a placeholder</Badge>}
      </div>
      <div className="text-[12px] leading-relaxed text-fg-muted">
        {ok ? (
          <>Decks with no owner identity render as <code className="font-mono text-fg">{identity.name}</code>, from <code className="font-mono text-[11px]">{identity.file}</code>.</>
        ) : identity.reason === "template" ? (
          <>This server still carries the shipped example, so any deck whose owner never opened Settings goes out as <code className="font-mono text-fg">{identity.name}</code>. Nothing fails — the deck just names the wrong institution.</>
        ) : identity.reason === "incomplete" ? (
          <>The default names <code className="font-mono text-fg">{identity.name}</code> but has no {identity.missing.join(" or ")}, so the rest falls back to the shipped example. A half-written default is not a working one.</>
        ) : (
          <>No default identity is configured, so every deck whose owner has set none renders as <code className="font-mono text-fg">{identity.name}</code>.</>
        )}
      </div>
      {!ok && (
        <div className="mt-3 text-[11px] text-fg-faint">
          Each account sets its own under Settings → Identity. This is only the fallback beneath that — edit <code className="font-mono">{identity.file}</code> on the box to change it.
        </div>
      )}
    </Panel>
  );
}

/**
 * Which model each role is actually running.
 *
 * A role whose configured model is missing falls back and keeps going, and the
 * only symptom is output that is quietly worse than it should be — section 9
 * traced a thin outline to exactly this once, and it took a while. The
 * substitution has always been recorded; it had nowhere to be seen.
 */
function RolePanel({ audit }) {
  if (!audit) return null;
  const ok = audit.reachable && audit.ok;
  return (
    <Panel className={`p-4 ${audit.reachable && !audit.ok ? "border-amber/40" : ""}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${!audit.reachable ? "bg-fg-faint" : ok ? "bg-emerald-500" : "bg-amber"}`} />
        <span className="text-[12px] font-semibold text-fg">Model roles</span>
        {audit.reachable && !audit.ok && <Badge>running substitutes</Badge>}
      </div>
      {!audit.reachable ? (
        <div className="text-[12px] leading-relaxed text-fg-muted">{audit.reason}</div>
      ) : (
        <div className="space-y-1.5 text-[12px]">
          {audit.roles.map((r) => (
            <div key={r.role} className="flex flex-wrap items-baseline gap-x-2">
              <span className="w-16 shrink-0 text-fg">{r.role}</span>
              {r.status === "ok" || r.status === "provider" ? (
                <span className="font-mono text-[11px] text-fg-muted">{r.resolved}</span>
              ) : r.status === "fallback" ? (
                <span className="text-fg-muted">
                  <span className="font-mono text-[11px] line-through opacity-60">{r.configured}</span>
                  {" → "}
                  <span className="font-mono text-[11px] text-amber">{r.resolved}</span>
                </span>
              ) : (
                <span className="text-danger">
                  <span className="font-mono text-[11px]">{r.configured}</span> not installed, and no fallback is either
                </span>
              )}
            </div>
          ))}
          {!audit.ok && (
            <div className="pt-1 text-[11px] leading-relaxed text-fg-faint">
              Fix <code className="font-mono">config/models.yaml</code>, or pull the model it names.
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * One setting, editable, with where its value came from.
 *
 * The source matters as much as the value. A stored override wins over the
 * environment — that is the point of being able to change it here — and the
 * cost is that an operator who edits their compose file and redeploys will not
 * see the change. So a value that is shadowing an env var says so, and can be
 * handed back to the environment in one click.
 */
function SettingRow({ name, s, onSave, busy }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const isBool = typeof s.value === "boolean";

  const shown = s.value === null || s.value === undefined
    ? "off"
    : isBool ? (s.value ? "on" : "off") : String(s.value);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line/60 py-2 first:border-0">
      <span className="min-w-0 flex-1 text-[12px] text-fg">{s.label}</span>

      {editing && !isBool ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onSave(name, draft); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
            placeholder="blank to clear"
            className="w-28 rounded-lg border border-line bg-sunken px-2 py-1 text-[12px] outline-none focus:border-accent"
          />
          <Button size="sm" variant="primary" disabled={busy} onClick={() => { onSave(name, draft); setEditing(false); }}>Save</Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <span className={`font-mono text-[12px] ${s.value ? "text-fg" : "text-fg-faint"}`}>{shown}</span>
          <SourceTag s={s} />
          {isBool ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave(name, !s.value)}>
              {s.value ? "Turn off" : "Turn on"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft(s.value == null ? "" : String(s.value)); setEditing(true); }}>
              Change
            </Button>
          )}
          {s.source === "stored" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave(name, null)} title={`Hand this setting back to ${s.env}`}>
              Reset
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function SourceTag({ s }) {
  if (s.source === "stored") {
    return s.shadowsEnv
      ? <Badge className="bg-amber/10 text-amber" title={`${s.env}=${s.envValue} is set but this override wins`}>overriding {s.env}</Badge>
      : <Badge className="bg-raised text-fg-faint">set here</Badge>;
  }
  if (s.source === "env") return <Badge className="bg-raised text-fg-faint">{s.env}</Badge>;
  return <Badge className="bg-raised text-fg-faint">default</Badge>;
}

/**
 * The operating controls, changeable without a redeploy.
 *
 * They were env-only, which on a box somebody is using means a container
 * restart to change one number — so retention in particular stayed at whatever
 * it was at deploy time, and two of the three were on no screen at all.
 */
function ControlsPanel({ settings, storageMb, onReload }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!settings) return null;
  const retentionOff = !settings.sweepDays?.value;

  const save = async (name, value) => {
    setBusy(true); setErr("");
    try {
      await api.adminSetSetting(name, value === "" ? null : value);
      await onReload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const order = ["sweepDays", "openRegistration", "autoWindowHours", "autoWindowRequests",
                 "autoWeeklyRequests", "autoWindowSlides", "autoWeeklySlides", "autoMaxSlidesPerDeck"];

  return (
    <Panel className={`p-4 ${retentionOff ? "border-amber/40" : ""}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${retentionOff ? "bg-amber" : "bg-emerald-500"}`} />
        <span className="text-[12px] font-semibold text-fg">Operating controls</span>
        {retentionOff && <Badge>deck storage is unmanaged</Badge>}
        <span className="ml-auto text-[11px] text-fg-faint">{storageMb.toFixed(1)} MB of decks</span>
      </div>
      <div className="mb-2 text-[11px] leading-relaxed text-fg-faint">
        Saved to <code className="font-mono">config/runtime.json</code> and applied to the next request — no restart.
        A value set here <strong className="text-fg-muted">overrides</strong> the environment variable until you reset it.
      </div>
      {order.filter((k) => settings[k]).map((k) => (
        <SettingRow key={k} name={k} s={settings[k]} onSave={save} busy={busy} />
      ))}
      {retentionOff && (
        <div className="mt-2 text-[11px] leading-relaxed text-fg-faint">
          With retention off every deck is kept forever. Storage is the constraint that runs out first on this workload.
        </div>
      )}
      {err && <div className="mt-2 text-[12px] text-danger">{err}</div>}
    </Panel>
  );
}

/**
 * The shared gateway key.
 *
 * Write only, and that is deliberate: nothing here can read a key back, so an
 * XSS on this page cannot take one. The status carries the last four characters
 * — enough to tell two keys apart, not enough to be one.
 *
 * The environment still wins at resolve time, so a key rotated in the
 * deployment beats one typed in here months earlier. That is the opposite
 * precedence to the settings above, and it is deliberate too: rotation must not
 * depend on somebody remembering to clear a stored row.
 */
function AutoKeyPanel({ onReload }) {
  const [st, setSt] = useState(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api.adminAutoKey().then(setSt).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (!st) return null;

  const save = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await api.adminSetAutoKey(draft.trim());
      setDraft(""); setEditing(false);
      setMsg(r.health?.ok ? "Stored — the gateway answered." : `Stored. ${r.health?.detail ?? "Not verified."}`);
      await load(); await onReload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const clear = async () => {
    if (!window.confirm("Remove the stored gateway key? Auto stops working unless FORGE_TCET_API_KEY is set.")) return;
    setBusy(true); setErr(""); setMsg("");
    try { await api.adminClearAutoKey(); await load(); await onReload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Panel className={`p-4 ${st.set ? "" : "border-amber/40"}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${st.set ? "bg-emerald-500" : "bg-amber"}`} />
        <span className="text-[12px] font-semibold text-fg">Gateway key (Auto)</span>
        {!st.set && <Badge>Auto cannot generate</Badge>}
      </div>
      <div className="text-[12px] leading-relaxed text-fg-muted">
        {st.set ? (
          <>Using the key ending <code className="font-mono text-fg">{st.hint}</code>, from{" "}
            {st.source === "env" ? <><code className="font-mono">FORGE_TCET_API_KEY</code> in the environment</> : "this panel, stored encrypted"}.
            {st.storedShadowedByEnv && " A key is also stored here; the environment wins, so the stored one is unused."}
          </>
        ) : (
          <>No key is set, so the Auto tier cannot generate for anyone. Paste the operator key — it is encrypted at rest and never read back to this page.</>
        )}
      </div>

      {!st.pepperSet && (
        <div className="mt-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed text-amber">
          <code className="font-mono">FORGE_KEY_PEPPER</code> is not set. Stored keys would be encrypted under the
          published development constant, which is not encryption — hosted mode refuses it outright. Set a real one
          before storing a key on a server.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus type="password" value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) save(); if (e.key === "Escape") setEditing(false); }}
              placeholder="paste the gateway key"
              className="w-72 rounded-lg border border-line bg-sunken px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent"
            />
            <Button size="sm" variant="primary" disabled={busy || !draft.trim()} onClick={save}>{busy ? "Storing…" : "Store"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setDraft(""); }}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant={st.set ? "outline" : "primary"} onClick={() => setEditing(true)}>
              {st.source === "stored" ? "Replace stored key" : "Store a key"}
            </Button>
            {st.source === "stored" && <Button size="sm" variant="outline" disabled={busy} onClick={clear} className="text-danger hover:bg-danger/10">Remove</Button>}
          </>
        )}
      </div>
      {msg && <div className="mt-2 text-[12px] text-fg-muted">{msg}</div>}
      {err && <div className="mt-2 text-[12px] text-danger">{err}</div>}
    </Panel>
  );
}

function Row({ label, ok, detail }) {
  // A failure detail is a sentence from the service, not a word — it wraps
  // rather than being clipped, because the sentence is the whole value.
  // `ok === null` is "no answer yet", which is neither green nor a fault.
  const dot = ok === null ? "bg-fg-faint animate-pulse" : ok ? "bg-emerald-500" : "bg-amber";
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="shrink-0 text-fg">{label}</span>
      <span className="ml-auto min-w-0 text-right text-fg-faint">{detail}</span>
    </div>
  );
}
