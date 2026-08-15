import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ConfirmModal } from "./ui.jsx";

/**
 * The profile entry, bottom-left in the sidebar. A chip (avatar + name, or
 * avatar-only in the collapsed rail) opens a CENTERED modal: the personal
 * context the AI uses (name, email, institution, guide, team), the account
 * actions (logout behind the shared confirm), and the cloud status. This is
 * the same identity the briefing pre-fills from and that flows into the AI's
 * context — what is shown here is what the machine drafts for.
 */
export default function ProfileChip({ user, identity, onOpenIdentity, onLogout, collapsed = false }) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [cloud, setCloud] = useState(null);

  useEffect(() => {
    if (open) api.cloud().then((r) => setCloud(r.cloud ?? null)).catch(() => setCloud(null));
  }, [open]);

  const acad = identity?.academic ?? {};
  const guide = identity?.guide ?? {};
  const team = identity?.team ?? {};
  const members = (team?.members ?? []).filter((m) => m.name?.trim());
  const name = user?.name ?? identity?.institution?.short ?? "Account";

  return (
    <>
      {collapsed ? (
        <button
          onClick={() => setOpen(true)}
          title="Profile and settings"
          className="grid h-8 w-8 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold uppercase text-accent transition hover:bg-accent/25"
        >
          {name[0] ?? "?"}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-hover"
          title="Profile, settings and your AI's context"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold uppercase text-accent">
            {name[0] ?? "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-fg">{name}</span>
            <span className="block truncate text-[10px] text-fg-faint">
              {identity?.institution?.short || "your AI context"}
            </span>
          </span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] p-6 backdrop-blur-md"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="fade-in w-full max-w-md rounded-[var(--radius-lg)] border border-line bg-panel p-6 shadow-[var(--shadow-float)]">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-[14px] font-semibold uppercase text-accent">
                {name[0] ?? "?"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-fg">{name}</div>
                <div className="truncate text-[12px] text-fg-muted">{user?.email}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mt-5">
              <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">
                Your context — what the AI drafts from
              </div>
              <div className="space-y-1.5">
                <ProfileRow label="Institution" value={identity?.institution?.short || identity?.institution?.name} />
                <ProfileRow label="Guide" value={guide.name ? [guide.name, guide.designation].filter(Boolean).join(", ") : ""} />
                <ProfileRow label="Team" value={members.length ? `${members.length} member${members.length === 1 ? "" : "s"}${team.label ? ` · ${team.label}` : ""}` : ""} />
                <ProfileRow label="Subject" value={acad.subject} />
                <ProfileRow label="Year" value={acad.year} />
              </div>
              <button
                onClick={() => { setOpen(false); onOpenIdentity?.(); }}
                className="mt-2.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] text-fg-muted transition hover:bg-hover hover:text-fg"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" /></svg>
                Edit in Identity
              </button>
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">Cloud</div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-fg-muted">
                  {cloud?.keySet
                    ? `${cloud.label ?? "Hosted models"} — connected`
                    : cloud?.configured
                      ? "No API key attached yet"
                      : "No cloud provider configured"}
                </span>
                {cloud?.keySet && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    {cloud.models?.length ?? 0} models
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
              <button
                onClick={() => setConfirmLogout(true)}
                className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 active:translate-y-px"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmLogout && (
        <ConfirmModal
          title="Log out of Presentation Forge?"
          body="Your work is saved — decks, reports and chats stay on this machine. Sign back in any time to continue where you left off."
          confirmLabel="Log out"
          danger
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => { setConfirmLogout(false); setOpen(false); onLogout(); }}
        />
      )}
    </>
  );
}

function ProfileRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-sunken px-2.5 py-1.5">
      <span className="shrink-0 text-[11px] text-fg-faint">{label}</span>
      <span className="min-w-0 truncate text-right text-[12.5px] text-fg">{value}</span>
    </div>
  );
}
