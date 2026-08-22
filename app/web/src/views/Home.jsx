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
          end: "+=1200%",
          scrub: 1.5,
          pin: pin,
          anticipatePin: 1,
          snap: { snapTo: "labels", duration: { min: 0.4, max: 0.8 }, delay: 0.2, ease: "power1.inOut" },
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
      tl.to({}, { duration: 0.9 });
      tl.to(".beat-render", { autoAlpha: 0, y: -30, ease: "none", duration: 0.4 }, 14.0);
      tl.addLabel("themes", 14.2);
      tl.fromTo(".beat-themes", { y: "30%", autoAlpha: 0 }, { y: "0%", autoAlpha: 1, ease: "none", duration: 0.7 }, 14.2);
      tl.to(".themes-track", { x: -120, ease: "none", duration: 1.0 }, 14.2);
      tl.to({}, { duration: 0.8 });
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
    <>
      <div ref={wrapRef} className="relative w-full">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="journey-sheet sheet-hero absolute inset-0 bg-[radial-gradient(60rem_36rem_at_50%_0%,var(--color-accent-tint),transparent_70%),radial-gradient(40rem_28rem_at_90%_85%,rgba(124,108,255,0.10),transparent_65%)] opacity-100" />
          <div className="journey-sheet sheet-warm absolute inset-0 bg-[radial-gradient(55rem_32rem_at_20%_25%,rgba(251,191,120,0.14),transparent_62%),radial-gradient(36rem_24rem_at_80%_60%,rgba(244,114,182,0.10),transparent_60%)] opacity-0" />
          <div className="journey-sheet sheet-deep absolute inset-0 bg-base opacity-0" />
          <div className="journey-sheet sheet-accent absolute inset-0 bg-[radial-gradient(60rem_40rem_at_50%_100%,rgba(124,108,255,0.22),transparent_65%),radial-gradient(30rem_20rem_at_20%_20%,rgba(139,92,246,0.16),transparent_60%)] opacity-0" />
        </div>
        <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
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
          <div className="beat beat-outline absolute inset-0 flex items-center justify-center px-6">
            <div className="w-full max-w-4xl text-center">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">03 — Outline</div>
              <h2 className="mt-2 text-[3rem] font-semibold tracking-[-0.03em] sm:text-[4rem]">Outline you can edit.</h2>
              <p className="mx-auto mt-2 max-w-xl text-[14px] text-fg-muted">Cards in plain language — reorder, retitle, switch type. Nothing renders until you approve.</p>
              <div className="mx-auto mt-6 max-w-2xl"><OutlineMock /></div>
            </div>
          </div>
          <div className="beat beat-approve absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="check grid h-24 w-24 place-items-center rounded-full bg-accent text-[32px] text-white shadow-[0_20px_60px_rgba(109,91,255,0.4)]">✓</div>
            <h2 className="mt-6 text-[3.2rem] font-semibold tracking-[-0.03em]">You’re the gate.</h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-fg-muted">Nothing reaches the renderer unapproved. A planned deck is meta+plan with no deck.yaml.</p>
          </div>
          <div className="beat beat-content absolute inset-0 flex items-center px-6 sm:px-10">
            <div className="mx-auto grid w-full max-w-[1400px] gap-10 lg:grid-cols-2">
              <div className="copy">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">05 — Content</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em]">Grounded &amp; coherent.</h2>
                <p className="mt-3 max-w-md text-[14px] text-fg-muted">One small-grammar call per slide from your notes. Coherence reframes drift and density keeps fonts readable.</p>
                <div className="mt-4 flex gap-2"><span className="rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent">balanced</span><span className="rounded-full bg-hover px-2.5 py-1 text-[11px]">sparse</span><span className="rounded-full bg-sunken px-2.5 py-1 text-[11px] text-fg-faint">dense</span></div>
              </div>
              <div className="content-card rounded-[1.5rem] border bg-panel p-6 shadow-[var(--shadow-float)]">
                <div className="content-card rounded-xl bg-accent-tint p-4"><div className="font-semibold text-accent">Grounded claim</div><div className="mt-2 text-[13px] leading-relaxed">Electrolyser cost fell 60% since 2020 — from our research notes, not invented.</div><div className="mt-2 text-[11px] text-accent">✓ grounded</div></div>
                <div className="content-card mt-3 rounded-xl border bg-sunken p-4"><div className="font-semibold">Coherent angle</div><div className="mt-1 text-[13px] text-fg-muted">Same fact, framed for *your* deck’s story — not a generic dump.</div></div>
              </div>
            </div>
          </div>
          <div className="beat beat-render absolute inset-0 flex flex-col justify-center px-6 sm:px-10">
            <div className="mx-auto w-full max-w-[1400px]">
              <div className="copy">
                <div className="text-[11px] uppercase tracking-[0.12em] text-accent">05 — Render</div>
                <h2 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.03em]">Deterministic — chrome locked.</h2>
                <p className="mt-2 max-w-xl text-[14px] text-fg-muted">Same deck.yaml, any of 38 themes. Chrome after theme, so marks never vanish. Editable pptx, plus plate mesh.</p>
              </div>
              <div className="specimen mt-6 grid grid-cols-3 gap-3">
                <ThemeMiniCard theme={themes?.[0] ?? { palette:{bg:"#FFF",surface:"#F1F3F9",ink:"#0F172A",ink_muted:"#94A3B8",accent:"#6D5BFF"}, surfaces:{title:{bg:"#0F172A",ink:"#FFF",muted:"#94A3B8"}}, fonts:{heading:"Inter",body:"Inter"}, label:"Demo", name:"demo" }} />
                <ThemeMiniCard theme={themes?.[1] ?? { palette:{bg:"#FFF",surface:"#F1F3F9",ink:"#0F172A",ink_muted:"#94A3B8",accent:"#6D5BFF"}, surfaces:{title:{bg:"#0F172A",ink:"#FFF",muted:"#94A3B8"}}, fonts:{heading:"Inter",body:"Inter"}, label:"Demo 2", name:"demo2" }} />
                <ThemeMiniCard theme={themes?.[2] ?? { palette:{bg:"#FFF",surface:"#F1F3F9",ink:"#0F172A",ink_muted:"#94A3B8",accent:"#6D5BFF"}, surfaces:{title:{bg:"#0F172A",ink:"#FFF",muted:"#94A3B8"}}, fonts:{heading:"Inter",body:"Inter"}, label:"Demo 3", name:"demo3" }} />
              </div>
              <div className="marquee-stack mt-6 flex gap-3 overflow-hidden opacity-60">
                <div className="flex w-max gap-3"><div className="h-12 w-20 rounded bg-accent" /><div className="h-12 w-20 rounded bg-accent/60" /><div className="h-12 w-20 rounded bg-accent/30" /><div className="h-12 w-20 rounded bg-accent/20" /></div>
              </div>
            </div>
          </div>
          <div className="beat beat-themes absolute inset-0 flex flex-col justify-center bg-base/90 px-6 text-fg sm:px-10 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-[1400px]">
              <div className="text-[11px] uppercase tracking-[0.12em] text-accent">07 — Themes</div>
              <h2 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.03em]">Thirty-eight themes, drawn live.</h2>
              <p className="mt-2 text-[14px] text-fg-muted">Scroll scrubs the row — auto drifts when idle.</p>
              <div className="mt-6 overflow-hidden" onMouseEnter={(e) => e.currentTarget.classList.add("marquee-paused")} onMouseLeave={(e) => e.currentTarget.classList.remove("marquee-paused")}>
                <div className="flex gap-4 will-change-transform" style={{ transform: "translateX(0)" }}>
                  {(themes ?? []).slice(0, 6).map(t => <div key={t.name} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}
                  <div className="grid w-64 shrink-0 place-items-center rounded-2xl border border-line bg-panel p-6 text-center">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-fg-faint">+ {Math.max(0, (themes?.length ?? 38) - 6)} more</div>
                    <div className="mt-1 text-[13px] font-medium">Explore all in app</div>
                    <button onClick={() => onBrowseThemes?.()} className="mt-3 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-white">Browse themes</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="beat beat-critique absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="relative">
              <div className="ring absolute inset-0 rounded-full border border-accent/30" />
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-accent-tint text-accent text-2xl">◯</div>
            </div>
            <h2 className="mt-6 text-[2.6rem] font-semibold tracking-[-0.03em]">08 — Vision critique loop.</h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-fg-muted">Real PNGs inspected; floor flags instead of shrinking. Fix is less text. The loop runs after every generation.</p>
            <div className="mt-4 rounded-full bg-sunken px-3 py-1 text-[11px] text-fg-faint">PNG → vision → fix → re-render</div>
          </div>
          <div className="beat beat-cta absolute inset-0 flex items-center justify-center px-6">
            <div className="cta-glow pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_50%_100%,rgba(124,108,255,0.22),transparent_65%)] opacity-0" />
            <div className="relative w-full max-w-2xl rounded-[1.5rem] bg-accent p-10 text-center text-white shadow-[0_40px_80px_rgba(109,91,255,0.35)]">
              <div className="text-[11px] uppercase tracking-[0.12em] text-white/70">Ready?</div>
              <div className="mt-2 text-[2.4rem] font-semibold">Topic in. Standing ovation out.</div>
              <button onClick={handleChat} className="mt-6 rounded-full bg-white px-6 py-2.5 font-semibold text-accent">Start a chat</button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
