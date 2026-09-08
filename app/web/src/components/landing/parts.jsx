
export function Section({ id, className = "", children, tight = false }) {
  return (
    <section id={id} className={`relative px-5 sm:px-8 ${tight ? "py-16 sm:py-20" : "py-20 sm:py-28"} ${className}`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

export function Eyebrow({ children, className = "" }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

export function SectionHead({ eyebrow, title, lede, align = "left", className = "" }) {
  const centred = align === "center";
  return (
    <div className={`${centred ? "mx-auto max-w-2xl text-center" : "max-w-2xl"} ${className}`}>
      {eyebrow && <Eyebrow className="reveal">{eyebrow}</Eyebrow>}
      <h2 className="reveal display-2 mt-3 text-fg" style={{ "--reveal-delay": "60ms" }}>{title}</h2>
      {lede && <p className="reveal lede mt-4" style={{ "--reveal-delay": "120ms" }}>{lede}</p>}
    </div>
  );
}

export function Card({ className = "", children, as: As = "div", interactive = false, ...rest }) {
  return (
    <As
      className={`rounded-panel border border-line bg-panel p-5 shadow-[var(--shadow-card)] ${
        interactive ? "card-hover cursor-pointer text-left" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

export function SlideImage({ src, alt, w = 1200, h = 675, dark = false, className = "", priority = false }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ boxShadow: "var(--shadow-slide)" }}
    >
      <img
        src={src}
        alt={alt}
        width={w}
        height={h}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className="block h-auto w-full"
      />
      {/* A hairline in the slide's own key, so the frame reads on either ground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg"
        style={{ boxShadow: `inset 0 0 0 1px ${dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}` }}
      />
    </div>
  );
}

export function Figure({ value, label }) {
  return (
    <div className="reveal">
      <div className="text-[1.6rem] font-semibold tracking-tight text-fg">{value}</div>
      <div className="mt-0.5 text-[12.5px] leading-snug text-fg-faint">{label}</div>
    </div>
  );
}

export function CTA({ variant = "primary", className = "", ...props }) {
  const base =
    "press inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-[14px] font-medium transition-colors";
  const kind =
    variant === "primary"
      ? "bg-accent text-on-accent hover:bg-accent-hi"
      : "border border-line-strong bg-panel text-fg hover:bg-hover";
  return <button className={`${base} ${kind} ${className}`} {...props} />;
}
