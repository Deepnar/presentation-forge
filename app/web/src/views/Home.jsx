import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { Button } from "../components/ui.jsx";
import {
  ChatIcon, DocIcon, GithubIcon, IdIcon, LayersIcon, PaletteIcon, SearchIcon, SparkleIcon,
} from "../components/icons.jsx";

/**
 * The landing page at #/home — the front door of the app and the docs modal's
 * replacement. For a visitor it carries the sign-up/login actions; for a
 * signed-in user the same page is the tour. The raw README stays at
 * /api/docs for developers; this is the human story: the pipeline as a
 * designed flow, the live theme specimens the product is richest at, the
 * local-vs-cloud story, and a capability grid. Sections scroll-reveal on the
 * shell's view-in keyframe; reduced motion collapses it to an instant state
 * change. One radial accent glow behind the hero, never two.
 */
export default function Home({ user, onStartChat, onBrowseThemes, onAuth }) {
  const authed = Boolean(user);
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <Hero
        authed={authed}
        onStartChat={onStartChat}
        onBrowseThemes={onBrowseThemes}
        onAuth={onAuth}
      />
      <PipelineFlow />
      <HowItWorks onStartChat={authed ? onStartChat : () => onAuth?.("register")} />
      <ThemeCarousel onBrowseThemes={authed ? onBrowseThemes : () => onAuth?.("register")} />
      <LocalVsCloud />
      <CapabilityGrid onStartChat={authed ? onStartChat : () => onAuth?.("register")} />
      <FooterStrip />
    </div>
  );
}

/** A slim auth bar for visitors — just a "Log in" link, so the hero's one
 *  strong CTA ("Start a chat" → sign up) is not crowded out by buttons. */
