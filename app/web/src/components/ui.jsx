/** Shared primitives. Kept deliberately small — enough to stop every view
 *  reinventing a button, not a component library. */
import { useState } from "react";

export function Button({ variant = "ghost", size = "md", className = "", ...props }) {
  const base =
    "press inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-[var(--dur-shell)] ease-[var(--ease-shell)] " +
    "disabled:pointer-events-none disabled:opacity-40";
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
  };
  const variants = {
    primary:
      "bg-accent text-white hover:bg-accent-hi active:bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_20px_-10px_rgba(0,0,0,0.7)]",
    ghost: "text-fg-muted hover:bg-hover hover:text-fg",
    outline: "border border-line text-fg-muted hover:border-line-strong hover:text-fg hover:shadow-[0_6px_14px_-10px_rgba(0,0,0,0.6)]",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

export function Panel({ className = "", ...props }) {
  return (
    <div
      className={`panel-surface rounded-card border border-line bg-panel shadow-[var(--shadow-card)] ${className}`}
      {...props}
    />
  );
}

export function Badge({ className = "", ...props }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, value, onChange, placeholder, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1.5 text-[12px] font-medium text-fg-faint">{label}</div>
      <input
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      {hint && <div className="mt-1 text-[12px] text-fg-faint">{hint}</div>}
    </label>
  );
}

export function Empty({ title, hint, action }) {
  return (
    <div className="empty-state rounded-card border border-dashed border-line">
      <div className="empty-ring h-10 w-10">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 14 9 5 9-5" />
        </svg>
      </div>
      <div className="mt-3 text-[15px] font-medium text-fg-muted">{title}</div>
      {hint && <div className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-fg-faint">{hint}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className = "" }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 animate-spin ${className}`} aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M8 1.5A6.5 6.5 0 0 1 14.5 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Skeleton in 16:9, so the grid does not reflow when real slides arrive. */
export function SlideSkeleton() {
  return <div className="skeleton aspect-video rounded-lg" />;
}

export function Kbd({ children }) {
  return (
    <kbd className="rounded border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
      {children}
    </kbd>
  );
}

/** Shared text-input treatment so no view reinvents the field style. The fill
 *  is one step stronger than the panels it sits on and the border one step
 *  stronger than the resting hairline, so a field reads as a control, not a
 *  hole. Focus adds the tint halo (mousers) — keyboard users keep the global
 *  accent outline. */
export const inputCls =
  "w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-[15px] text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent";

/**
 * A styled tooltip that replaces native `title` where the label matters —
 * instant, theme-aware, and the shell's shadow language. Rendered above the
 * child on hover/focus; the label text is passed separately so it can never be
 * read aloud twice by a screen reader.
 */
export function Tooltip({ label, children, side = "top", className = "" }) {
  const [show, setShow] = useState(false);
  const sideCls = side === "bottom"
    ? "top-full left-1/2 mt-1.5 -translate-x-1/2"
    : "bottom-full left-1/2 mb-1.5 -translate-x-1/2";
  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-line-strong bg-panel px-2 py-1 text-[12px] text-fg-muted shadow-[var(--shadow-float)] ${sideCls}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
