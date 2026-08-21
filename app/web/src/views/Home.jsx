import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { Button } from "../components/ui.jsx";
import { ChatIcon, DocIcon, LayersIcon, PaletteIcon, SearchIcon, SparkleIcon } from "../components/icons.jsx";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

export default function Home({ user, onStartChat, onBrowseThemes, onAuth }) {
  const authed = Boolean(user);
  const handleChat = () => onStartChat?.();
  const containerRef = useRef(null);
  const [themes, setThemes] = useState(null);
  useEffect(() => { api.themes().then(r => setThemes(r.themes)).catch(() => setThemes([])); }, []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      const slides = gsap.utils.toArray(".tour-slide");
      if (slides.length < 2) return;
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: `+=${slides.length * 100}%`,
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        }
      });
      // hero stays then fades
      tl.to(".hero-content", { y: -60, opacity: 0, scale: 0.96, ease: "none", duration: 0.6 }, 0.2);
      tl.to(".hero-cards", { y: -120, opacity: 0, rotate: -2, ease: "none", duration: 0.6 }, 0.2);
      // each step distinct animation
      // brief — slide from right large
      tl.fromTo(".slide-brief", { x: "100%", opacity: 0, rotate: 3, scale: 0.9 }, { x: "0%", opacity: 1, rotate: -1, scale: 1, ease: "none", duration: 0.7 }, 0.9);
      tl.to(".slide-brief", { x: "-30%", opacity: 0, scale: 0.96, ease: "none", duration: 0.4 }, 1.7);
      // research — from left with scale
      tl.fromTo(".slide-research", { x: "-100%", opacity: 0, scale: 1.08 }, { x: "0%", opacity: 1, scale: 1, ease: "none", duration: 0.7 }, 1.9);
      tl.to(".slide-research", { x: "30%", opacity: 0, ease: "none", duration: 0.4 }, 2.7);
      // outline — from bottom
      tl.fromTo(".slide-outline", { y: "100%", opacity: 0 }, { y: "0%", opacity: 1, ease: "none", duration: 0.7 }, 2.9);
      tl.to(".slide-outline", { y: "-20%", opacity: 0, ease: "none", duration: 0.4 }, 3.7);
      // approve — scale pop
      tl.fromTo(".slide-approve", { scale: 1.3, opacity: 0, rotate: -4 }, { scale: 1, opacity: 1, rotate: 0, ease: "none", duration: 0.7 }, 3.9);
      tl.to(".slide-approve", { scale: 0.9, opacity: 0, rotate: 2, ease: "none", duration: 0.4 }, 4.7);
      // content — diagonal
      tl.fromTo(".slide-content", { x: "80%", y: "40%", opacity: 0, rotate: 5 }, { x: "0%", y: "0%", opacity: 1, rotate: 0, ease: "none", duration: 0.8 }, 4.9);
      tl.to(".slide-content", { x: "-80%", y: "-30%", opacity: 0, rotate: -3, ease: "none", duration: 0.4 }, 5.7);
      // render — themes horizontal fast preview
      tl.fromTo(".slide-render", { x: "100%", opacity: 0 }, { x: "0%", opacity: 1, ease: "none", duration: 0.7 }, 5.9);
      tl.to(".themes-track", { x: "-55%", ease: "none", duration: 1.2 }, 5.9);
      tl.to(".slide-render", { opacity: 0, scale: 0.96, ease: "none", duration: 0.4 }, 7.1);
      // critique — scale and fade
      tl.fromTo(".slide-critique", { scale: 0.85, opacity: 0, y: 60 }, { scale: 1, opacity: 1, y: 0, ease: "none", duration: 0.7 }, 7.3);
      tl.to(".slide-critique", { scale: 1.08, opacity: 0, y: -60, ease: "none", duration: 0.4 }, 8.1);
      // final CTA — large centered, parallax orbs already
      tl.fromTo(".slide-final", { y: "100%", opacity: 0, scale: 0.92 }, { y: "0%", opacity: 1, scale: 1, ease: "none", duration: 0.8 }, 8.3);
    }, containerRef);
    return () => ctx.revert();
  }, [themes]);
  return (
    <div className="w-full bg-transparent">
      <section ref={containerRef} className="relative w-full h-[900vh] bg-transparent">
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-base">
          {/* persistent particles behind — visible throughout */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background:radial-gradient(circle_at_20%_30%,var(--color-accent)_1px,transparent_1px),radial-gradient(circle_at_80%_70%,var(--color-accent)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="hero-orb absolute -top-32 left-1/2 h-[60rem] w-[80rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-accent-tint),transparent_70%)] opacity-60" />
          {/* HERO */}
          <div className="tour-slide hero-content absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Topic to deck — in minutes</span>
            <h1 className="mt-6 max-w-[12ch] text-[3.4rem] font-semibold leading-[0.9] tracking-[-0.04em] sm:text-[5rem]">Topic in.<br /><span className="bg-gradient-to-r from-accent to-[#8B5CF6] bg-clip-text text-transparent">Standing ovation out.</span></h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-fg-muted">Research, outline, grounded writing, precise render and vision critique — done for you.</p>
            <div className="mt-7">{authed ? <Button variant="primary" onClick={handleChat}>Go to chat</Button> : <Button variant="primary" onClick={() => onAuth?.("register")}>Join today — free</Button>}</div>
            <div className="hero-cards mt-10 flex gap-3">
              {themes?.slice(0,3).map(t => <div key={t.name} className="w-56 hidden sm:block"><ThemeMiniCard theme={t} /></div>)}
            </div>
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.12em] text-fg-faint animate-pulse">Scroll ↓</div>
          </div>
          {/* BRIEF */}
          <div className="tour-slide slide-brief absolute inset-0 flex items-center px-6 sm:px-10 opacity-0 invisible">
            <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-10 lg:flex-row lg:items-center">
              <div className="flex-1">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">01 — Brief</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em] sm:text-[3.4rem]">One question at a time.</h2>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-fg-muted">Topic → title → team → theme → density. Everything defaults; saved formats skip the fixed parts.</p>
              </div>
              <div className="flex-1 flex justify-end">
                <div className="w-full max-w-md rounded-[1.5rem] border border-line bg-panel p-6 shadow-[var(--shadow-float)] rotate-[-1deg]">
                  <div className="h-2 w-12 rounded-full bg-accent/20" /><div className="mt-3 h-3 w-3/4 rounded-full bg-line" /><div className="mt-2 h-3 w-2/3 rounded-full bg-line" /><div className="mt-6 grid grid-cols-3 gap-2"><div className="h-16 rounded-lg bg-accent-tint" /><div className="h-16 rounded-lg bg-sunken" /><div className="h-16 rounded-lg bg-sunken" /></div>
                </div>
              </div>
            </div>
          </div>
          {/* RESEARCH */}
          <div className="tour-slide slide-research absolute inset-0 flex items-center px-6 sm:px-10 opacity-0 invisible">
            <div className="mx-auto flex w-full max-w-[1400px] flex-col-reverse gap-10 lg:flex-row lg:items-center">
              <div className="flex-1">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-panel p-4 border text-center"><div className="text-[18px] font-bold">128%</div><div className="text-[11px] text-fg-faint">more recall</div></div>
                  <div className="rounded-xl bg-panel p-4 border text-center"><div className="text-[18px] font-bold">3.2×</div><div className="text-[11px] text-fg-faint">faster</div></div>
                  <div className="rounded-xl bg-accent p-4 text-white text-center"><div className="text-[18px] font-bold">0</div><div className="text-[11px] text-white/70">invented</div></div>
                </div>
                <div className="mt-4 h-2 bg-sunken rounded-full"><div className="h-full w-[78%] bg-accent rounded-full" /></div>
              </div>
              <div className="flex-1">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">02 — Research</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em] sm:text-[3.4rem]">Research that researches.</h2>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-fg-muted">Multi-angle SearXNG + arXiv/Crossref, source-diversity guard. Notes stay editable.</p>
              </div>
            </div>
          </div>
          {/* OUTLINE */}
          <div className="tour-slide slide-outline absolute inset-0 flex items-center justify-center px-6 opacity-0 invisible">
            <div className="w-full max-w-4xl text-center">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">03 — Outline</div>
              <h2 className="mt-2 text-[3rem] font-semibold tracking-[-0.03em] sm:text-[4rem]">Outline you can edit.</h2>
              <p className="mx-auto mt-3 max-w-xl text-[15px] text-fg-muted">Cards in plain language — reorder, retitle, switch type. Nothing renders until you approve.</p>
              <div className="mt-8 flex justify-center gap-3"><div className="w-64 rounded-xl border bg-panel p-4 text-left"><div className="text-[11px] text-fg-faint">Section 02</div><div className="font-semibold">The argument in three parts</div></div><div className="w-64 rounded-xl border bg-panel p-4 text-left opacity-60"><div className="text-[11px] text-fg-faint">Section 03</div><div className="font-semibold">Evidence &amp; impact</div></div></div>
            </div>
          </div>
          {/* APPROVE */}
          <div className="tour-slide slide-approve absolute inset-0 flex items-center justify-center px-6 opacity-0 invisible">
            <div className="text-center">
              <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-accent text-white text-[32px]">✓</div>
              <h2 className="mt-6 text-[3.2rem] font-semibold tracking-[-0.03em]">You’re the gate.</h2>
              <p className="mx-auto mt-2 max-w-md text-[15px] text-fg-muted">Nothing reaches the renderer unapproved. A planned deck is meta+plan with no deck.yaml.</p>
            </div>
          </div>
          {/* CONTENT */}
          <div className="tour-slide slide-content absolute inset-0 flex items-center px-6 sm:px-10 opacity-0 invisible">
            <div className="mx-auto grid w-full max-w-[1400px] gap-10 lg:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">05 — Content</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em] sm:text-[3.4rem]">Grounded &amp; coherent.</h2>
                <p className="mt-3 max-w-md text-[15px] text-fg-muted">One small-grammar call per slide from your notes. Coherence reframes drift.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-accent-tint p-4"><div className="font-semibold text-accent">Before</div><div className="mt-2 h-2 bg-accent/20 rounded-full" /></div>
                <div className="rounded-xl bg-panel border p-4"><div className="font-semibold">After</div><div className="mt-2 h-2 bg-line rounded-full" /></div>
              </div>
            </div>
          </div>
          {/* RENDER — themes fast preview */}
          <div className="tour-slide slide-render absolute inset-0 flex flex-col justify-center px-6 sm:px-10 opacity-0 invisible">
            <div className="mx-auto w-full max-w-[1400px]">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">06 — Render</div>
              <h2 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.03em] sm:text-[3.4rem]">Thirty-eight themes, drawn live.</h2>
              <p className="mt-2 max-w-xl text-[15px] text-fg-muted">Same content, 38 design languages. Each card is drawn from its own tokens.</p>
              <div className="themes-track mt-8 flex gap-4 will-change-transform">
                {(themes ?? []).slice(0, 12).map(t => <div key={t.name} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}
              </div>
            </div>
          </div>
          {/* CRITIQUE */}
          <div className="tour-slide slide-critique absolute inset-0 flex items-center justify-center px-6 opacity-0 invisible">
            <div className="w-full max-w-3xl rounded-[1.5rem] border bg-panel p-8 text-center shadow-[var(--shadow-float)]">
              <div className="mx-auto h-12 w-12 rounded-full bg-accent-tint grid place-items-center text-accent text-xl">◯</div>
              <h2 className="mt-4 text-[2.4rem] font-semibold">Vision critique loop.</h2>
              <p className="mt-2 text-[15px] text-fg-muted">Real PNGs inspected; floor flags instead of shrinking. Fix is less text.</p>
            </div>
          </div>
          {/* FINAL */}
          <div className="tour-slide slide-final absolute inset-0 flex items-center justify-center px-6 opacity-0 invisible">
            <div className="w-full max-w-2xl rounded-[1.5rem] bg-accent p-10 text-center text-white">
              <div className="text-[11px] uppercase tracking-[0.12em] text-white/70">Ready?</div>
              <div className="mt-2 text-[2.4rem] font-semibold">Topic in. Standing ovation out.</div>
              <button onClick={handleChat} className="mt-6 rounded-full bg-white px-6 py-2.5 font-semibold text-accent">Start a chat</button>
            </div>
          </div>
        </div>
      </section>
      <footer className="w-full border-t border-line bg-panel">
        <div className="mx-auto max-w-[1440px] px-6 py-8 flex flex-col gap-3 sm:flex-row sm:justify-between text-[12px] text-fg-faint"><span>© {new Date().getFullYear()} Presentation Forge</span><span className="flex gap-4"><a href="#/privacy" className="hover:text-fg">Privacy</a><a href="#/docs" className="hover:text-fg">Docs</a><a href="#/usage" className="hover:text-fg">API usage</a></span></div>
      </footer>
    </div>
  );
}
