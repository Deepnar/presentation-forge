import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Badge } from "../components/ui.jsx";
import { Overview, UsersTab, DecksTab, Analytics, SystemTab } from "../components/AdminPanels.jsx";

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
      {tab === "users" && <UsersTab users={users} limits={stats?.limits} onRole={setRole} onDelete={delUser} onClearUsage={clearUsage} onReload={load} />}
      {tab === "decks" && <DecksTab decks={decks} />}
      {tab === "analytics" && <Analytics stats={stats} />}
      {tab === "system" && <SystemTab stats={stats} hosted={hosted} onToggle={toggleHosted} onReload={load} />}
    </div>
  );
}
