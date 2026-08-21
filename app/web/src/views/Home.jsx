import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { Button } from "../components/ui.jsx";
import {
  ChatIcon, DocIcon, GithubIcon, IdIcon, LayersIcon, PaletteIcon, SearchIcon, SparkleIcon,
} from "../components/icons.jsx";

/**
 * Fancy tour — fully animated, no pinned split.
 * Hero scrolls and fades like every other section; the pipeline is the story,
 * each step paired with its slide specimen so the "ppt stuff fits in that only".
 * Every block reveals on IO with the shell easing, never a bare opacity jump.
 * Eye-catching tagline: "Topic in. Standing ovation out."
 */
export default function Home({ user, onStartChat, onBrowseThemes, onAuth }) {
  const authed = Boolean(user);
  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 sm:px-10">
      <HeroFancy
        authed={authed}
        onStartChat={onStartChat}
        onBrowseThemes={onBrowseThemes}
        onAuth={onAuth}
      />
      <PipelineScrolly />
      <HowItWorksFancy onStartChat={authed ? onStartChat : () => onAuth?.("register")} />
      <ThemeCarouselFancy onBrowseThemes={authed ? onBrowseThemes : () => onAuth?.("register")} />
      <LocalVsCloudFancy />
      <CapabilityGridFancy onStartChat={authed ? onStartChat : () => onAuth?.("register")} />
      <FinalCTA onStartChat={authed ? onStartChat : () => onAuth?.("register")} />
      <FooterStrip />
    </div>
  );
}

/* ------------------------------------------------------------- scroll-reveal */

