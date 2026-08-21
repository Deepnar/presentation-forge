import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { Button } from "../components/ui.jsx";
import { ChatIcon, DocIcon, LayersIcon, PaletteIcon, SearchIcon, SparkleIcon, IdIcon } from "../components/icons.jsx";
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
      if (!slides.length) return;
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
      slides.forEach((slide, i) => {
        if (i === 0) return;
        tl.fromTo(slide, { autoAlpha: 0, x: 80, scale: 0.98 }, { autoAlpha: 1, x: 0, scale: 1, ease: "none", duration: 0.8 }, i * 0.9);
        tl.to(slides[i-1], { autoAlpha: 0, x: -80, scale: 0.98, ease: "none", duration: 0.8 }, i * 0.9);
        // parallax for image vs text inside slide
        const img = slide.querySelector("[data-parallax-img]");
        const txt = slide.querySelector("[data-parallax-txt]");
        if (img) tl.fromTo(img, { y: 40 }, { y: -40, ease: "none", duration: 0.9 }, i * 0.9);
        if (txt) tl.fromTo(txt, { y: 20 }, { y: -20, ease: "none", duration: 0.9 }, i * 0.9);
      });
    }, containerRef);
    return () => ctx.revert();
  }, [themes]);
  const steps = [
    { label: "brief", title: "One question at a time", desc: "Topic → title → team → theme → density. Everything defaults; saved formats skip the fixed parts.", icon: ChatIcon, mock: "bullets", img: themes?.[0] },
    { label: "research", title: "Research that researches", desc: "Multi-angle SearXNG + arXiv/Crossref, source-diversity guard. Notes stay editable — grounding checks every claim.", icon: SearchIcon, mock: "stats", img: themes?.[1] },
    { label: "outline", title: "Outline you can edit", desc: "Cards in plain language — reorder, retitle, switch type. Nothing renders until you approve.", icon: LayersIcon, mock: "agenda", img: themes?.[2] },
    { label: "you approve", title: "You’re the gate", desc: "Nothing reaches the renderer unapproved. A planned deck is meta+plan with no deck.yaml.", icon: SparkleIcon, mock: "quote", img: themes?.[3] },
    { label: "content", title: "Content, grounded & coherent", desc: "One small-grammar call per slide from your notes. Coherence reframes drift; density keeps fonts readable.", icon: DocIcon, mock: "compare", img: themes?.[4] },
    { label: "render", title: "Render — deterministic", desc: "38 themes × styles, chrome locked after theme. Editable pptx + plate mesh gradients.", icon: LayersIcon, mock: "chart", img: themes?.[5] },
    { label: "critique", title: "Vision critique loop", desc: "Real PNGs inspected; floor flags instead of shrinking. Fix is less text.", icon: SparkleIcon, mock: "timeline", img: themes?.[6] },
  ];
  return (
    <div className="w-full bg-transparent">
      <section ref={containerRef} className="relative w-full h-[700vh] bg-transparent">
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          {/* hero slide 0 */}
          <div className="tour-slide absolute inset-0 flex flex-col items-center justify-center px-6 text-center bg-transparent">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Topic to deck — in minutes</span>
              <h1 className="mt-4 text-[3rem] font-semibold leading-[0.92] tracking-[-0.04em] sm:text-[4rem]">Topic in.<br /><span className="bg-gradient-to-r from-accent via-[#8B5CF6] to-[#7C6CFF] bg-clip-text text-transparent">Standing ovation out.</span></h1>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">Research, outline, grounded writing, precise render and vision critique — done for you. You verify facts and make it yours.</p>
              <div className="mt-6 flex justify-center">
                {authed ? <Button variant="primary" onClick={handleChat}>Go to chat</Button> : <Button variant="primary" onClick={() => onAuth?.("register")}>Join today — free</Button>}
              </div>
              <div className="mt-4 text-[11px] uppercase tracking-[0.12em] text-fg-faint animate-pulse">Scroll to begin ↓</div>
            </div>
          </div>
          {steps.map(({ label, title, desc, icon: Icon, mock }, i) => (
            <div key={label} className="tour-slide absolute inset-0 flex items-center justify-center px-6 bg-transparent opacity-0 invisible">
              <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
                <div data-parallax-txt className="max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{i+1}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-accent">{label}</span>
                  </div>
                  <h2 className="mt-3 text-[1.9rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">{desc}</p>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent">{mock}</span>
                    <span className="rounded-full bg-sunken px-2.5 py-1 text-[11px] text-fg-faint">live demo</span>
                  </div>
                </div>
                <div data-parallax-img className="relative">
                  <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-float)]">
                    <MockSlide type={mock} />
                    <div className="border-t border-line/60 bg-sunken/60 px-3 py-2 flex justify-between text-[11px] text-fg-faint"><span>{mock}</span><span className="h-2 w-2 rounded-full bg-accent animate-pulse" /></div>
                  </div>
                  {steps[i]?.img && (
                    <div className="absolute -bottom-6 -right-6 hidden w-48 rotate-2 rounded-xl border border-white/10 bg-white p-2 shadow-lg lg:block opacity-80">
                      <ThemeMiniCard theme={steps[i].img} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {/* final CTA slide */}
          <div className="tour-slide absolute inset-0 flex items-center justify-center px-6 bg-transparent opacity-0 invisible">
            <div className="w-full max-w-3xl rounded-[1.5rem] border border-white/10 bg-accent p-8 text-white text-center">
              <div className="text-[11px] uppercase tracking-[0.12em] text-white/70">Ready?</div>
              <div className="mt-2 text-[2rem] font-semibold">Topic in. Standing ovation out.</div>
              <p className="mt-2 text-white/80">Join today — the briefing is one question at a time.</p>
              <button onClick={handleChat} className="mt-6 rounded-full bg-white px-6 py-2.5 font-semibold text-accent">Start a chat</button>
            </div>
          </div>
        </div>
      </section>
      <footer className="w-full border-t border-line bg-panel">
        <div className="mx-auto max-w-[1440px] px-6 py-8 flex justify-between text-[12px] text-fg-faint"><span>© {new Date().getFullYear()} Presentation Forge</span><span className="flex gap-4"><a href="#/privacy" className="hover:text-fg">Privacy</a><a href="#/terms" className="hover:text-fg">Terms</a><a href="#/docs" className="hover:text-fg">Docs</a><a href="#/usage" className="hover:text-fg">API usage</a></span></div>
      </footer>
    </div>
  );
}

function MockSlide({ type }) {
  const wrap = "flex h-[220px] flex-col justify-center p-6";
  switch(type){
    case "bullets": return <div className={wrap}><div className="font-semibold">Why this matters</div><div className="mt-2 space-y-1.5 text-[13px] text-fg-muted"><div>• Grounded claims from your notes</div><div>• Coherent framing per section</div><div>• One idea per slide</div></div></div>;
    case "stats": return <div className={`${wrap} gap-3`}><div className="grid grid-cols-3 gap-3 text-center"><div><div className="text-[20px] font-bold">128%</div><div className="text-[11px] text-fg-faint">more recall</div></div><div><div className="text-[20px] font-bold">3.2×</div><div className="text-[11px] text-fg-faint">faster</div></div><div><div className="text-[20px] font-bold">0</div><div className="text-[11px] text-fg-faint">invented</div></div></div><div className="h-1.5 bg-sunken rounded-full"><div className="h-full w-[78%] bg-accent rounded-full" /></div></div>;
    case "chart": return <div className={wrap}><div className="font-semibold">Cost by tech</div><div className="mt-3 flex items-end gap-1 h-20"><div className="flex-1 bg-accent/30 rounded-t" style={{height:"45%"}} /><div className="flex-1 bg-accent/60 rounded-t" style={{height:"68%"}} /><div className="flex-1 bg-accent rounded-t" style={{height:"92%"}} /></div></div>;
    case "compare": return <div className={`${wrap} gap-2`}><div className="grid grid-cols-2 gap-2"><div className="bg-accent-tint p-3 rounded-lg"><div className="text-accent font-semibold">Before</div><div className="h-1.5 bg-accent/20 rounded-full mt-1" /></div><div className="bg-sunken p-3 rounded-lg"><div className="font-semibold">After</div><div className="h-1.5 bg-line rounded-full mt-1" /></div></div></div>;
    case "agenda": return <div className={wrap}><div className="border rounded-lg p-3 bg-sunken"><div className="text-[11px] uppercase text-fg-faint">Section 02</div><div className="font-semibold">The argument in three parts</div><div className="flex gap-1.5 mt-2"><span className="bg-accent text-white rounded-full px-2 py-0.5 text-[10px]">01</span><span className="bg-line rounded-full px-2 py-0.5 text-[10px]">02</span></div></div></div>;
    case "quote": return <div className={`${wrap} items-center text-center`}><div className="h-6 w-6 bg-accent-tint rounded-full grid place-items-center text-accent">“</div><div className="mt-2 font-medium">Nothing renders until a human says go.</div></div>;
    case "timeline": return <div className={wrap}><div className="relative flex justify-between"><div className="absolute left-0 right-0 top-1/2 h-px bg-line" /><span className="h-7 w-7 rounded-full border bg-panel grid place-items-center">•</span><span className="h-7 w-7 rounded-full bg-accent text-white grid place-items-center">•</span><span className="h-7 w-7 rounded-full border bg-panel grid place-items-center">•</span></div><div className="flex justify-between text-[11px] text-fg-faint mt-2"><span>Brief</span><span>Outline</span><span>Render</span></div></div>;
    default: return <div className={wrap}>Mock</div>;
  }
}
