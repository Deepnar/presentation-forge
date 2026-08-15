/**
 * The settings entry, bottom-left in the sidebar. A chip (avatar + name, or
 * avatar-only in the collapsed rail) opens the Settings modal — the ONE
 * management surface: account + cloud, saved briefing formats (presets) and
 * the long-term identity facts (institution, guide). The modal itself lives
 * in SettingsModal.jsx, rendered by the shell so the sidebar's Settings row
 * opens the same surface.
 */
export default function ProfileChip({ user, identity, onOpenSettings, collapsed = false }) {
  const name = user?.name ?? identity?.institution?.short ?? "Account";

  if (collapsed) {
    return (
      <button
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Settings"
        className="grid h-8 w-8 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold uppercase text-accent transition hover:bg-accent/25"
      >
        {name[0] ?? "?"}
      </button>
    );
  }

  return (
    <button
      onClick={onOpenSettings}
      className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-hover"
      title="Settings — presets, identity and your AI's context"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold uppercase text-accent">
        {name[0] ?? "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-fg">{name}</span>
        <span className="block truncate text-[10px] text-fg-faint">
          {identity?.institution?.short || "settings"}
        </span>
      </span>
    </button>
  );
}