function Reveal({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setSeen(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
      },
      { threshold: 0.14 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} className={`${seen ? "view-in" : "opacity-0"} ${className}`} style={seen && delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------------- hero */

function HeroFancy({ authed, onStartChat, onBrowseThemes, onAuth }) {
  const [phase, setPhase] = useState(false);
  useEffect(() => { const t = setTimeout(() => setPhase(true), 80); return () => clearTimeout(t); }, []);
  return (
    <div className={`relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-b from-accent-tint/40 via-panel to-panel shadow-[var(--shadow-card)] ${phase ? "view-in" : "opacity-0"}`}>
      {/* fancy background: two gradient orbs + grid */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 left-1/2 h-[42rem] w-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-accent-tint),transparent_72%)] opacity-70" />
        <div className="absolute -bottom-40 -right-40 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgba(124,108,255,0.14),transparent_70%)] blur-[1px]" />
        <div className="absolute inset-0 opacity-[0.09] [background:linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative px-6 py-12 sm:px-10 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              Bulk by machine, polish by you
            </span>
          </div>
          <img src="/logo.svg" alt="" className="mx-auto mt-6 h-16 w-16 rounded-2xl shadow-[0_20px_40px_-20px_rgba(0,0,0,0.15)] ring-1 ring-line" />
          <h1 className="mx-auto mt-6 max-w-[18ch] text-[3.1rem] font-semibold leading-[0.95] tracking-[-0.035em] text-fg sm:text-[3.8rem]">
            Topic in.
            <br />
            <span className="bg-gradient-to-r from-accent via-[#8B5CF6] to-[#7C6CFF] bg-clip-text text-transparent">Standing ovation out.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">
            The app does the bulk — research, outline, grounded content, render and critique. You verify the facts, tune the words and make it yours. No templates, no hand-layout.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" onClick={authed ? onStartChat : () => onAuth?.("register")}>
              <ChatIcon className="h-4 w-4" />
              Start a chat
            </Button>
            <button
              onClick={authed ? onBrowseThemes : () => onAuth?.("register")}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-4 py-2.5 text-[13px] font-medium text-fg-muted shadow-sm transition hover:border-line-strong hover:text-fg"
            >
              <PaletteIcon className="h-4 w-4" />
              Browse 38 themes
            </button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[12px] text-fg-faint">
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Local-first</span>
            <span>·</span>
            <span>50+ slide types</span>
            <span>·</span>
            <span>Graded .docx reports</span>
          </div>
        </div>

        {/* floating mini deck stack — decorative, not layout code */}
        <div className="pointer-events-none relative mx-auto mt-10 hidden max-w-4xl select-none sm:block">
          <div className="relative mx-auto h-[168px] max-w-[660px]">
            <div className="absolute left-1/2 top-2 h-[132px] w-[220px] -translate-x-1/2 rotate-[-2deg] rounded-xl border border-line bg-panel p-3 shadow-[var(--shadow-card)]">
              <div className="h-2 w-12 rounded-full bg-accent/20" />
              <div className="mt-2 h-1.5 w-3/4 rounded-full bg-line" />
              <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-line" />
              <div className="mt-4 flex gap-1.5">
                <div className="h-12 flex-1 rounded-lg bg-accent-tint" />
                <div className="h-12 flex-1 rounded-lg bg-sunken" />
                <div className="h-12 flex-1 rounded-lg bg-sunken" />
              </div>
            </div>
            <div className="absolute left-[8%] top-6 hidden h-[120px] w-[200px] rotate-[-6deg] rounded-xl border border-line bg-panel p-3 opacity-70 shadow-[var(--shadow-card)] md:block">
              <div className="h-2 w-10 rounded-full bg-accent/15" />
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-full rounded-full bg-line" />
                <div className="h-1.5 w-5/6 rounded-full bg-line" />
                <div className="h-1.5 w-3/4 rounded-full bg-line" />
              </div>
            </div>
            <div className="absolute right-[8%] top-6 hidden h-[120px] w-[200px] rotate-[5deg] rounded-xl border border-line bg-panel p-3 opacity-70 shadow-[var(--shadow-card)] md:block">
              <div className="flex items-end gap-1 h-16">
                <div className="flex-1 rounded-sm bg-accent" style={{ height: "48%" }} />
                <div className="flex-1 rounded-sm bg-accent/70" style={{ height: "72%" }} />
                <div className="flex-1 rounded-sm bg-accent/50" style={{ height: "100%" }} />
              </div>
              <div className="mt-2 h-1.5 w-1/2 rounded-full bg-line" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1 text-[11px] text-fg-faint backdrop-blur">
            Scroll to see the pipeline — it scrolls and fades with you
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pipeline scrolly */

const PIPELINE = [
  { icon: ChatIcon, label: "brief", title: "One question at a time", desc: "Topic → title → team → theme → density. Defaults unless you say otherwise. Saved formats skip the fixed parts.", mock: "bullets" },
  { icon: SearchIcon, label: "research", title: "Research that researches", desc: "5–8 angle queries + follow-ups, arXiv & Crossref, source-diversity guard. Your notes stay editable — grounding checks every claim.", mock: "stats" },
  { icon: LayersIcon, label: "outline", title: "Outline you can edit", desc: "Plain-language cards: reorder, switch type, rewrite purpose. Nothing renders until a human says go — the disk gate.", mock: "agenda" },
  { icon: SparkleIcon, label: "you approve", title: "You’re the gate", desc: "Preset-free structure. A planned deck is meta+plan with no deck.yaml — unapprovable by construction.", mock: "quote" },
  { icon: DocIcon, label: "content", title: "Content, grounded & coherent", desc: "One small-grammar call per slide from your notes. Coherence pass reframes drift; density sweep keeps fonts readable, never 8pt.", mock: "compare" },
  { icon: LayersIcon, label: "render", title: "Render — deterministic", desc: "38 themes × styles, chrome locked after theme. pptxgenjs stays editable; plate themes add mesh gradients via Chrome raster.", mock: "chart" },
  { icon: SparkleIcon, label: "critique", title: "Vision critique loop", desc: "Rendered PNGs are inspected; floor flags instead of shrinking. Fix is less text — the badge tells you which slide.", mock: "timeline" },
];

function PipelineScrolly() {
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number(e.target.dataset.idx);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        });
      },
      { threshold: 0.55, rootMargin: "-12% 0px -42% 0px" }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <Reveal className="pt-12">
      <SectionHead eyebrow="The pipeline" title="How a topic becomes a deck" />
      <p className="mx-auto -mt-2 max-w-xl pb-8 text-center text-[14px] leading-relaxed text-fg-muted">
        Each scroll step pairs a pipeline stage with the slide type it produces — the ppt specimens live inside the flow, not as a separate showcase.
      </p>
      <div className="relative">
        {/* vertical line */}
        <div className="pointer-events-none absolute left-1/2 top-2 hidden h-[calc(100%-16px)] w-px -translate-x-1/2 bg-line md:block" />
        <div
          className="pointer-events-none absolute left-1/2 top-2 hidden w-px -translate-x-1/2 bg-accent transition-all duration-700 md:block"
          style={{ height: `calc(${(active + 1) / PIPELINE.length * 100}% - 16px)` }}
        />
        <div className="space-y-6">
          {PIPELINE.map(({ icon: Icon, label, title, desc, mock }, i) => (
            <div
              key={label}
              ref={(el) => (refs.current[i] = el)}
              data-idx={i}
              className={`group relative grid grid-cols-1 gap-4 md:grid-cols-[1fr_40px_1fr] md:items-center ${i % 2 === 1 ? "md:[&>*:first-child]:order-3 md:[&>*:last-child]:order-1" : ""}`}
            >
              {/* text side */}
              <div className={`rounded-2xl border bg-panel p-5 shadow-[var(--shadow-card)] transition ${active === i ? "border-accent/30 shadow-[var(--shadow-card-hover)]" : "border-line"}`}>
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-full border text-[11px] font-bold uppercase tracking-wider ${label === "you approve" ? "border-accent bg-accent text-white" : active === i ? "border-accent/30 bg-accent-tint text-accent" : "border-line bg-sunken text-fg-muted"}`}>
                    {label === "you approve" ? "✓" : String(i + 1)}
                  </span>
                  <span className={`text-[11px] font-semibold uppercase tracking-[0.10em] ${label === "you approve" ? "text-accent" : active === i ? "text-accent" : "text-fg-faint"}`}>{label}</span>
                </div>
                <div className="mt-3 text-[16px] font-semibold tracking-tight text-fg">{title}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{desc}</p>
              </div>

              {/* center dot */}
              <div className="hidden place-items-center md:grid">
                <span className={`grid h-9 w-9 place-items-center rounded-full border bg-panel shadow-sm transition ${active === i ? "border-accent bg-accent text-white scale-110" : label === "you approve" ? "border-accent bg-accent-tint text-accent" : "border-line bg-panel text-fg-muted"}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>

              {/* mock slide */}
              <div className={`overflow-hidden rounded-2xl border bg-panel shadow-[var(--shadow-card)] transition ${active === i ? "border-accent/30 -translate-y-0.5 shadow-[var(--shadow-card-hover)]" : "border-line"}`}>
                <MockSlide type={mock} active={active === i} />
                <div className="flex items-center justify-between border-t border-line bg-sunken px-3 py-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">{mock}</span>
                  <span className={`h-2 w-2 rounded-full ${active === i ? "bg-accent animate-pulse" : "bg-line-strong"}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

function MockSlide({ type, active }) {
  // tiny themed mocks — no network, no specimen API, works for visitors
  const wrap = "flex h-[154px] flex-col justify-center p-4";
  switch (type) {
    case "bullets":
      return (
        <div className={wrap}>
          <div className="text-[12px] font-semibold tracking-tight text-fg">Why this matters</div>
          <div className="mt-2 space-y-1.5">
            {["Grounded claims from your notes", "Coherent framing per section", "One idea per slide"].map((t) => (
              <div key={t} className="flex items-start gap-2 text-[12px] leading-snug text-fg-muted"><span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${active ? "bg-accent" : "bg-line-strong"}`} />{t}</div>
            ))}
          </div>
        </div>
      );
    case "stats":
      return (
        <div className={`${wrap} gap-3`}>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["128%", "more recall"],
              ["3.2×", "faster review"],
              ["0", "invented facts"],
            ].map(([v, l]) => (
              <div key={v} className="text-center">
                <div className="text-[18px] font-extrabold tracking-tight text-fg">{v}</div>
                <div className="text-[11px] text-fg-faint">{l}</div>
              </div>
            ))}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
            <div className={`h-full rounded-full bg-accent transition-all duration-700 ${active ? "w-[78%]" : "w-[52%]"}`} />
          </div>
        </div>
      );
    case "chart":
      return (
        <div className={wrap}>
          <div className="text-[12px] font-semibold text-fg">Trend you can verify</div>
          <div className="mt-3 flex items-end gap-1.5 h-16">
            {[40, 62, 48, 84, 66].map((h, i) => (
              <div key={i} className={`flex-1 rounded-t-md transition-all duration-700 ${i === 3 ? "bg-accent" : "bg-accent/35"}`} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <div className="h-1.5 w-12 rounded-full bg-line" />
            <div className="h-1.5 w-10 rounded-full bg-line" />
          </div>
        </div>
      );
    case "compare":
      return (
        <div className={`${wrap} gap-2`}>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-accent-tint p-2.5">
              <div className="text-[11px] font-semibold text-accent">Before</div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-accent/20" />
              <div className="mt-1 h-1.5 w-3/4 rounded-full bg-accent/20" />
            </div>
            <div className="rounded-lg bg-sunken p-2.5">
              <div className="text-[11px] font-semibold text-fg">After</div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-line" />
              <div className="mt-1 h-1.5 w-3/4 rounded-full bg-line" />
            </div>
          </div>
          <div className="text-center text-[11px] text-fg-faint">Side-by-side keeps the point honest</div>
        </div>
      );
    case "agenda":
      return (
        <div className={wrap}>
          <div className="rounded-lg border border-line bg-sunken p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint">Section 02</div>
            <div className="mt-1 text-[14px] font-semibold text-fg">The argument in three parts</div>
            <div className="mt-2 flex gap-1.5">
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">01</span>
              <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold text-fg-faint">02</span>
              <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold text-fg-faint">03</span>
            </div>
          </div>
        </div>
      );
    case "quote":
      return (
        <div className={`${wrap} items-center text-center`}>
          <div className="mx-auto h-6 w-6 rounded-full bg-accent-tint grid place-items-center text-accent">“</div>
          <div className="mt-2 text-[13px] font-medium leading-snug text-fg">Nothing renders until a human says go.</div>
          <div className="mt-1 text-[11px] text-fg-faint">— the gate, not a preset</div>
        </div>
      );
    case "timeline":
      return (
        <div className={wrap}>
          <div className="relative flex items-center justify-between">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-line" />
            {["Brief", "Outline", "Render"].map((k) => (
              <span key={k} className={`relative grid h-7 w-7 place-items-center rounded-full border text-[10px] font-bold ${k === "Render" && active ? "border-accent bg-accent text-white" : "border-line bg-panel text-fg-faint"}`}>•</span>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-fg-faint">
            <span>Brief</span><span>Outline</span><span>Render</span>
          </div>
        </div>
      );
    default:
      return <div className={wrap}><div className="h-1.5 w-3/4 rounded-full bg-line" /></div>;
  }
}

/* --------------------------------------------------------------- how it works fancy */

function HowItWorksFancy({ onStartChat }) {
  const steps = [
    { icon: ChatIcon, title: "Guided briefing", body: "One question at a time — theme, density, team, audience. Everything has a default; saved formats skip the fixed parts." },
    { icon: LayersIcon, title: "Outline gate", body: "Plain-language cards you can reorder, retitle, retype. Approve to write; regenerate to rethink." },
    { icon: DocIcon, title: "Deck + report, then yours", body: "Same research powers slides and the graded .docx. Slides rasterise immediately — what you see is the output." },
  ];
  return (
    <Reveal className="pt-14">
      <SectionHead eyebrow="How it works" title="Bulk by machine, polish by you" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="card-hover panel-surface rounded-2xl border border-line bg-panel p-6" style={{ ["--stagger-i"]: i }}>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-tint text-accent">
              <Icon className="h-5 w-5" />
            </div>
            <div className="mt-4 text-[18px] font-semibold tracking-tight text-fg">{title}</div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 text-center">
        <button onClick={onStartChat} className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-4 py-2 text-[13px] text-fg-muted transition hover:border-line-strong hover:text-fg">
          Start the first chat →
        </button>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------ theme showcase fancy */

function ThemeCarouselFancy({ onBrowseThemes }) {
  const [themes, setThemes] = useState(null);
  useEffect(() => {
    api.themes().then((r) => setThemes(r.themes)).catch(() => setThemes([]));
  }, []);
  return (
    <Reveal className="pt-14">
      <SectionHead eyebrow="Design languages" title="Thirty-eight themes, drawn live" />
      <p className="mx-auto -mt-1 max-w-xl pb-6 text-center text-[14px] leading-relaxed text-fg-muted">
        Each card renders from its own tokens — what you see is exactly what a deck gets. Full editorial grid at <a href="#/tour-themes" className="text-accent hover:underline">Tour → Themes</a>.
      </p>
      {themes === null && (
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[220px] w-64 shrink-0 rounded-2xl" />)}
        </div>
      )}
      {themes?.length > 0 && (
        <div className="scroll-smooth snap-x snap-mandatory overflow-x-auto pb-3 [scrollbar-width:thin] [scrollbar-color:var(--color-line-strong)_transparent] px-1" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-line-strong) transparent" }}>
          <div className="flex w-max gap-4 snap-x px-1">
            {themes.slice(0, 12).map((t, i) => (
              <div key={t.name} className="w-64 shrink-0 snap-start" style={{ ["--stagger-i"]: i }}>
                <ThemeMiniCard theme={t} onClick={() => onBrowseThemes?.(t.name)} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button onClick={() => onBrowseThemes?.()} className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-4 py-2 text-[13px] text-fg-muted transition hover:border-line-strong hover:text-fg">
          Browse all themes
        </button>
        <a href="#/tour-themes" className="inline-flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-hi">
          Editorial showcase
        </a>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------- local vs cloud fancy */

function LocalVsCloudFancy() {
  return (
    <Reveal className="pt-14">
      <SectionHead eyebrow="Free or bring your own" title="Auto or Cloud — your call" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-accent/20 bg-gradient-to-b from-accent-tint/60 to-panel p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2.5">
            <span className="pill border border-accent-dim/60 bg-accent-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">AUTO</span>
            <span className="text-[12px] text-fg-faint">Free shared model</span>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
            Start instantly — no key, no setup. Rate-limited so everyone gets a fair share.
          </p>
          <ul className="mt-4 space-y-2">
            {["No key needed", "Hourly & weekly caps", "Great for trying out"].map((s) => (
              <li key={s} className="flex items-center gap-2 text-[13px] text-fg-muted">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2.5">
            <span className="pill border border-line-strong bg-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg">CLOUD</span>
            <span className="text-[12px] text-fg-faint">Your own key</span>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
            Bring your own API key — unlimited, billed to you. The same pipeline, just with your quota. Encrypted at rest.
          </p>
          <ul className="mt-4 space-y-2">
            {["Unlimited generations", "Your quota, your billing", "Encrypted at rest"].map((s) => (
              <li key={s} className="flex items-center gap-2 text-[13px] text-fg-muted">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}

/* ----------------------------------------------------------- capability grid fancy */

const CAPABILITIES = [
  { icon: LayersIcon, title: "50+ slide types", body: "Bullets, cards, compare, stats, timelines, testimonials — a full vocabulary, not a template." },
  { icon: SearchIcon, title: "Research that researches", body: "Multi-angle search plus arXiv and Crossref, source-diversity scoring, claim cross-checking." },
  { icon: DocIcon, title: "Graded-format reports", body: "The institutional .docx donor, Word-page previews, one-click render and download." },
  { icon: SparkleIcon, title: "Vision critique loop", body: "Rendered slides are inspected and re-rendered until the text fits and nothing overlaps." },
  { icon: LayersIcon, title: "Versions & undo", body: "Every save snapshots deck.yaml; the version history is one restore away." },
  { icon: IdIcon, title: "Your final touches", body: "An approvable outline, editable content, chat refinement — the machine drafts, you make it yours." },
];

function CapabilityGridFancy({ onStartChat }) {
  return (
    <Reveal className="pt-14">
      <SectionHead eyebrow="Capabilities" title="Everything a deck needs" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="card-hover panel-surface rounded-2xl border border-line bg-panel p-5" style={{ ["--stagger-i"]: i }}>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-tint text-accent">
              <Icon className="h-4 w-4" />
            </div>
            <div className="mt-3 text-[16px] font-semibold tracking-tight text-fg">{title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{body}</p>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

function FinalCTA({ onStartChat }) {
  return (
    <Reveal className="pt-14">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-accent/20 bg-gradient-to-br from-accent via-[#6D5BFF] to-[#8B5CF6] p-8 text-white shadow-[var(--shadow-card)] sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Ready?</div>
            <div className="mt-1 text-[1.7rem] font-semibold tracking-[-0.02em] leading-tight">Topic in. Standing ovation out.</div>
            <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-white/80">Start a chat — the briefing is one question at a time, everything else defaults.</p>
          </div>
          <button onClick={onStartChat} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-accent shadow-sm transition hover:bg-white/90">
            <ChatIcon className="h-4 w-4" />
            Start a chat
          </button>
        </div>
      </div>
    </Reveal>
  );
}

/* ---------------------------------------------------------------- footer */

function FooterStrip() {
  return (
    <footer className="mt-12 border-t border-line pt-8">
      <div className="grid grid-cols-2 gap-8 text-[13px] sm:grid-cols-4">
        <div>
          <div className="text-[12px] font-semibold tracking-tight">Product</div>
          <div className="mt-2 flex flex-col gap-1.5 text-fg-muted">
            <a href="#/home" className="hover:text-fg">Tour</a>
            <a href="#/tour-themes" className="hover:text-fg">Themes</a>
            <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
          </div>
        </div>
        <div>
          <div className="text-[12px] font-semibold tracking-tight">Resources</div>
          <div className="mt-2 flex flex-col gap-1.5 text-fg-muted">
            <a href="#/docs" className="hover:text-fg">Docs</a>
            <a href="#/home" className="hover:text-fg">How it works</a>
          </div>
        </div>
        <div>
          <div className="text-[12px] font-semibold tracking-tight">Legal</div>
          <div className="mt-2 flex flex-col gap-1.5 text-fg-muted">
            <a href="#/privacy" className="hover:text-fg">Privacy Policy</a>
            <a href="#/terms" className="hover:text-fg">Terms of Service</a>
            <a href="#/contact" className="hover:text-fg">Contact</a>
          </div>
        </div>
        <div>
          <div className="text-[12px] font-semibold tracking-tight">Presentation Forge</div>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">Local-first when you want it, cloud when you need it. Your decks, your data.</p>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-[12px] text-fg-faint sm:flex-row">
        <span>© {new Date().getFullYear()} Presentation Forge. MIT for code.</span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-success" /> All systems operational
        </span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ helpers */

function SectionHead({ eyebrow, title }) {
  return (
    <div className="mb-6 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">{eyebrow}</div>
      <h2 className="mt-1 text-[2rem] font-semibold tracking-[-0.015em] text-fg">{title}</h2>
    </div>
  );
}
