/** Shared primitives. Kept deliberately small — enough to stop every view
 *  reinventing a button, not a component library. */

export function Button({ variant = "ghost", size = "md", className = "", ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 " +
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-40";
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
      className={`panel-surface rounded-card border border-line bg-panel ${className}`}
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
      <div className="mb-1.5 text-[11px] font-medium text-fg-faint">{label}</div>
      <input
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent"
      />
      {hint && <div className="mt-1 text-[11px] text-fg-faint">{hint}</div>}
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
      <div className="mt-3 text-sm font-medium text-fg-muted">{title}</div>
      {hint && <div className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-fg-faint">{hint}</div>}
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

/** Shared text-input treatment so no view reinvents the field style. */
export const inputCls =
  "w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent";
