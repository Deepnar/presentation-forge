/** Shared primitives. Kept deliberately small — enough to stop every view
 *  reinventing a button, not a component library. */

export function Button({ variant = "ghost", size = "md", className = "", ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition " +
    "disabled:pointer-events-none disabled:opacity-40";
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
  };
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-hi active:bg-accent",
    ghost: "text-fg-muted hover:bg-hover hover:text-fg",
    outline: "border border-line text-fg-muted hover:border-line-strong hover:text-fg",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

export function Panel({ className = "", ...props }) {
  return (
    <div
      className={`rounded-card border border-line bg-panel ${className}`}
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
    <div className="rounded-card border border-dashed border-line px-8 py-14 text-center">
      <div className="text-sm text-fg-muted">{title}</div>
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
