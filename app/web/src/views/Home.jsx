import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { Button } from "../components/ui.jsx";
import {
  ChatIcon, DocIcon, GithubIcon, IdIcon, LayersIcon, PaletteIcon, SearchIcon, SparkleIcon,
} from "../components/icons.jsx";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

/**
 * Immersive tour — full-bleed, not middle-locked.
 * Hero is one Register CTA (unauth) / Go to chat (authed), then every section
 * animates across the viewport on scroll (slide-in from left/right + scale),
 * pipeline steps are pinned-style stages with real theme specimens.
 * No local-first copy — product is hosted.
 */
export default function Home({ user, onStartChat, onBrowseThemes, onAuth }) {
  const authed = Boolean(user);
  const handleChat = () => onStartChat?.();
  const rootRef = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      // entire tour as one scrubbed slideshow — pin and scrub like landonorris
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "+=450%",
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });
      // hero fades out as pipeline comes in
      tl.to(".hero-section", { y: -80, opacity: 0, ease: "none" }, 0);
      tl.fromTo(".pipeline-section", { y: 80, opacity: 0 }, { y: 0, opacity: 1, ease: "none" }, 0.12);
      tl.fromTo(".demo-section", { y: 100, opacity: 0 }, { y: 0, opacity: 1, ease: "none" }, 0.28);
      tl.fromTo(".how-section", { y: 80, opacity: 0 }, { y: 0, opacity: 1, ease: "none" }, 0.42);
      tl.fromTo(".themes-section", { y: 80, opacity: 0 }, { y: 0, opacity: 1, ease: "none" }, 0.56);
      tl.fromTo(".plans-section", { y: 80, opacity: 0 }, { y: 0, opacity: 1, ease: "none" }, 0.70);
      tl.fromTo(".capability-section", { y: 80, opacity: 0 }, { y: 0, opacity: 1, ease: "none" }, 0.84);
      tl.fromTo(".final-cta-section", { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, ease: "none" }, 0.94);
      // parallax orbs within hero
      gsap.fromTo(".hero-orb-1", { y: 0 }, { y: -80, ease: "none", scrollTrigger: { trigger: ".hero-section", start: "top top", end: "bottom top", scrub: 1 } });
      gsap.fromTo(".hero-orb-2", { y: 0 }, { y: -120, ease: "none", scrollTrigger: { trigger: ".hero-section", start: "top top", end: "bottom top", scrub: 1 } });
    }, rootRef);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={rootRef} className="w-full">
      <HeroFull authed={authed} onStartChat={handleChat} onAuth={onAuth} />
      <PipelineImmersive />
      <LiveDemoScrolly onAuth={onAuth} authed={authed} />
      <HowItWorksFull onStartChat={handleChat} />
      <ThemesFullBleed onBrowseThemes={onBrowseThemes} />
      <PlansFull />
      <CapabilityFull onStartChat={handleChat} />
      <FinalCTAFull onStartChat={handleChat} />
      <FooterFull />
    </div>
  );
}

/* ------------------------------------------------------------- reveal helpers */

function useReveal(threshold = 0.18) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setSeen(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen];
}

