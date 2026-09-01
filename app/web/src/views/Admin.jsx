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
            {stats?.users?.total != null && <Badge className="bg-raised text-fg-faint">{stats.users.total} users · {stats.decks.total} decks</Badge>}
          </div>
          <div className="text-[12px] text-fg-faint">RBAC for the seeded operator + any promoted admin · switch hosted/local here for testing · full PPT + system stats</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
          {onBack && <Button size="sm" variant="outline" onClick={onBack}>Back to chats</Button>}
          <Button size="sm" variant={hosted ? "outline" : "primary"} onClick={toggleHosted} title="Flip hosted/local for testing">
            {hosted ? "Switch to local" : "Switch to hosted"}
          </Button>
        </div>
      </header>

      <div className="flex gap-1.5">
        {["overview","users","decks","analytics","system"].map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`pill px-3 py-1.5 text-[12px] font-medium capitalize transition ${tab===k ? "bg-accent text-on-accent" : "bg-panel text-fg-muted hover:bg-hover hover:text-fg"}`}>{k}</button>
        ))}
      </div>

      {tab === "overview" && <Overview stats={stats} hosted={hosted} />}
      {tab === "users" && <UsersTab users={users} onRole={setRole} onDelete={delUser} />}
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
        <StatCard label="Storage" value={`${(s.decks.size/1024/1024).toFixed(1)} MB`} sub={`${s.decks.total} decks on disk`} />
        <StatCard label="Model calls" value={s.usage.totalRequests} sub={`${s.usage.totalSlides} slides · ${(s.usage.totalTokens/1000).toFixed(0)}k tokens`} />
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
      <Panel className="p-4">
        <div className="mb-2 text-[12px] font-semibold text-fg">Hosted vs local</div>
        <div className="text-[12px] leading-relaxed text-fg-muted">Hosted = <code className="font-mono">FORGE_HOSTED=1</code> — Auto is Forge only + BYOK. Local = Auto falls back to Ollama at <code className="font-mono">localhost:11434</code>. Toggle above flips <code className="font-mono">config/hosted.json</code> at runtime for testing (env wins on next deploy).</div>
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

function UsersTab({ users, onRole, onDelete }) {
  const [q, setQ] = useState("");
  const filtered = users.filter((u) => !q || u.email.toLowerCase().includes(q.toLowerCase()) || u.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-[12px] font-semibold text-fg">Users · {users.length}</div>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search email/name…" className="ml-auto w-52 rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[12px] outline-none placeholder:text-fg-faint focus:border-accent" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[11px] uppercase tracking-wider text-fg-faint">
            <tr><th className="px-2 py-1.5">Email</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Role</th><th className="px-2 py-1.5">Created</th><th className="px-2 py-1.5">Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.email} className="border-t border-line/60 hover:bg-hover/50">
                <td className="px-2 py-2 font-mono text-[11.5px] text-fg">{u.email}</td>
                <td className="px-2 py-2 text-fg-muted">{u.name}</td>
                <td className="px-2 py-2">{u.admin ? <Badge className="bg-accent/10 text-accent">admin</Badge> : <span className="text-fg-faint">user</span>}</td>
                <td className="px-2 py-2 text-fg-faint">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}{u.google ? " · google" : ""}</td>
                <td className="px-2 py-2">
                  <span className="flex gap-1">
                    {u.admin ? (
                      <Button size="sm" variant="outline" onClick={() => onRole(u.email, "user")}>Remove admin</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onRole(u.email, "admin")}>Make admin</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onDelete(u.email)} className="text-danger hover:bg-danger/10">Delete</Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-fg-faint">RBAC: role is <code className="font-mono">admin</code> or none (user). <code className="font-mono">FORGE_ADMIN_EMAIL</code> is seeded or promoted at boot, never granted by the address itself — registration does not verify email. Promote any account here.</div>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Requests (all time)" value={stats.usage.totalRequests} sub="auto_events" />
        <StatCard label="Slides generated" value={stats.usage.totalSlides} />
        <StatCard label="Tokens" value={`${(stats.usage.totalTokens/1000).toFixed(0)}k`} />
        <StatCard label="Limits" value={`${stats.limits.windowRequests}/${stats.limits.windowHours}h`} sub={`${stats.limits.weeklyRequests}/week · ${stats.limits.maxSlidesPerDeck}/deck`} />
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
        <div className="mb-2 text-[12px] font-semibold text-fg">Limits (env-overridable)</div>
        <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3">
          {Object.entries(stats.limits ?? {}).map(([k,v]) => (
            <div key={k} className="rounded-lg bg-sunken px-2.5 py-1.5"><span className="font-mono text-[11px] text-fg-faint">{k}</span><span className="float-right font-medium text-fg">{String(v)}</span></div>
          ))}
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
      <RolePanel audit={stats.system.roles} />
      <Panel className="p-4">
        <div className="mb-2 text-[12px] font-semibold text-fg">Website mode — hosted ↔ local</div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${hosted ? "bg-amber/15 text-amber" : "bg-emerald-500/10 text-emerald-600"}`}>{hosted ? "HOSTED — Forge + BYOK only" : "LOCAL — Ollama fallback on"}</span>
          <Button size="sm" variant="outline" onClick={onToggle}>{hosted ? "Switch to local (test)" : "Switch to hosted"}</Button>
          <span className="text-[11px] text-fg-faint">Writes <code className="font-mono">config/hosted.json</code> — no restart, env still wins on deploy.</span>
        </div>
      </Panel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-2 text-[12px] font-semibold text-fg">Backends</div>
          <div className="space-y-1.5 text-[12px]">
            <Row label="Forge Auto" ok={stats.system.tcetOk} detail={stats.system.tcetOk ? "keySet" : "no key"} />
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

function Row({ label, ok, detail }) {
  return <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber"}`} /><span className="text-fg">{label}</span><span className="ml-auto text-fg-faint">{detail}</span></div>;
}
