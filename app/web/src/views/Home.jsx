import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { Button } from "../components/ui.jsx";
import { ChatIcon, DocIcon, LayersIcon, PaletteIcon, SearchIcon, SparkleIcon } from "../components/icons.jsx";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Footer from "../components/Footer.jsx";
import { BrowserFrame, TitleMock, TeamMock, ThemeGalleryMock, DensityMock, OutlineMock, ResearchMock } from "../components/tour/ProductMocks.jsx";

gsap.registerPlugin(ScrollTrigger);

export default function Home({ user, onStartChat, onBrowseThemes, onAuth }) {
  const authed = Boolean(user);
  const handleChat = () => onStartChat?.();
  const [themes, setThemes] = useState(null);
  const wrapRef = useRef(null);
  const pinRef = useRef(null);
  useEffect(() => { api.themes().then(r => setThemes(r.themes)).catch(() => setThemes([])); }, []);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) return;
    const wrap = wrapRef.current;
    const pin = pinRef.current;
    if (!wrap || !pin) return;
    const ctx = gsap.context(() => {
      // initial states — non-hero beats hidden
      gsap.set(".beat:not(.beat-hero)", { autoAlpha: 0 });
      gsap.set(".journey-sheet:not(.sheet-hero)", { autoAlpha: 0 });
      gsap.set(".beat-hero", { autoAlpha: 1 });
      gsap.set(".sheet-hero", { autoAlpha: 1 });
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrap,
          start: "top top",
          end: "+=850%",
          scrub: 1,
          pin: pin,
          anticipatePin: 1,
          snap: { snapTo: "labels", duration: { min: 0.22, max: 0.45 }, delay: 0.06, ease: "power1.inOut" },
        }
      });
      tl.addLabel("hero", 0);
      // hero exit
      tl.to(".beat-hero .hero-copy", { y: -70, autoAlpha: 0, ease: "none", duration: 0.6 }, 0.4);
      tl.to(".beat-hero .hero-cards", { y: -120, x: 50, rotate: 4, autoAlpha: 0, ease: "none", duration: 0.6 }, 0.4);
      tl.to(".sheet-hero", { autoAlpha: 0, ease: "none", duration: 0.5 }, 0.6);
      tl.to(".sheet-warm", { autoAlpha: 1, ease: "none", duration: 0.6 }, 0.7);
      // brief
      tl.addLabel("brief", 1.2);
      tl.fromTo(".beat-brief", { x: "110%", rotate: 5, autoAlpha: 0 }, { x: "0%", rotate: -1, autoAlpha: 1, ease: "none", duration: 0.7 }, 1.2);
      tl.fromTo(".beat-brief .copy", { y: 60, autoAlpha: 0 }, { y: 0, autoAlpha: 1, ease: "none", duration: 0.6 }, 1.35);
      tl.to(".beat-brief", { x: "-25%", autoAlpha: 0, scale: 0.97, ease: "none", duration: 0.45 }, 2.4);
      // research
      tl.addLabel("research", 2.6);
      tl.fromTo(".beat-research .stagger > *", { x: -90, autoAlpha: 0 }, { x: 0, autoAlpha: 1, stagger: 0.12, ease: "none", duration: 0.55 }, 2.6);
      tl.fromTo(".beat-research .copy", { x: 60, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: "none", duration: 0.6 }, 2.75);
      tl.to(".beat-research", { x: "30%", autoAlpha: 0, rotate: 2, ease: "none", duration: 0.45 }, 3.8);
      tl.to(".sheet-warm", { autoAlpha: 0, ease: "none", duration: 0.5 }, 3.6);
      tl.to(".sheet-deep", { autoAlpha: 1, ease: "none", duration: 0.6 }, 3.8);
      // outline — zoom from within
      tl.addLabel("outline", 3.9);
      tl.fromTo(".beat-outline", { scale: 0.58, autoAlpha: 0, filter: "blur(8px)" }, { scale: 1, autoAlpha: 1, filter: "blur(0px)", ease: "none", duration: 0.75 }, 3.9);
      tl.to(".beat-outline", { scale: 0.88, autoAlpha: 0, y: -60, ease: "none", duration: 0.45 }, 5.0);
      // approve — drop from outside top
      tl.addLabel("approve", 5.15);
      tl.fromTo(".beat-approve", { y: "-110%", rotate: -6, autoAlpha: 0 }, { y: "0%", rotate: 0, autoAlpha: 1, ease: "none", duration: 0.7 }, 5.15);
      tl.fromTo(".beat-approve .check", { scale: 0, rotate: -30 }, { scale: 1, rotate: 0, ease: "back.out(1.6)", duration: 0.5 }, 5.55);
      tl.to(".beat-approve", { y: "60%", autoAlpha: 0, scale: 0.92, ease: "none", duration: 0.45 }, 6.2);
      // content — diagonal from bottom-left
      tl.addLabel("content", 6.35);
      tl.fromTo(".beat-content", { x: "-25%", y: "65%", rotate: 4, autoAlpha: 0 }, { x: "0%", y: "0%", rotate: 0, autoAlpha: 1, ease: "none", duration: 0.8 }, 6.35);
      tl.to(".beat-content", { x: "25%", y: "-35%", autoAlpha: 0, rotate: -3, ease: "none", duration: 0.45 }, 7.5);
      tl.to(".sheet-deep", { autoAlpha: 0.85, ease: "none", duration: 0.4 }, 7.2);
      // render — deterministic + specimen strip rises
      tl.addLabel("render", 7.65);
      tl.fromTo(".beat-render .copy", { y: 50, autoAlpha: 0 }, { y: 0, autoAlpha: 1, ease: "none", duration: 0.55 }, 7.65);
      tl.fromTo(".beat-render .specimen", { y: 80, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.12, ease: "none", duration: 0.6 }, 7.8);
      // themes marquee drifts while render holds
      tl.to(".marquee-stack", { x: -140, ease: "none", duration: 1.0 }, 7.65);
      tl.to(".beat-render", { autoAlpha: 0, y: -40, ease: "none", duration: 0.45 }, 8.9);
      // themes showcase — 3 rows auto + scrub
      tl.addLabel("themes", 9.05);
      tl.fromTo(".beat-themes", { y: "40%", autoAlpha: 0 }, { y: "0%", autoAlpha: 1, ease: "none", duration: 0.7 }, 9.05);
      tl.to(".marquee-row-1", { x: -80, ease: "none", duration: 1.1 }, 9.05);
      tl.to(".marquee-row-2", { x: 80, ease: "none", duration: 1.1 }, 9.05);
      tl.to(".marquee-row-3", { x: -60, ease: "none", duration: 1.1 }, 9.05);
      tl.to(".beat-themes", { autoAlpha: 0, y: -30, ease: "none", duration: 0.45 }, 10.2);
      // critique — center pulse
      tl.addLabel("critique", 10.35);
      tl.fromTo(".beat-critique", { scale: 0.78, autoAlpha: 0, y: 30 }, { scale: 1, autoAlpha: 1, y: 0, ease: "none", duration: 0.7 }, 10.35);
      tl.to(".beat-critique .ring", { scale: 1.4, autoAlpha: 0, ease: "none", duration: 0.9 }, 10.5);
      tl.to(".beat-critique", { scale: 1.07, autoAlpha: 0, y: -40, ease: "none", duration: 0.45 }, 11.1);
      // cta
      tl.addLabel("cta", 11.25);
      tl.fromTo(".beat-cta", { y: "70%", autoAlpha: 0, scale: 0.94 }, { y: "0%", autoAlpha: 1, scale: 1, ease: "none", duration: 0.75 }, 11.25);
      tl.to(".sheet-accent", { autoAlpha: 1, ease: "none", duration: 0.6 }, 11.25);
      tl.fromTo(".beat-cta .cta-glow", { scale: 0.7, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, ease: "none", duration: 0.6 }, 11.4);
      // footer — cascade as final beat, stays
      tl.addLabel("footer", 12.3);
      tl.fromTo(".beat-footer", { y: "30%", autoAlpha: 0 }, { y: "0%", autoAlpha: 1, ease: "none", duration: 0.6 }, 12.3);
      tl.fromTo(".beat-footer .footer-col", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.1, ease: "none", duration: 0.5 }, 12.45);
    }, wrap);
    return () => ctx.revert();
  }, [reduced, themes]);

  if (reduced) {
    return (
      <div className="w-full">
        <section className="mx-auto max-w-6xl px-6 py-16 text-center">
          <span className="rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Topic to deck — in minutes</span>
          <h1 className="mt-4 text-[3rem] font-semibold leading-[0.9] tracking-[-0.04em]">Topic in.<br /><span className="bg-gradient-to-r from-accent to-[#8B5CF6] bg-clip-text text-transparent">Standing ovation out.</span></h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-fg-muted">Research, outline, grounded writing, precise render and vision critique — done for you.</p>
          <div className="mt-6 flex justify-center">{authed ? <Button variant="primary" onClick={handleChat}>Go to chat</Button> : <Button variant="primary" onClick={() => onAuth?.("register")}>Join today — free</Button>}</div>
        </section>
        <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
          <BrowserFrame><TitleMock /></BrowserFrame>
          <BrowserFrame><TeamMock /></BrowserFrame>
          <BrowserFrame><ThemeGalleryMock themes={themes ?? []} /></BrowserFrame>
          <OutlineMock />
          <ResearchMock />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Journey background — morphs smoothly, no hard section blocks */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="journey-sheet sheet-hero absolute inset-0 bg-[radial-gradient(60rem_36rem_at_50%_0%,var(--color-accent-tint),transparent_70%),radial-gradient(40rem_28rem_at_90%_85%,rgba(124,108,255,0.10),transparent_65%)] opacity-100" />
        <div className="journey-sheet sheet-warm absolute inset-0 bg-[radial-gradient(55rem_32rem_at_20%_25%,rgba(251,191,120,0.14),transparent_62%),radial-gradient(36rem_24rem_at_80%_60%,rgba(244,114,182,0.10),transparent_60%)] opacity-0" />
        <div className="journey-sheet sheet-deep absolute inset-0 bg-[#0B0F1A] opacity-0" />
        <div className="journey-sheet sheet-accent absolute inset-0 bg-[radial-gradient(60rem_40rem_at_50%_100%,rgba(124,108,255,0.22),transparent_65%),radial-gradient(30rem_20rem_at_20%_20%,rgba(139,92,246,0.16),transparent_60%)] opacity-0" />
      </div>
      <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
        {/* HERO */}
        <div className="beat beat-hero absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="hero-copy max-w-3xl">
            <span className="rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Topic to deck — in minutes</span>
            <h1 className="mt-6 text-[3.6rem] font-semibold leading-[0.88] tracking-[-0.04em] sm:text-[5.2rem]">Topic in.<br /><span className="bg-gradient-to-r from-accent to-[#8B5CF6] bg-clip-text text-transparent">Standing ovation out.</span></h1>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-fg-muted">Research, outline, grounded writing, precise render and vision critique — done for you. No templates, no hand-layout.</p>
            <div className="mt-8 flex justify-center">{authed ? <Button variant="primary" onClick={handleChat}>Go to chat</Button> : <Button variant="primary" onClick={() => onAuth?.("register")}>Join today — free</Button>}</div>
            <div className="mt-6 text-[11px] uppercase tracking-[0.12em] text-fg-faint">Scroll — one step at a time ↓</div>
          </div>
          <div className="hero-cards pointer-events-none absolute inset-x-0 bottom-[6vh] hidden justify-center gap-3 sm:flex">
            {(themes ?? []).slice(0, 3).map(t => <div key={t.name} className="w-56"><ThemeMiniCard theme={t} /></div>)}
          </div>
        </div>
        {/* BRIEF — Title + Team zoom */}
        <div className="beat beat-brief absolute inset-0 flex items-center justify-center px-6 sm:px-10">
          <div className="mx-auto grid w-full max-w-[1400px] gap-8 lg:grid-cols-[420px_1fr] lg:items-center">
            <div className="copy">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">01 — Brief</div>
              <h2 className="mt-2 text-[2.6rem] font-semibold leading-[0.9] tracking-[-0.03em] sm:text-[3.2rem]">One question at a time.</h2>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-fg-muted">Topic → title → team → theme → density. Everything defaults; saved formats skip the fixed parts. This is the real card you type in.</p>
            </div>
            <BrowserFrame url="forge.local/#/chat · briefing · step 2/12">
              <TitleMock />
              <div className="mt-4 border-t border-line pt-4 opacity-60 scale-[0.96] origin-top">
                <TeamMock />
              </div>
            </BrowserFrame>
          </div>
        </div>
        {/* RESEARCH */}
        <div className="beat beat-research absolute inset-0 flex items-center px-6 sm:px-10">
          <div className="mx-auto grid w-full max-w-[1400px] gap-10 lg:grid-cols-2">
            <BrowserFrame url="forge.local/research · live">
              <div className="stagger space-y-2">
                <ResearchMock />
              </div>
            </BrowserFrame>
            <div className="copy">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">02 — Research</div>
              <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em]">Research that researches.</h2>
              <p className="mt-3 max-w-md text-[14px] text-fg-muted">Multi-angle SearXNG + arXiv/Crossref, source-diversity guard. Your notes stay editable.</p>
            </div>
          </div>
        </div>
        {/* OUTLINE */}
        <div className="beat beat-outline absolute inset-0 flex items-center justify-center px-6">
          <div className="w-full max-w-4xl text-center">
            <div className="text-[11px] uppercase tracking-[0.12em] text-accent">03 — Outline</div>
            <h2 className="mt-2 text-[3rem] font-semibold tracking-[-0.03em] sm:text-[4rem]">Outline you can edit.</h2>
            <p className="mx-auto mt-2 max-w-xl text-[14px] text-fg-muted">Cards in plain language — reorder, retitle, switch type. Nothing renders until you approve.</p>
            <div className="mx-auto mt-6 max-w-2xl"><OutlineMock /></div>
          </div>
        </div>
        {/* APPROVE */}
        <div className="beat beat-approve absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="check grid h-24 w-24 place-items-center rounded-full bg-accent text-[32px] text-white shadow-[0_20px_60px_rgba(109,91,255,0.4)]">✓</div>
          <h2 className="mt-6 text-[3.2rem] font-semibold tracking-[-0.03em]">You’re the gate.</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-fg-muted">Nothing reaches the renderer unapproved. A planned deck is meta+plan with no deck.yaml.</p>
        </div>
        {/* CONTENT */}
        <div className="beat beat-content absolute inset-0 flex items-center px-6 sm:px-10">
          <div className="mx-auto grid w-full max-w-[1400px] gap-10 lg:grid-cols-2">
            <div className="copy">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">05 — Content</div>
              <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em]">Grounded &amp; coherent.</h2>
              <p className="mt-3 max-w-md text-[14px] text-fg-muted">One small-grammar call per slide from your notes. Coherence reframes drift.</p>
              <div className="mt-4 flex gap-2"><span className="rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent">sparse</span><span className="rounded-full bg-hover px-2.5 py-1 text-[11px]">balanced</span><span className="rounded-full bg-sunken px-2.5 py-1 text-[11px] text-fg-faint">dense</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-accent-tint p-4"><div className="font-semibold text-accent">Before</div><div className="mt-2 h-2 rounded-full bg-accent/20" /></div>
              <div className="rounded-xl bg-panel border p-4"><div className="font-semibold">After — one idea</div><div className="mt-2 h-2 rounded-full bg-line" /></div>
            </div>
          </div>
        </div>
        {/* RENDER */}
        <div className="beat beat-render absolute inset-0 flex flex-col justify-center px-6 sm:px-10">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="copy">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">06 — Render</div>
              <h2 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.03em]">Deterministic — chrome locked.</h2>
              <p className="mt-2 max-w-xl text-[14px] text-fg-muted">Same content, any of 38 themes. Chrome after theme, so marks never vanish.</p>
            </div>
            <div className="specimen mt-6 grid grid-cols-3 gap-3">
              <ThemeMiniCard theme={themes?.[0] ?? { palette:{bg:"#FFF",surface:"#F1F3F9",ink:"#0F172A",ink_muted:"#94A3B8",accent:"#6D5BFF"}, surfaces:{title:{bg:"#0F172A",ink:"#FFF",muted:"#94A3B8"}}, fonts:{heading:"Inter",body:"Inter"}, label:"Demo", name:"demo" }} />
              <ThemeMiniCard theme={themes?.[1] ?? { palette:{bg:"#FFF",surface:"#F1F3F9",ink:"#0F172A",ink_muted:"#94A3B8",accent:"#6D5BFF"}, surfaces:{title:{bg:"#0F172A",ink:"#FFF",muted:"#94A3B8"}}, fonts:{heading:"Inter",body:"Inter"}, label:"Demo 2", name:"demo2" }} />
              <ThemeMiniCard theme={themes?.[2] ?? { palette:{bg:"#FFF",surface:"#F1F3F9",ink:"#0F172A",ink_muted:"#94A3B8",accent:"#6D5BFF"}, surfaces:{title:{bg:"#0F172A",ink:"#FFF",muted:"#94A3B8"}}, fonts:{heading:"Inter",body:"Inter"}, label:"Demo 3", name:"demo3" }} />
            </div>
            <div className="marquee-stack mt-6 flex gap-3 overflow-hidden">
              <div className="flex w-max gap-3"><div className="h-12 w-20 rounded bg-accent" /><div className="h-12 w-20 rounded bg-accent/60" /><div className="h-12 w-20 rounded bg-accent/30" /></div>
            </div>
          </div>
        </div>
        {/* THEMES — 3-row marquee */}
        <div className="beat beat-themes absolute inset-0 flex flex-col justify-center bg-[#0B0F1A]/90 px-6 text-white sm:px-10 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Design languages</div>
            <h2 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.03em]">Thirty-eight themes, drawn live.</h2>
            <div className="mt-6 space-y-3">
              <div className="marquee-row marquee-ltr overflow-hidden" style={{"--marquee-dur":"28s"}}>
                <div className="flex gap-4">{(themes ?? []).slice(0, 12).map(t => <div key={t.name} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}<div className="flex gap-4" aria-hidden>{(themes ?? []).slice(0, 12).map(t => <div key={`${t.name}-dup`} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}</div></div>
              </div>
              <div className="marquee-row marquee-rtl overflow-hidden" style={{"--marquee-dur":"32s"}}>
                <div className="flex gap-4">{(themes ?? []).slice(12, 24).map(t => <div key={t.name} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}<div className="flex gap-4" aria-hidden>{(themes ?? []).slice(12, 24).map(t => <div key={`${t.name}-dup2`} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}</div></div>
              </div>
              <div className="marquee-row marquee-ltr overflow-hidden" style={{"--marquee-dur":"38s"}}>
                <div className="flex gap-4">{(themes ?? []).slice(24, 36).map(t => <div key={t.name} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}<div className="flex gap-4" aria-hidden>{(themes ?? []).slice(24, 36).map(t => <div key={`${t.name}-dup3`} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}</div></div>
              </div>
            </div>
          </div>
        </div>
        {/* CRITIQUE */}
        <div className="beat beat-critique absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="relative">
            <div className="ring absolute inset-0 rounded-full border border-accent/30" />
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-accent-tint text-accent text-2xl">◯</div>
          </div>
          <h2 className="mt-6 text-[2.6rem] font-semibold tracking-[-0.03em]">Vision critique loop.</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-fg-muted">Real PNGs inspected; floor flags instead of shrinking. Fix is less text.</p>
        </div>
        {/* CTA */}
        <div className="beat beat-cta absolute inset-0 flex items-center justify-center px-6">
          <div className="cta-glow pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_50%_100%,rgba(124,108,255,0.22),transparent_65%)] opacity-0" />
          <div className="relative w-full max-w-2xl rounded-[1.5rem] bg-accent p-10 text-center text-white shadow-[0_40px_80px_rgba(109,91,255,0.35)]">
            <div className="text-[11px] uppercase tracking-[0.12em] text-white/70">Ready?</div>
            <div className="mt-2 text-[2.4rem] font-semibold">Topic in. Standing ovation out.</div>
            <button onClick={handleChat} className="mt-6 rounded-full bg-white px-6 py-2.5 font-semibold text-accent">Start a chat</button>
          </div>
        </div>
        {/* FOOTER */}
        <div className="beat beat-footer absolute inset-0 flex items-end justify-center p-6">
          <div className="w-full max-w-6xl rounded-[1.5rem] border border-line bg-panel p-6 shadow-[var(--shadow-float)]">
            <div className="footer-col grid grid-cols-2 gap-6 text-[13px] sm:grid-cols-4">
              <div><div className="font-semibold">Product</div><div className="mt-2 flex flex-col gap-1.5 text-fg-muted"><a href="#/home" className="hover:text-fg">Tour</a><a href="#/tour-themes" className="hover:text-fg">Themes</a><a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a><a href="#/usage" className="hover:text-fg">API usage</a></div></div>
              <div><div className="font-semibold">Resources</div><div className="mt-2 flex flex-col gap-1.5 text-fg-muted"><a href="#/docs" className="hover:text-fg">Docs</a><a href="#/usage" className="hover:text-fg">Usage</a></div></div>
              <div><div className="font-semibold">Legal</div><div className="mt-2 flex flex-col gap-1.5 text-fg-muted"><a href="#/privacy" className="hover:text-fg">Privacy</a><a href="#/terms" className="hover:text-fg">Terms</a><a href="#/contact" className="hover:text-fg">Contact</a></div></div>
              <div><div className="font-semibold">Presentation Forge</div><p className="mt-2 text-fg-muted">Hosted decks, fast generation.</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
