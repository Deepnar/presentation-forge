import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { Button } from "../components/ui.jsx";
import { ChatIcon, DocIcon, LayersIcon, PaletteIcon, SearchIcon, SparkleIcon } from "../components/icons.jsx";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Footer from "../components/Footer.jsx";
import { BrowserFrame, TitleMock, TeamMock, ThemeGalleryMock, OutlineMock, ResearchMock } from "../components/tour/ProductMocks.jsx";

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
      gsap.set(".beat:not(.beat-hero)", { autoAlpha: 0 });
      gsap.set(".journey-sheet:not(.sheet-hero)", { autoAlpha: 0 });
      gsap.set(".beat-hero", { autoAlpha: 1 });
      gsap.set(".sheet-hero", { autoAlpha: 1 });
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrap,
          start: "top top",
          end: "+=1400%",
          scrub: true,
          pin: pin,
          anticipatePin: 1,
        }
      });
      tl.addLabel("hero", 0);
      tl.to({}, { duration: 1.0 });
      tl.to(".beat-hero .hero-copy", { y: -30, autoAlpha: 0, ease: "none", duration: 0.5 }, 1.2);
      tl.to(".beat-hero .hero-cards", { y: -60, autoAlpha: 0, ease: "none", duration: 0.5 }, 1.2);
      tl.to(".sheet-hero", { autoAlpha: 0, ease: "none", duration: 0.4 }, 1.5);
      tl.to(".sheet-warm", { autoAlpha: 1, ease: "none", duration: 0.5 }, 1.6);
      tl.addLabel("brief", 2.0);
      tl.fromTo(".beat-brief", { x: "100%", autoAlpha: 0 }, { x: "0%", autoAlpha: 1, ease: "none", duration: 0.8 }, 2.0);
      tl.fromTo(".beat-brief .copy", { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, ease: "none", duration: 0.5 }, 2.2);
      tl.to({}, { duration: 1.0 });
      tl.to(".beat-brief", { x: "-20%", autoAlpha: 0, ease: "none", duration: 0.4 }, 4.0);
      tl.addLabel("research", 4.2);
      tl.fromTo(".beat-research", { x: "-100%", autoAlpha: 0 }, { x: "0%", autoAlpha: 1, ease: "none", duration: 0.8 }, 4.2);
      tl.fromTo(".beat-research .stagger > *", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.1, ease: "none", duration: 0.5 }, 4.4);
      tl.to({}, { duration: 1.0 });
      tl.to(".beat-research", { x: "20%", autoAlpha: 0, ease: "none", duration: 0.4 }, 6.2);
      tl.to(".sheet-warm", { autoAlpha: 0, ease: "none", duration: 0.4 }, 6.0);
      tl.to(".sheet-deep", { autoAlpha: 1, ease: "none", duration: 0.5 }, 6.1);
      tl.addLabel("outline", 6.4);
      tl.fromTo(".beat-outline", { scale: 0.9, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, ease: "none", duration: 0.7 }, 6.4);
      tl.to({}, { duration: 0.9 });
      tl.to(".beat-outline", { scale: 0.95, autoAlpha: 0, y: -30, ease: "none", duration: 0.4 }, 8.0);
      tl.addLabel("approve", 8.2);
      tl.fromTo(".beat-approve", { y: "-80%", autoAlpha: 0 }, { y: "0%", autoAlpha: 1, ease: "none", duration: 0.7 }, 8.2);
      tl.fromTo(".beat-approve .check", { scale: 0 }, { scale: 1, ease: "back.out(1.4)", duration: 0.5 }, 8.5);
      tl.to({}, { duration: 0.9 });
      tl.to(".beat-approve", { y: "50%", autoAlpha: 0, ease: "none", duration: 0.4 }, 9.8);
      tl.addLabel("content", 10.0);
      tl.fromTo(".beat-content", { x: "-30%", autoAlpha: 0 }, { x: "0%", autoAlpha: 1, ease: "none", duration: 0.8 }, 10.0);
      tl.fromTo(".beat-content .content-card", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.1, ease: "none", duration: 0.5 }, 10.2);
      tl.to({}, { duration: 0.9 });
      tl.to(".beat-content", { x: "20%", autoAlpha: 0, ease: "none", duration: 0.4 }, 12.0);
      tl.addLabel("render", 12.2);
      tl.fromTo(".beat-render", { y: "40%", autoAlpha: 0 }, { y: "0%", autoAlpha: 1, ease: "none", duration: 0.7 }, 12.2);
      tl.fromTo(".beat-render .specimen", { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.1, ease: "none", duration: 0.5 }, 12.4);
      // Render track scrubs left as you stay on the beat — same mechanic as themes
      tl.to(".render-track", { x: -1380, ease: "none", duration: 1.3 }, 12.6);
      tl.to({}, { duration: 0.5 });
      tl.to(".beat-render", { autoAlpha: 0, y: -30, ease: "none", duration: 0.4 }, 14.0);
      tl.addLabel("themes", 14.2);
      tl.fromTo(".beat-themes", { y: "30%", autoAlpha: 0 }, { y: "0%", autoAlpha: 1, ease: "none", duration: 0.7 }, 14.2);
      // Themes track: 12 live + 1 summary card, way bigger — long scrub reveals the row
      tl.to(".themes-track", { x: -2180, ease: "none", duration: 1.7 }, 14.4);
      tl.to({}, { duration: 0.6 });
      tl.to(".beat-themes", { autoAlpha: 0, y: -20, ease: "none", duration: 0.4 }, 16.0);
      tl.addLabel("critique", 16.2);
      tl.fromTo(".beat-critique", { scale: 0.9, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, ease: "none", duration: 0.7 }, 16.2);
      tl.to({}, { duration: 0.7 });
      tl.to(".beat-critique", { autoAlpha: 0, y: -30, ease: "none", duration: 0.4 }, 17.6);
      tl.addLabel("cta", 17.8);
      tl.fromTo(".beat-cta", { y: "60%", autoAlpha: 0, scale: 0.96 }, { y: "0%", autoAlpha: 1, scale: 1, ease: "none", duration: 0.7 }, 17.8);
      tl.to(".sheet-accent", { autoAlpha: 1, ease: "none", duration: 0.5 }, 17.8);
      tl.to({}, { duration: 0.8 });
    }, wrap);
    return () => ctx.revert();
  }, [reduced, themes]);

  if (reduced) {
    return (
      <div className="w-full">
        <section className="mx-auto max-w-6xl px-6 py-16 text-center">
          <span className="rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Topic to deck -- in minutes</span>
          <h1 className="mt-4 text-[3rem] font-semibold leading-[0.9] tracking-[-0.04em]">Topic in.<br /><span className="bg-gradient-to-r from-accent to-[#8B5CF6] bg-clip-text text-transparent">Standing ovation out.</span></h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-fg-muted">Research, outline, grounded writing, precise render and vision critique -- done for you.</p>
          <div className="mt-6 flex justify-center">{authed ? <Button variant="primary" onClick={handleChat}>Go to chat</Button> : <Button variant="primary" onClick={() => onAuth?.("register")}>Join today -- free</Button>}</div>
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
    <>
      <div ref={wrapRef} className="relative w-full">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="journey-sheet sheet-hero absolute inset-0 bg-[radial-gradient(60rem_36rem_at_50%_0%,var(--color-accent-tint),transparent_70%),radial-gradient(40rem_28rem_at_90%_85%,rgba(124,108,255,0.10),transparent_65%)] opacity-100" />
          <div className="journey-sheet sheet-warm absolute inset-0 bg-[radial-gradient(55rem_32rem_at_20%_25%,rgba(251,191,120,0.14),transparent_62%),radial-gradient(36rem_24rem_at_80%_60%,rgba(244,114,182,0.10),transparent_60%)] opacity-0" />
          <div className="journey-sheet sheet-deep absolute inset-0 bg-[radial-gradient(50rem_30rem_at_50%_50%,rgba(124,108,255,0.06),transparent_70%)] opacity-0" />
          <div className="journey-sheet sheet-accent absolute inset-0 bg-[radial-gradient(60rem_40rem_at_50%_100%,rgba(124,108,255,0.18),transparent_65%),radial-gradient(30rem_20rem_at_20%_20%,rgba(139,92,246,0.12),transparent_60%)] opacity-0" />
        </div>
        <div ref={pinRef} className="relative h-screen w-full overflow-visible">
          <div className="beat beat-hero absolute inset-0 flex flex-col items-center justify-center px-6 text-center py-10">
            <div className="hero-copy max-w-3xl flex flex-col items-center">
              <span className="rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Topic to deck -- in minutes</span>
              <h1 className="mt-6 text-[3.6rem] font-semibold leading-[0.88] tracking-[-0.04em] sm:text-[5.2rem]">Topic in.<br /><span className="bg-gradient-to-r from-accent to-[#8B5CF6] bg-clip-text text-transparent">Standing ovation out.</span></h1>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-fg-muted">Research, outline, grounded writing, precise render and vision critique -- done for you. No templates, no hand-layout.</p>
              <div className="mt-8 flex justify-center">{authed ? <Button variant="primary" onClick={handleChat}>Go to chat</Button> : <Button variant="primary" onClick={() => onAuth?.("register")}>Join today -- free</Button>}</div>
            <div className="hero-cards mt-8 flex justify-center gap-3">
              {(themes ?? []).slice(0, 3).map(t => <div key={t.name} className="w-56"><ThemeMiniCard theme={t} hideSpecimen /></div>)}
            </div>
              <div className="mt-6 text-[11px] uppercase tracking-[0.12em] text-fg-faint">Scroll -- one step at a time ↓</div>
            </div>
          </div>
          <div className="beat beat-brief absolute inset-0 flex items-center justify-center px-6 sm:px-10">
            <div className="mx-auto grid w-full max-w-[1400px] gap-8 lg:grid-cols-[420px_1fr] lg:items-center">
              <div className="copy">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">01 -- Brief</div>
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
          <div className="beat beat-research absolute inset-0 flex items-center px-6 sm:px-10">
            <div className="mx-auto grid w-full max-w-[1400px] gap-10 lg:grid-cols-2">
              <BrowserFrame url="forge.local/research · live">
                <div className="stagger space-y-2">
                  <ResearchMock />
                </div>
              </BrowserFrame>
              <div className="copy">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">02 -- Research</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em]">Research that researches.</h2>
                <p className="mt-3 max-w-md text-[14px] text-fg-muted">Multi-angle SearXNG + arXiv/Crossref, source-diversity guard. Your notes stay editable.</p>
              </div>
            </div>
          </div>
          <div className="beat beat-outline absolute inset-0 flex items-center justify-center px-6">
            <div className="w-full max-w-4xl text-center">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">03 -- Outline</div>
              <h2 className="mt-2 text-[3rem] font-semibold tracking-[-0.03em] sm:text-[4rem]">Outline you can edit.</h2>
              <p className="mx-auto mt-2 max-w-xl text-[14px] text-fg-muted">Cards in plain language -- reorder, retitle, switch type. Nothing renders until you approve.</p>
              <div className="mx-auto mt-6 max-w-2xl"><OutlineMock /></div>
            </div>
          </div>
          <div className="beat beat-approve absolute inset-0 flex items-center justify-center px-6 sm:px-10">
            <div className="mx-auto grid w-full max-w-[1100px] gap-8 lg:grid-cols-[420px_1fr] lg:items-center">
              <div className="text-center lg:text-left">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">04 -- You are the gate</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em]">You're the gate.</h2>
                <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-fg-muted lg:mx-0">Nothing reaches the renderer unapproved. A planned deck is meta+plan with no deck.yaml -- the gate is the product, not a feature.</p>
                <div className="check mt-4 inline-flex items-center gap-2 rounded-full bg-accent-tint px-3 py-1 text-[11px] font-medium text-accent">Human approval required</div>
              </div>
              <BrowserFrame url="forge.local/outline · 4 sections · 12 slides">
                <OutlineMock />
              </BrowserFrame>
            </div>
          </div>
          <div className="beat beat-content absolute inset-0 flex items-center px-6 sm:px-10">
            <div className="mx-auto grid w-full max-w-[1400px] gap-10 lg:grid-cols-2">
              <div className="copy">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">05 -- Content</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em]">Grounded &amp; coherent.</h2>
                <p className="mt-3 max-w-md text-[14px] text-fg-muted">One small-grammar call per slide from your notes. Coherence reframes drift and density keeps fonts readable.</p>
                <div className="mt-4 flex gap-2"><span className="rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent">balanced</span><span className="rounded-full bg-hover px-2.5 py-1 text-[11px]">sparse</span><span className="rounded-full bg-sunken px-2.5 py-1 text-[11px] text-fg-faint">dense</span></div>
              </div>
              <div className="content-card rounded-[1.5rem] border bg-panel p-6 shadow-[var(--shadow-float)]">
                <div className="content-card rounded-xl bg-accent-tint p-4"><div className="font-semibold text-accent">Grounded claim</div><div className="mt-2 text-[13px] leading-relaxed">Electrolyser cost fell 60% since 2020 -- from our research notes, not invented.</div><div className="mt-2 text-[11px] text-accent">✓ grounded</div></div>
                <div className="content-card mt-3 rounded-xl border bg-sunken p-4"><div className="font-semibold">Coherent angle</div><div className="mt-1 text-[13px] text-fg-muted">Same fact, framed for *your* deck's story -- not a generic dump.</div></div>
              </div>
            </div>
          </div>
          <div className="beat beat-render absolute inset-0 flex flex-col justify-center px-6 sm:px-10">
            <div className="mx-auto w-full max-w-[1400px]">
              <div className="copy">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">06 -- Render</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.03em]">Deterministic -- chrome locked.</h2>
                <p className="mt-2 max-w-xl text-[14px] text-fg-muted">Same deck, 75 slide styles. Pick the one that fits the beat -- not the template.</p>
              </div>
              <div className="specimen mt-6 overflow-visible px-1">
                <div className="render-track flex w-max gap-5 will-change-transform">
                  <div className="w-[460px] shrink-0 rounded-2xl border bg-panel p-6 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Bullets</div>
                    <div className="mt-4 space-y-2.5 text-left">
                      <div className="flex gap-2 text-[14px]"><span className="text-accent">•</span> Grounded claim from notes</div>
                      <div className="flex gap-2 text-[14px]"><span className="text-accent">•</span> Coherent framing</div>
                      <div className="flex gap-2 text-[14px]"><span className="text-accent">•</span> One idea per slide</div>
                    </div>
                  </div>
                  <div className="w-[460px] shrink-0 rounded-2xl border bg-panel p-6 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Stats</div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-lg bg-sunken p-4"><div className="text-[20px] font-bold">128%</div><div className="text-[11px] text-fg-faint">recall</div></div>
                      <div className="rounded-lg bg-sunken p-4"><div className="text-[20px] font-bold">3.2×</div><div className="text-[11px] text-fg-faint">faster</div></div>
                      <div className="rounded-lg bg-accent p-4 text-white"><div className="text-[20px] font-bold">0</div><div className="text-[11px] text-white/70">invented</div></div>
                    </div>
                  </div>
                  <div className="w-[460px] shrink-0 rounded-2xl border bg-panel p-6 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Chart</div>
                    <div className="mt-4 flex h-24 items-end gap-1.5">
                      <div className="flex-1 rounded-t bg-accent/20" style={{height:"40%"}} />
                      <div className="flex-1 rounded-t bg-accent/40" style={{height:"65%"}} />
                      <div className="flex-1 rounded-t bg-accent/60" style={{height:"50%"}} />
                      <div className="flex-1 rounded-t bg-accent" style={{height:"85%"}} />
                      <div className="flex-1 rounded-t bg-accent/80" style={{height:"70%"}} />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-fg-faint"><span>ALK</span><span>PEM</span><span>SOEC</span><span>--</span></div>
                  </div>
                  <div className="w-[460px] shrink-0 rounded-2xl border bg-panel p-6 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Compare</div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-accent-tint p-3"><div className="font-semibold text-accent">PEM</div><div className="mt-1 text-[12px]">High efficiency</div><div className="mt-2 h-2 rounded-full bg-accent/30" /></div>
                      <div className="rounded-lg bg-sunken p-3 border"><div className="font-semibold">ALK</div><div className="mt-1 text-[12px]">Low cost</div><div className="mt-2 h-2 rounded-full bg-line" /></div>
                    </div>
                  </div>
                  <div className="w-[460px] shrink-0 rounded-2xl border bg-panel p-6 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Timeline</div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="h-px flex-1 bg-line" /><span className="mx-1 h-2 w-2 rounded-full bg-accent" /><div className="h-px flex-1 bg-line" /><span className="mx-1 h-2 w-2 rounded-full bg-accent" /><div className="h-px flex-1 bg-line" />
                    </div>
                    <div className="mt-3 flex justify-between text-[11px] text-fg-faint"><span>2019</span><span>2021</span><span>2024</span><span>2030</span></div>
                  </div>
                  <div className="w-[460px] shrink-0 rounded-2xl border bg-panel p-6 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Quote</div>
                    <div className="mt-4 rounded-xl bg-sunken p-5 text-center">
                      <div className="text-[19px] leading-tight">"Standing ovation is not about perfection -- it's about coherence."</div>
                      <div className="mt-2 text-[11px] text-fg-faint">-- Critique loop</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="beat beat-themes absolute inset-0 flex flex-col justify-center bg-transparent px-6 text-fg sm:px-10 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-[1400px]">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">07 -- Themes</div>
              <h2 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.03em]">Thirty-eight themes, drawn live.</h2>
              <p className="mt-2 max-w-xl text-[14px] text-fg-muted">Scroll to scrub — the row follows your scroll, showing 12 live themes then 32 more.</p>
              <div className="themes-track mt-6 flex gap-5 overflow-visible will-change-transform">
                {(themes ?? []).slice(0, 12).map(t => (
                  <div key={t.name} className="w-[420px] shrink-0"><ThemeMiniCard theme={t} hideSpecimen /></div>
                ))}
                <div className="grid w-[420px] shrink-0 place-items-center rounded-2xl border border-dashed border-line bg-panel p-6 text-center">
                  <div className="text-[12px] uppercase tracking-[0.12em] text-fg-faint">+ {Math.max(0, (themes?.length ?? 38) - 12)} more themes</div>
                  <div className="mt-2 text-[14px] font-medium">Explore all 38 in app</div>
                  <button onClick={() => onBrowseThemes?.()} className="mt-3 rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-white">Browse themes</button>
                </div>
              </div>
            </div>
          </div>
          <div className="beat beat-critique absolute inset-0 flex items-center justify-center px-6 sm:px-10">
            <div className="mx-auto grid w-full max-w-[1100px] gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="text-center lg:text-left">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">08 -- Vision critique</div>
                <h2 className="mt-2 text-[2.6rem] font-semibold leading-[0.9] tracking-[-0.03em]">Loop that sees.</h2>
                <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-fg-muted lg:mx-0">Every slide is rasterised to PNG and inspected. If text would need 8pt to fit, we flag it -- fix is less text, not smaller font.</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-sunken px-3 py-1 text-[11px] text-fg-faint">PNG → <span className="text-accent">vision</span> → fix → re-render</div>
              </div>
              <BrowserFrame url="forge.local/slide-07.png · vision">
                <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-100 text-amber-700">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.3 3.3 10.3a1.5 1.5 0 0 0 0 2.1l6.9 6.9a1.5 1.5 0 0 0 2.1 0l6.9-6.9a1.5 1.5 0 0 0 0-2.1L12.4 3.3a1.5 1.5 0 0 0-2.1 0Z"/></svg>
                    </span>
                    Vision flagged · 9.9pt would be needed
                  </div>
                  <div className="mt-3 text-[13px] leading-relaxed text-fg">"Bullets would need <span className="font-semibold text-amber-700">9.9pt</span> — floor is <span className="font-semibold">14pt</span>. Trim to 3 bullets."</div>
                  <div className="mt-4 flex gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm">Fix — trim now</span>
                    <span className="inline-flex items-center rounded-full border border-line bg-panel px-3 py-1.5 text-[11px] font-medium text-fg-muted">Keep anyway</span>
                  </div>
                  <div className="mt-3 text-[11px] leading-relaxed text-fg-faint">The loop re-renders after trimming — no tiny type ships.</div>
                </div>
              </BrowserFrame>
            </div>
          </div>
          <div className="beat beat-cta absolute inset-0 flex items-center justify-center px-6 sm:px-10">
            <div className="cta-glow pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_36rem_at_50%_100%,rgba(124,108,255,0.18),transparent_70%)] opacity-0" />
            <div className="relative mx-auto grid w-full max-w-[1100px] gap-8 rounded-[2rem] border border-white/10 bg-accent p-8 text-white shadow-[0_40px_80px_rgba(109,91,255,0.35)] lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:p-10">
              <div className="text-left">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">Ready to build?</div>
                <h2 className="mt-3 text-[2.6rem] font-semibold leading-[0.9] tracking-[-0.03em] sm:text-[3rem]">Topic in.<br />Standing ovation out.</h2>
                <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/80">Join today -- the briefing is one question at a time, everything else defaults. Your first deck in minutes.</p>
                <button onClick={handleChat} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-[13px] font-semibold text-accent shadow-sm hover:bg-white/90">Start a chat →</button>
                <div className="mt-4 flex items-center gap-3 text-[11px] text-white/60"><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-white" /> Hosted</span><span>·</span><span>38 themes</span><span>·</span><span>50+ types</span></div>
              </div>
              <div className="grid gap-3">
                <div className="rounded-xl bg-white p-4 text-fg shadow-sm"><div className="text-[11px] uppercase tracking-wider text-accent">Up next</div><div className="mt-1 font-semibold">Green hydrogen: how electrolysis compares</div><div className="mt-2 flex gap-1.5"><span className="h-2 w-12 rounded-full bg-accent" /><span className="h-2 w-8 rounded-full bg-line" /></div></div>
                <div className="grid grid-cols-3 gap-2 text-center text-white">
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur"><div className="text-[18px] font-bold">12</div><div className="text-[11px] text-white/70">slides</div></div>
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur"><div className="text-[18px] font-bold">38</div><div className="text-[11px] text-white/70">themes</div></div>
                  <div className="rounded-xl bg-white p-3 text-accent"><div className="text-[18px] font-bold">0</div><div className="text-[11px] text-accent/70">hand-layout</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
