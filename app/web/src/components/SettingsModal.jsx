import { useEffect } from "react";
import { GearIcon } from "./icons.jsx";
import { AppearanceSection, PresetsSection, IdentitySection, HostedSection } from "./SettingsSections.jsx";

export default function SettingsModal({ open, onClose, identity, user, isAdmin, onIdentityChanged }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fade-in fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] p-4 backdrop-blur-md"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fade-in flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-panel shadow-[var(--shadow-float)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent">
            <GearIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold tracking-tight text-fg">Settings</div>
            <div className="text-[11.5px] text-fg-faint">
              Saved formats, identity and brand — how you work.
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
          <AppearanceSection />
          <PresetsSection />
          <IdentitySection identity={identity} onIdentityChanged={onIdentityChanged} />
          {isAdmin && <HostedSection />}
        </div>
      </div>
    </div>
  );
}