function SlideIn({ children, from = "left", active, className = "" }) {
  const base = from === "left" ? "-translate-x-10" : "translate-x-10";
  return (
    <div className={`transition-all duration-[720ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${active ? "translate-x-0 opacity-100" : `${base} opacity-0`} ${className}`}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------- hero full */

function HeroFull({ authed, onStartChat, onAuth }) {
  const [phase, setPhase] = useState(false);
  useEffect(() => { const t = setTimeout(() => setPhase(true), 80); return () => clearTimeout(t); }, []);
  return (
    <section className={`hero-section relative w-full overflow-hidden bg-base ${phase ? "view-in" : "opacity-0"}`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="hero-orb-1 absolute -top-24 left-1/2 h-[48rem] w-[72rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-accent-tint),transparent_70%)] opacity-70" />
        <div className="hero-orb-2 absolute -bottom-48 -right-48 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgba(124,108,255,0.13),transparent_68%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background:linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] [background-size:32px_32px]" />
      </div>
      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 sm:px-10 sm:py-20 lg:flex-row lg:items-center lg:gap-8 lg:py-24">
        <div className="max-w-xl flex-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Topic to deck — in minutes
          </span>
          <h1 className="mt-5 max-w-[14ch] text-[3rem] font-semibold leading-[0.92] tracking-[-0.04em] text-fg sm:text-[4rem]">
            Topic in.
            <br />
            <span className="bg-gradient-to-r from-accent via-[#8B5CF6] to-[#7C6CFF] bg-clip-text text-transparent">Standing ovation out.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">
            Research, outline, grounded writing, precise render and vision critique — done for you. You verify the facts and make it yours. No templates, no hand-layout.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {authed ? (
              <Button variant="primary" onClick={onStartChat}>Go to chat</Button>
            ) : (
              <Button variant="primary" onClick={() => onAuth?.("register")}>Join today — free</Button>
            )}
            <a href="#pipeline" onClick={(e) => { e.preventDefault(); document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-4 py-2.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">
              See how it works ↓
            </a>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-[12px] text-fg-faint">
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Hosted & ready</span>
            <span>·</span><span>50+ slide types</span><span>·</span><span>38 themes</span><span>·</span><span>Graded reports</span>
          </div>
        </div>
        {/* right: real theme stack — full width on desktop, moves on scroll via parallax */}
        <div className="relative hidden flex-1 select-none lg:block">
          <div className="relative mx-auto h-[360px] w-[520px] max-w-full">
            <RealThemeStack />
          </div>
        </div>
      </div>
      {/* mobile real stack */}
      <div className="relative mx-auto max-w-6xl px-6 pb-10 sm:px-10 lg:hidden">
        <RealThemeStackMobile />
      </div>
    </section>
  );
}

function RealThemeStack() {
  const [themes, setThemes] = useState(null);
  useEffect(() => { api.themes().then((r) => setThemes(r.themes.slice(0, 3))).catch(() => setThemes([])); }, []);
  if (!themes || themes.length < 3) return <div className="h-[300px] skeleton rounded-2xl" />;
  return (
    <>
      <div className="absolute right-6 top-8 w-[300px] rotate-[4deg] opacity-90 shadow-[var(--shadow-float)]">
        <ThemeMiniCard theme={themes[0]} onClick={() => {}} />
      </div>
      <div className="absolute left-8 top-0 w-[300px] -rotate-[3deg] opacity-95 shadow-[var(--shadow-float)]">
        <ThemeMiniCard theme={themes[1]} onClick={() => {}} />
      </div>
      <div className="absolute left-1/2 top-28 w-[320px] -translate-x-1/2 rotate-[-1deg] shadow-[var(--shadow-float)]">
        <ThemeMiniCard theme={themes[2]} onClick={() => {}} />
      </div>
    </>
  );
}
function RealThemeStackMobile() {
  const [themes, setThemes] = useState(null);
  useEffect(() => { api.themes().then((r) => setThemes(r.themes.slice(0, 3))).catch(() => setThemes([])); }, []);
  if (!themes) return <div className="flex gap-3 overflow-hidden"><div className="h-[220px] w-64 skeleton shrink-0 rounded-2xl" /><div className="h-[220px] w-64 skeleton shrink-0 rounded-2xl" /></div>;
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
      {themes.map((t) => <div key={t.name} className="w-64 shrink-0 snap-start"><ThemeMiniCard theme={t} onClick={() => {}} /></div>)}
    </div>
  );
}

/* ------------------------------------------------------------ pipeline immersive */

const PIPELINE = [
  { icon: ChatIcon, label: "brief", title: "One question at a time", desc: "Topic → title → team → guide → theme → density. Everything defaults; saved formats skip the fixed parts. No second wizard.", mock: "bullets" },
  { icon: SearchIcon, label: "research", title: "Research that researches", desc: "Multi-angle SearXNG + arXiv/Crossref, source-diversity and examiner-gap passes. Notes stay editable — grounding checks every claim.", mock: "stats" },
  { icon: LayersIcon, label: "outline", title: "Outline you can edit", desc: "Cards in plain language — reorder, retitle, switch type, regenerate. Disk gate: meta+plan with no deck.yaml until you approve.", mock: "agenda" },
  { icon: SparkleIcon, label: "you approve", title: "You’re the gate", desc: "Presets are gone — the gate replaces them. Nothing reaches the renderer unapproved, by construction.", mock: "quote" },
  { icon: DocIcon, label: "content", title: "Content, grounded & coherent", desc: "One small-grammar call per slide from your notes. Coherence reframes drift; density sweep keeps fonts readable, never 8pt.", mock: "compare" },
  { icon: LayersIcon, label: "render", title: "Render — deterministic", desc: "38 themes × styles, chrome locked after theme. pptxgenjs stays editable; plate themes add mesh gradients via Chrome raster.", mock: "chart" },
  { icon: SparkleIcon, label: "critique", title: "Vision critique loop", desc: "Real PNGs are inspected; floor flags instead of shrinking. Fix is less text — the badge tells you which slide.", mock: "timeline" },
];

function PipelineImmersive() {
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { const idx = Number(e.target.dataset.idx); if (!Number.isNaN(idx)) setActive(idx); }});
    }, { threshold: 0.5, rootMargin: "-18% 0px -40% 0px" });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section id="pipeline" className="pipeline-section w-full bg-base">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <div className="mb-10 text-center" data-parallax="0.12">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">The pipeline</div>
          <h2 className="mt-2 text-[2.1rem] font-semibold tracking-[-0.02em] text-fg">How a topic becomes a deck</h2>
          <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-fg-muted">Each step reveals its real slide type — the ppt specimen that this stage produces, not a random theme.</p>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute left-1/2 top-0 hidden h-[calc(100%-24px)] w-px -translate-x-1/2 bg-line/50 md:block" />
          <div className="pointer-events-none absolute left-1/2 top-0 hidden w-px -translate-x-1/2 bg-accent/60 transition-all duration-700 md:block" style={{ height: `${(active + 1) / PIPELINE.length * 100}%` }} />
          <div className="space-y-10">
            {PIPELINE.map(({ icon: Icon, label, title, desc, mock }, i) => {
              const isActive = active === i;
              const fromText = i % 2 === 0 ? "left" : "right";
              const fromCard = i % 2 === 0 ? "right" : "left";
              return (
                <div key={label} ref={(el) => (refs.current[i] = el)} data-idx={i} className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_48px_1fr] md:items-center">
                  <SlideIn from={fromText} active={isActive} className={i % 2 === 1 ? "md:order-3" : ""}>
                    <div className={`rounded-2xl border p-6 transition ${isActive ? "border-accent/20 bg-panel shadow-[var(--shadow-card)]" : "border-line/60 bg-panel/60 backdrop-blur"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`grid h-7 w-7 place-items-center rounded-full border text-[11px] font-bold ${label === "you approve" ? "border-accent bg-accent text-white" : isActive ? "border-accent/20 bg-accent text-white" : "border-line bg-sunken text-fg-muted"}`}>{label === "you approve" ? "✓" : i + 1}</span>
                        <span className={`text-[11px] font-semibold uppercase tracking-[0.10em] ${isActive ? "text-accent" : "text-fg-faint"}`}>{label}</span>
                      </div>
                      <div className="mt-3 text-[17px] font-semibold tracking-tight text-fg">{title}</div>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{desc}</p>
                    </div>
                  </SlideIn>
                  <div className="hidden place-items-center md:grid md:order-2">
                    <span className={`grid h-10 w-10 place-items-center rounded-full border bg-panel shadow-sm transition ${isActive ? "scale-110 border-accent bg-accent text-white" : "border-line/60 text-fg-muted"}`}><Icon className="h-4 w-4" /></span>
                  </div>
                  <SlideIn from={fromCard} active={isActive} className={i % 2 === 1 ? "md:order-1" : ""}>
                    <div className={`overflow-hidden rounded-2xl border bg-panel transition ${isActive ? "border-accent/20 shadow-[var(--shadow-card)]" : "border-line/60"}`}>
                      <MockSlide type={mock} active={isActive} />
                      <div className="flex items-center justify-between border-t border-line/60 bg-sunken/60 px-3 py-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">{mock}</span>
                        <span className={`h-2 w-2 rounded-full ${isActive ? "bg-accent animate-pulse" : "bg-line-strong"}`} />
                      </div>
                    </div>
                  </SlideIn>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function MockSlide({ type, active }) {
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
            {[["128%", "more recall"],["3.2×", "faster review"],["0", "invented facts"]].map(([v,l]) => (
              <div key={v} className="text-center"><div className="text-[18px] font-extrabold tracking-tight text-fg">{v}</div><div className="text-[11px] text-fg-faint">{l}</div></div>
            ))}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"><div className={`h-full rounded-full bg-accent transition-all duration-700 ${active ? "w-[78%]" : "w-[52%]"}`} /></div>
        </div>
      );
    case "chart":
      return (
        <div className={wrap}>
          <div className="text-[12px] font-semibold text-fg">Trend you can verify</div>
          <div className="mt-3 flex items-end gap-1.5 h-16">
            {[40,62,48,84,66].map((h,i) => <div key={i} className={`flex-1 rounded-t-md transition-all duration-700 ${i===3 ? "bg-accent" : "bg-accent/35"}`} style={{ height: `${h}%` }} />)}
          </div>
          <div className="mt-2 flex gap-1.5"><div className="h-1.5 w-12 rounded-full bg-line" /><div className="h-1.5 w-10 rounded-full bg-line" /></div>
        </div>
      );
    case "compare":
      return (
        <div className={`${wrap} gap-2`}>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-accent-tint p-2.5"><div className="text-[11px] font-semibold text-accent">Before</div><div className="mt-1 h-1.5 w-full rounded-full bg-accent/20" /><div className="mt-1 h-1.5 w-3/4 rounded-full bg-accent/20" /></div>
            <div className="rounded-lg bg-sunken p-2.5"><div className="text-[11px] font-semibold text-fg">After</div><div className="mt-1 h-1.5 w-full rounded-full bg-line" /><div className="mt-1 h-1.5 w-3/4 rounded-full bg-line" /></div>
          </div>
          <div className="text-center text-[11px] text-fg-faint">Side-by-side keeps the point honest</div>
        </div>
      );
    case "agenda":
      return (
        <div className={wrap}>
          <div className="rounded-lg border border-line/60 bg-sunken/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint">Section 02</div>
            <div className="mt-1 text-[14px] font-semibold text-fg">The argument in three parts</div>
            <div className="mt-2 flex gap-1.5"><span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">01</span><span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold text-fg-faint">02</span><span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold text-fg-faint">03</span></div>
          </div>
        </div>
      );
    case "quote":
      return (
        <div className={`${wrap} items-center text-center`}>
          <div className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-accent-tint text-accent">“</div>
          <div className="mt-2 text-[13px] font-medium leading-snug text-fg">Nothing renders until a human says go.</div>
          <div className="mt-1 text-[11px] text-fg-faint">— the gate, not a preset</div>
        </div>
      );
    case "timeline":
      return (
        <div className={wrap}>
          <div className="relative flex items-center justify-between"><div className="absolute left-0 right-0 top-1/2 h-px bg-line" />{["Brief","Outline","Render"].map((k) => <span key={k} className={`relative grid h-7 w-7 place-items-center rounded-full border text-[10px] font-bold ${k==="Render" && active ? "border-accent bg-accent text-white" : "border-line bg-panel text-fg-faint"}`}>•</span>)}</div>
          <div className="mt-2 flex justify-between text-[11px] text-fg-faint"><span>Brief</span><span>Outline</span><span>Render</span></div>
        </div>
      );
    default: return <div className={wrap}><div className="h-1.5 w-3/4 rounded-full bg-line" /></div>;
  }
}

/* ------------------------------------------------ live demo — GSAP scrolly like landonorris */

function LiveDemoScrolly({ onAuth, authed }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const textRef = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      // no pin — free scroll, just parallax as you scroll through section
      gsap.fromTo(trackRef.current, { x: 0 }, {
        x: -120,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: 1,
        },
      });
      gsap.fromTo(textRef.current, { y: 20 }, {
        y: -30,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: 1,
        },
      });
      // slides drift at different speeds for depth
      gsap.fromTo(".demo-slide-1", { y: 30 }, { y: -20, ease: "none", scrollTrigger: { trigger: containerRef.current, start: "top bottom", end: "bottom top", scrub: 1 } });
      gsap.fromTo(".demo-slide-2", { y: 50 }, { y: -40, ease: "none", scrollTrigger: { trigger: containerRef.current, start: "top bottom", end: "bottom top", scrub: 1 } });
      gsap.fromTo(".demo-slide-3", { y: 70 }, { y: -60, ease: "none", scrollTrigger: { trigger: containerRef.current, start: "top bottom", end: "bottom top", scrub: 1 } });
    }, containerRef);
    return () => ctx.revert();
  }, []);
  return (
    <section ref={containerRef} className="demo-section relative w-full overflow-hidden bg-[#0B0F1A] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(40rem_30rem_at_20%_10%,rgba(124,108,255,0.18),transparent_60%),radial-gradient(36rem_24rem_at_80%_90%,rgba(232,90,212,0.12),transparent_60%)]" />
      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[420px_1fr] lg:py-0 lg:h-screen">
        <div ref={textRef} className="max-w-md">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" /> Live demo — no API call
          </div>
          <h2 className="mt-4 text-[2.2rem] font-semibold leading-[0.95] tracking-[-0.03em] sm:text-[2.6rem]">We generate, you watch.</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-white/60">Scroll — this is our own site rendered as slides. A title, a bullets slide, a chart — each glides in at a different speed (parallax) like <a href="https://landonorris.com" target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-4 hover:decoration-white/60">landonorris.com</a>. No real PPT is written, it’s a scroll-driven story of how your deck would build.</p>
          <div className="mt-6 flex gap-2">
            <button onClick={() => (authed ? window.location.hash = "#/chat" : onAuth?.("register"))} className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0B0F1A] hover:bg-white/90">{authed ? "Go to chat" : "Join today"}</button>
            <a href="#pipeline" onClick={(e) => { e.preventDefault(); document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-full border border-white/15 px-4 py-2 text-[13px] text-white/70 hover:bg-white/5">How it works</a>
          </div>
          <div className="mt-6 text-[11px] uppercase tracking-[0.12em] text-white/30">Scroll to scrub →</div>
        </div>
        <div className="relative h-[380px] overflow-visible lg:h-[420px]">
          <div ref={trackRef} className="absolute inset-0 flex items-center gap-5 will-change-transform">
            <div className="demo-slide-1 w-[300px] shrink-0 rotate-[-1deg] rounded-2xl border border-white/10 bg-white p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <div className="rounded-xl bg-[#0B0F1A] p-4 text-white">
                <div className="text-[11px] uppercase tracking-wider text-white/40">Title</div>
                <div className="mt-1 text-[15px] font-semibold leading-tight">Green Hydrogen 2026</div>
                <div className="mt-1 text-[12px] leading-relaxed text-white/60">Cost, electrolysis and policy — a 12-slide talk.</div>
                <div className="mt-3 h-2 w-12 rounded-full bg-accent" />
              </div>
              <div className="mt-2 text-[11px] text-fg-faint">slide 01 — title</div>
            </div>
            <div className="demo-slide-2 w-[280px] shrink-0 rotate-[1.5deg] rounded-2xl border border-white/10 bg-white p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <div className="p-2">
                <div className="text-[12px] font-semibold text-fg">Why it matters</div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex gap-2 text-[12px] text-fg-muted"><span className="mt-1 h-1 w-1 rounded-full bg-accent" /> $2/kg by 2030 in best sites</div>
                  <div className="flex gap-2 text-[12px] text-fg-muted"><span className="mt-1 h-1 w-1 rounded-full bg-accent" /> 60% of cost is electricity</div>
                  <div className="flex gap-2 text-[12px] text-fg-muted"><span className="mt-1 h-1 w-1 rounded-full bg-accent" /> Policy unlocks the first GW</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-fg-faint">slide 04 — bullets</div>
            </div>
            <div className="demo-slide-3 w-[320px] shrink-0 rotate-[-1deg] rounded-2xl border border-white/10 bg-white p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <div className="p-2">
                <div className="text-[12px] font-semibold text-fg">Cost by technology</div>
                <div className="mt-3 flex items-end gap-1.5 h-20">
                  <div className="flex-1 rounded-t bg-accent/30" style={{ height: "45%" }} />
                  <div className="flex-1 rounded-t bg-accent/60" style={{ height: "68%" }} />
                  <div className="flex-1 rounded-t bg-accent" style={{ height: "92%" }} />
                </div>
                <div className="mt-2 flex gap-2 text-[10px] text-fg-faint"><span>ALK</span><span>PEM</span><span>SOEC</span></div>
              </div>
              <div className="mt-2 text-[11px] text-fg-faint">slide 07 — chart</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- how it works full */

function HowItWorksFull({ onStartChat }) {
  const steps = [
    { icon: ChatIcon, title: "Guided briefing", body: "One question at a time — theme, density, team, audience. Defaults + saved formats skip the fixed parts." },
    { icon: LayersIcon, title: "Outline gate", body: "Cards you can reorder, retitle, retype. Approve to write; regenerate to rethink. Git history of the plan." },
    { icon: DocIcon, title: "Deck + report", body: "Same research powers slides and the graded .docx. Slides rasterise immediately — what you see is the output." },
  ];
  return (
    <section className="how-section w-full bg-base border-t border-line/60">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <div className="mb-8 text-center" data-parallax="0.14">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">How it works</div>
          <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.015em] text-fg">Bulk by machine, polish by you</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => {
            const [ref, seen] = useReveal();
            return (
              <div key={title} ref={ref} className={`card-hover rounded-2xl border border-line bg-panel p-6 transition-all duration-700 ${seen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`} style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-tint text-accent"><Icon className="h-5 w-5" /></div>
                <div className="mt-4 text-[18px] font-semibold tracking-tight text-fg">{title}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{body}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <button onClick={onStartChat} className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-4 py-2 text-[13px] text-fg-muted hover:border-line-strong hover:text-fg">Start the first chat →</button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ themes full-bleed */

function ThemesFullBleed({ onBrowseThemes }) {
  const [themes, setThemes] = useState(null);
  useEffect(() => { api.themes().then((r) => setThemes(r.themes)).catch(() => setThemes([])); }, []);
  return (
    <section className="themes-section w-full bg-base border-t border-line/60">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <div className="mb-6 text-center" data-parallax="0.12">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Design languages</div>
          <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.015em] text-fg">Thirty-eight themes, drawn live</h2>
          <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-fg-muted">Each card is drawn from its own tokens — what you see is exactly what a deck gets. Editorial showcase at <a href="#/tour-themes" className="text-accent hover:underline">Tour → Themes</a>.</p>
        </div>
        {themes === null && <div className="flex gap-4 overflow-hidden">{[0,1,2,3].map((i) => <div key={i} className="h-[220px] w-64 shrink-0 rounded-2xl skeleton" />)}</div>}
        {themes?.length > 0 && (
          <div className="snap-x snap-mandatory overflow-x-auto pb-3 [scrollbar-width:thin] px-1" style={{ scrollbarWidth: "thin" }}>
            <div className="flex w-max gap-4">
              {themes.slice(0, 14).map((t) => <div key={t.name} className="w-64 shrink-0 snap-start"><ThemeMiniCard theme={t} onClick={() => onBrowseThemes?.(t.name)} /></div>)}
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => onBrowseThemes?.()} className="rounded-full border border-line bg-panel px-4 py-2 text-[13px] text-fg-muted hover:border-line-strong hover:text-fg">Browse all</button>
          <a href="#/tour-themes" className="rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-hi">Editorial showcase</a>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- plans full */

function PlansFull() {
  return (
    <section className="plans-section w-full bg-base border-t border-line/60">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <div className="mb-8 text-center" data-parallax="0.13">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Plans</div>
          <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.015em] text-fg">Auto or Cloud — your call</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-accent/20 bg-gradient-to-b from-accent-tint/60 to-panel p-6">
            <span className="pill border border-accent-dim/60 bg-accent-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">AUTO</span>
            <span className="ml-2 text-[12px] text-fg-faint">Free shared model</span>
            <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">Start instantly — rate-limited to keep it fair. Great for trying out.</p>
            <ul className="mt-4 space-y-2 text-[13px] text-fg-muted">{["No key needed","Hourly & weekly caps","Great for trying out"].map((s) => <li key={s} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{s}</li>)}</ul>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-6">
            <span className="pill border border-line-strong bg-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg">CLOUD</span>
            <span className="ml-2 text-[12px] text-fg-faint">Your own key</span>
            <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">Bring your own API key — unlimited, billed to you. Encrypted at rest.</p>
            <ul className="mt-4 space-y-2 text-[13px] text-fg-muted">{["Unlimited generations","Your quota, your billing","Encrypted at rest"].map((s) => <li key={s} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{s}</li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- capability full */

const CAPABILITIES = [
  { icon: LayersIcon, title: "50+ slide types", body: "Bullets, cards, compare, stats, timelines, testimonials — a vocabulary, not a template." },
  { icon: SearchIcon, title: "Research that researches", body: "Multi-angle search + arXiv/Crossref, diversity scoring, claim cross-check." },
  { icon: DocIcon, title: "Graded reports", body: "Institutional .docx donor, Word-page previews, one-click render." },
  { icon: SparkleIcon, title: "Vision critique", body: "Rendered PNGs inspected; re-render until text fits." },
  { icon: LayersIcon, title: "Versions & undo", body: "Every save snapshots deck.yaml; history is one restore away." },
  { icon: IdIcon, title: "Your final touches", body: "Outline gate, editable content, chat refinement — drafts become yours." },
];

function CapabilityFull({ onStartChat }) {
  return (
    <section className="capability-section w-full bg-base border-t border-line/60">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <div className="mb-8 text-center" data-parallax="0.11">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Capabilities</div>
          <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.015em] text-fg">Everything a deck needs</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, body }, i) => {
            const [ref, seen] = useReveal();
            return (
              <div key={title} ref={ref} className={`card-hover rounded-2xl border border-line bg-panel p-5 transition-all duration-700 ${seen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`} style={{ transitionDelay: `${i * 70}ms` }}>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-tint text-accent"><Icon className="h-4 w-4" /></div>
                <div className="mt-3 text-[16px] font-semibold tracking-tight text-fg">{title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCTAFull({ onStartChat }) {
  return (
    <section className="final-cta-section w-full bg-accent">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10 sm:py-12">
        <div className="flex flex-col items-start gap-6 rounded-[1.5rem] border border-white/15 bg-white/10 p-8 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Ready?</div>
            <div className="mt-1 text-[1.7rem] font-semibold leading-tight tracking-[-0.02em] text-white">Topic in. Standing ovation out.</div>
            <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-white/80">Join today — the briefing is one question at a time, everything else defaults.</p>
          </div>
          <button onClick={onStartChat} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-accent hover:bg-white/90">
            <ChatIcon className="h-4 w-4" /> Start a chat
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- footer full */

function FooterFull() {
  return (
    <footer className="w-full border-t border-line bg-panel">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <div className="grid grid-cols-2 gap-8 text-[13px] sm:grid-cols-4">
          <div>
            <div className="text-[12px] font-semibold tracking-tight">Product</div>
            <div className="mt-2 flex flex-col gap-1.5 text-fg-muted">
              <a href="#/home" className="hover:text-fg">Tour</a>
              <a href="#/tour-themes" className="hover:text-fg">Themes</a>
              <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
              <a href="#/usage" className="hover:text-fg">API usage</a>
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold tracking-tight">Resources</div>
            <div className="mt-2 flex flex-col gap-1.5 text-fg-muted">
              <a href="#/docs" className="hover:text-fg">Docs</a>
              <a href="#/home" className="hover:text-fg">How it works</a>
              <a href="#/usage" className="hover:text-fg">Usage & limits</a>
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold tracking-tight">Legal</div>
            <div className="mt-2 flex flex-col gap-1.5 text-fg-muted">
              <a href="#/privacy" className="hover:text-fg">Privacy</a>
              <a href="#/terms" className="hover:text-fg">Terms</a>
              <a href="#/contact" className="hover:text-fg">Contact</a>
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold tracking-tight">Presentation Forge</div>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">Hosted decks, fast generation, your data stays yours. Cloud when you need it.</p>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-[12px] text-fg-faint sm:flex-row">
          <span>© {new Date().getFullYear()} Presentation Forge. MIT for code.</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success" /> All systems operational</span>
        </div>
      </div>
    </footer>
  );
}
