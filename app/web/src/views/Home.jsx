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
      {!authed && <AuthBar onAuth={onAuth} />}
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

/** A slim auth bar for visitors — "Start a chat" leads to sign-up, and the
 *  Log in / Sign up actions open the auth modal from the landing itself. */
function AuthBar({ onAuth }) {
  return (
    <div className="mb-10 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <img src="/logo.svg" alt="Presentation Forge" className="h-8 w-8 rounded-lg" />
        <span className="text-[14px] font-semibold tracking-tight">Presentation Forge</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onAuth?.("login")}>Log in</Button>
        <Button variant="primary" size="sm" onClick={() => onAuth?.("register")}>Sign up</Button>
      </div>
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
    <div className="hero-glow glow-breathe py-12 text-center sm:py-16">
      <img src="/logo.svg" alt="" className="mx-auto h-16 w-16 rounded-2xl shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)]" />
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
        <Button variant="outline" onClick={authed ? onBrowseThemes : () => onAuth?.("register")}>
          <PaletteIcon className="h-4 w-4" />
          Browse themes
        </Button>
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
        <Button variant="ghost" onClick={onStartChat}>
          Start the first chat →
        </Button>
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
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-40 w-64 shrink-0 rounded-card" />)}
        </div>
      )}
      {themes?.length > 0 && (
        <div className="scroll-smooth overflow-x-auto pb-2" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-line-strong) transparent" }}>
          <div className="flex w-max gap-4 px-1">
            {themes.map((t, i) => (
              <div key={t.name} className="w-64 shrink-0" style={{ ["--stagger-i"]: i }}>
                <ThemeMiniCard theme={t} onClick={onBrowseThemes} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 text-center">
        <Button variant="outline" onClick={onBrowseThemes}>Browse all themes</Button>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------- local vs cloud */

function LocalVsCloud() {
  return (
    <Reveal className="pb-20">
      <SectionHead eyebrow="Local-first & private" title="Your machine, your models" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="panel-surface rounded-card border border-line bg-panel p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2.5">
            <span className="pill border border-line-strong bg-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg">LOCAL</span>
            <span className="text-[12px] text-fg-faint">Ollama on this machine</span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            Zero egress — research, planning and writing run against a local
            Ollama. A topic never leaves the box.
          </p>
          <ul className="mt-4 space-y-2">
            {["Everything runs offline", "No API keys, no per-token cost", "Your decks stay yours"].map((s) => (
              <li key={s} className="flex items-center gap-2 text-[15px] text-fg-muted">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel-surface rounded-card border border-line bg-panel p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2.5">
            <span className="pill border border-accent-dim/60 bg-accent-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">CLOUD</span>
            <span className="text-[12px] text-fg-faint">optional key, per role</span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            Attach a key and the same pipeline runs at full strength — deeper
            research, longer writing, no local limits.
          </p>
          <ul className="mt-4 space-y-2">
            {["Deeper research budgets, per role", "Full-strength synthesis for the writer", "Opt-in — the default stays local"].map((s) => (
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
      <div className="mt-10 text-center">
        <Button variant="primary" onClick={onStartChat}>Start a chat</Button>
      </div>
    </Reveal>
  );
}

/* ---------------------------------------------------------------- footer */

function FooterStrip() {
  const tags = ["node", "pptxgenjs", "ollama", "local-first", "MIT"];
  return (
    <footer className="border-t border-line pt-8 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {tags.map((t) => (
          <span key={t} className="pill border border-line bg-panel px-2.5 py-1 text-[12px] text-fg-muted">{t}</span>
        ))}
        <a
          href="https://github.com/Deepnar/presentation-forge"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] text-fg-muted transition hover:bg-hover hover:text-fg"
        >
          <GithubIcon className="h-3.5 w-3.5" /> GitHub
        </a>
      </div>
      <p className="mt-4 text-[12px] text-fg-faint">
        Built to be yours — local-first, free, no cloud in the pipeline. Bulk by machine, polish by you.
      </p>
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