function AuthBar({ onAuth }) {
  return (
    <div className="mb-10 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <img src="/logo.svg" alt="Presentation Forge" className="h-8 w-8 rounded-lg" />
        <span className="text-[14px] font-semibold tracking-tight">Presentation Forge</span>
      </div>
      <button
        onClick={() => onAuth?.("login")}
        className="rounded-lg px-2 py-1 text-[13px] text-fg-muted transition hover:bg-hover hover:text-fg"
      >
        Log in
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- scroll-reveal */

/** Fades a section in the first time it scrolls into view. One hook per
 *  section keeps the observer list tiny; reduced-motion shows it immediately. */
function Reveal({ children, className = "" }) {
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
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} className={`${seen ? "view-in" : "opacity-0"} ${className}`}>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------------- hero */

function Hero({ authed, onStartChat, onBrowseThemes, onAuth }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-b from-accent-tint/40 via-panel to-panel px-6 py-12 text-center shadow-[var(--shadow-card)] sm:px-10 sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_0%,var(--color-accent-tint),transparent_65%)] opacity-60" />
      <div className="relative">
        <img src="/logo.svg" alt="" className="mx-auto h-16 w-16 rounded-2xl shadow-[0_20px_40px_-20px_rgba(0,0,0,0.15)] ring-1 ring-line" />
        <h1 className="mx-auto mt-6 max-w-2xl text-[3.25rem] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">
          From topic to deck — fast
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          The app does the bulk: research, structure, draft content, render. You
          do the final touches: verify the facts, tune the words, make it yours.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="pill border border-accent-dim/60 bg-accent-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
            Bulk by machine, polish by you
          </span>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" onClick={authed ? onStartChat : () => onAuth?.("register")}>
            <ChatIcon className="h-4 w-4" />
            Start a chat
          </Button>
          <button
            onClick={authed ? onBrowseThemes : () => onAuth?.("register")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-[13px] font-medium text-fg-muted shadow-sm transition hover:border-line-strong hover:text-fg"
          >
            <PaletteIcon className="h-4 w-4" />
            Browse themes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pipeline flow */

const PIPELINE = [
  { icon: ChatIcon, label: "brief" },
  { icon: SearchIcon, label: "research" },
  { icon: LayersIcon, label: "outline" },
  { icon: SparkleIcon, label: "you approve" },
  { icon: DocIcon, label: "content" },
  { icon: LayersIcon, label: "render" },
  { icon: SparkleIcon, label: "critique" },
];

function PipelineFlow() {
  return (
    <Reveal className="pb-16">
      <div className="panel-surface rounded-card border border-line bg-panel px-6 py-7 shadow-[var(--shadow-card)]">
        <div className="mb-5 text-center text-[12px] font-medium uppercase tracking-wider text-fg-faint">
          The pipeline
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-4">
          {PIPELINE.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex items-center gap-1" style={{ ["--stagger-i"]: i }}>
              <div className="view-stagger flex flex-col items-center gap-1.5">
                <span className={`grid h-10 w-10 place-items-center rounded-full border ${label === "you approve" ? "border-accent bg-accent-tint text-accent" : "border-line bg-raised text-fg-muted"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={`px-1 text-[11px] ${label === "you approve" ? "font-semibold text-accent" : "text-fg-faint"}`}>{label}</span>
              </div>
              {i < PIPELINE.length - 1 && (
                <svg viewBox="0 0 24 24" className="mx-1 mb-5 h-4 w-4 text-line-strong" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* --------------------------------------------------------------- how it works */

function HowItWorks({ onStartChat }) {
  const steps = [
    {
      icon: ChatIcon,
      title: "Guided briefing",
      body: "Send a topic and answer one question at a time — theme, density, team, audience. Everything defaults unless you say otherwise.",
    },
    {
      icon: LayersIcon,
      title: "Outline gate",
      body: "The plan comes back as plain-language cards. Approve, edit, or regenerate — nothing renders until a human says go.",
    },
    {
      icon: DocIcon,
      title: "Deck + report, then yours",
      body: "Slides render and rasterise immediately, and the graded .docx report draws from the same research. The machine drafts; you verify the facts, tune the words and make it yours.",
    },
  ];
  return (
    <Reveal className="pb-20">
      <SectionHead eyebrow="How it works" title="Bulk by machine, polish by you" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="card-hover panel-surface rounded-card border border-line bg-panel p-6" style={{ ["--stagger-i"]: i }}>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-tint text-accent">
              <Icon className="h-5 w-5" />
            </div>
            <div className="mt-4 text-[18px] font-semibold tracking-tight text-fg">{title}</div>
            <p className="mt-1.5 text-[15px] leading-relaxed text-fg-muted">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <button
          onClick={onStartChat}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted transition hover:bg-hover hover:text-fg"
        >
          Start the first chat →
        </button>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------ theme showcase */

function ThemeCarousel({ onBrowseThemes }) {
  const [themes, setThemes] = useState(null);
  useEffect(() => {
    api.themes().then((r) => setThemes(r.themes)).catch(() => setThemes([]));
  }, []);
  return (
    <Reveal className="pb-20">
      <SectionHead eyebrow="Design languages" title="Thirty-eight themes, drawn live" />
      <p className="mx-auto -mt-1 max-w-xl pb-6 text-center text-[15px] leading-relaxed text-fg-muted">
        Each card renders from its own values — what you see is exactly what a
        deck gets.
      </p>
      {themes === null && (
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[220px] w-64 shrink-0 rounded-card" />)}
        </div>
      )}
      {themes?.length > 0 && (
        <div className="scroll-smooth snap-x snap-mandatory overflow-x-auto pb-3 [scrollbar-width:thin] [scrollbar-color:var(--color-line-strong)_transparent] px-1" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-line-strong) transparent" }}>
          <div className="flex w-max gap-4 snap-x px-4 sm:px-6" style={{ scrollPaddingLeft: "1.5rem" }}>
            {themes.map((t, i) => (
              <div key={t.name} className="w-64 shrink-0 snap-start" style={{ ["--stagger-i"]: i }}>
                <ThemeMiniCard theme={t} onClick={onBrowseThemes} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 text-center">
        <button
          onClick={onBrowseThemes}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted transition hover:bg-hover hover:text-fg"
        >
          Browse all themes
        </button>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------- local vs cloud */

function LocalVsCloud() {
  return (
    <Reveal className="pb-20">
      <SectionHead eyebrow="Free or bring your own" title="Auto or Cloud — your call" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="panel-surface rounded-card border border-line bg-panel p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2.5">
            <span className="pill border border-accent-dim/60 bg-accent-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">AUTO</span>
            <span className="text-[12px] text-fg-faint">Free shared model</span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            Start instantly — no key, no setup. Rate-limited so everyone gets a fair share. On this deployment it’s the free tier.
          </p>
          <ul className="mt-4 space-y-2">
            {["No key needed", "Hourly & weekly caps", "Great for trying out"].map((s) => (
              <li key={s} className="flex items-center gap-2 text-[15px] text-fg-muted">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel-surface rounded-card border border-line bg-panel p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2.5">
            <span className="pill border border-line-strong bg-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg">CLOUD</span>
            <span className="text-[12px] text-fg-faint">Your own key</span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            Bring your own API key — unlimited, billed to you. The same pipeline, just with your quota.
          </p>
          <ul className="mt-4 space-y-2">
            {["Unlimited generations", "Your quota, your billing", "Encrypted at rest"].map((s) => (
              <li key={s} className="flex items-center gap-2 text-[15px] text-fg-muted">
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

/* ----------------------------------------------------------- capability grid */

const CAPABILITIES = [
  { icon: LayersIcon, title: "50+ slide types", body: "Bullets, cards, compare, stats, timelines, testimonials — a full vocabulary, not a template." },
  { icon: SearchIcon, title: "Research that researches", body: "Multi-angle search plus arXiv and Crossref, source-diversity scoring, claim cross-checking." },
  { icon: DocIcon, title: "Graded-format reports", body: "The institutional .docx donor, Word-page previews, one-click render and download." },
  { icon: SparkleIcon, title: "Vision critique loop", body: "Rendered slides are inspected and re-rendered until the text fits and nothing overlaps." },
  { icon: LayersIcon, title: "Versions & undo", body: "Every save snapshots deck.yaml; the version history is one restore away." },
  { icon: IdIcon, title: "Your final touches", body: "An approvable outline, editable content, chat refinement — the machine drafts, you make it yours." },
];

function CapabilityGrid({ onStartChat }) {
  return (
    <Reveal className="pb-20">
      <SectionHead eyebrow="Capabilities" title="Everything a deck needs" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="card-hover panel-surface rounded-card border border-line bg-panel p-5" style={{ ["--stagger-i"]: i }}>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent-tint text-accent">
              <Icon className="h-4 w-4" />
            </div>
            <div className="mt-3 text-[16px] font-semibold tracking-tight text-fg">{title}</div>
            <p className="mt-1 text-[14px] leading-relaxed text-fg-muted">{body}</p>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/* ---------------------------------------------------------------- footer */

function FooterStrip() {
  return (
    <footer className="border-t border-line pt-8">
      <div className="grid grid-cols-2 gap-8 text-[13px] sm:grid-cols-4">
        <div>
          <div className="text-[12px] font-semibold tracking-tight">Product</div>
          <div className="mt-2 flex flex-col gap-1.5 text-fg-muted">
            <a href="#/home" className="hover:text-fg">Tour</a>
            <a href="#/themes" className="hover:text-fg">Themes</a>
            <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
          </div>
        </div>
        <div>
          <div className="text-[12px] font-semibold tracking-tight">Resources</div>
          <div className="mt-2 flex flex-col gap-1.5 text-fg-muted">
            <a href="/api/docs" target="_blank" className="hover:text-fg">Docs</a>
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
      <div className="text-[12px] font-medium uppercase tracking-wider text-accent">{eyebrow}</div>
      <h2 className="mt-1 text-[2rem] font-semibold tracking-[-0.015em] text-fg">{title}</h2>
    </div>
  );
}
