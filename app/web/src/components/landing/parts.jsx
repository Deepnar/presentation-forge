/**
 * Landing primitives.
 *
 * Everything here paints from tokens only — no literal colours. The old page
 * mixed `bg-white`, `text-slate-900` and amber-500 into the token surfaces,
 * which is why eighteen of its elements stayed light-on-light once the shell
 * gained a dark mode. A landing section must be legible in both grounds by
 * construction, not by a second pass.
 */

/** A page section: consistent rhythm, and the max width every band shares. */
export function Section({ id, className = "", children, tight = false }) {
  return (
    <section id={id} className={`relative px-5 sm:px-8 ${tight ? "py-16 sm:py-20" : "py-20 sm:py-28"} ${className}`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

/** Small caps label above a heading. */
export function Eyebrow({ children, className = "" }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

/**
 * A section's opening: eyebrow, heading, lede. Kept as one component so the
 * spacing between the three is decided once.
 */
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

/**
 * The card. One shape for the whole page — the previous landing had five
 * different card treatments across its ten beats, which is what made it read
 * as a collection of screenshots rather than one surface.
 */
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

/**
 * A rendered slide.
 *
 * `dark` is measured off the painted pixels at generation time, not read from
 * a palette token — swiss-international declares a white page and renders a
 * near-black cover. The frame needs it because a dark slide on a dark page
 * needs a hairline to separate it from the ground, and a light slide on a
 * light page needs the same for the opposite reason.
 *
 * Width and height are always set: without them the page reflows as each
 * image arrives, which on a scroll-driven layout means every reveal below the
 * image fires at the wrong moment.
 */
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

/** A figure with its number and label, used for the trust row. */
export function Figure({ value, label }) {
  return (
    <div className="reveal">
      <div className="text-[1.6rem] font-semibold tracking-tight text-fg">{value}</div>
      <div className="mt-0.5 text-[12.5px] leading-snug text-fg-faint">{label}</div>
    </div>
  );
}

/** The page's primary and secondary buttons. */
export function CTA({ variant = "primary", className = "", ...props }) {
  const base =
    "press inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-[14px] font-medium transition-colors";
  const kind =
    variant === "primary"
      ? "bg-accent text-on-accent hover:bg-accent-hi"
      : "border border-line-strong bg-panel text-fg hover:bg-hover";
  return <button className={`${base} ${kind} ${className}`} {...props} />;
}
