import { useEffect, useState } from "react";
import { api } from "../api.js";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { Button } from "../components/ui.jsx";
import { ChatIcon, DocIcon, LayersIcon, PaletteIcon, SearchIcon, SparkleIcon } from "../components/icons.jsx";

export default function Home({ user, onStartChat, onBrowseThemes, onAuth }) {
  const authed = Boolean(user);
  const handleChat = () => onStartChat?.();
  const [themes, setThemes] = useState(null);
  useEffect(() => { api.themes().then(r => setThemes(r.themes)).catch(() => setThemes([])); }, []);
  return (
    <div className="w-full bg-transparent snap-y snap-mandatory">
      {/* HERO */}
      <section className="relative flex h-screen snap-start items-center justify-center overflow-hidden bg-transparent px-6 text-center">
        <div className="max-w-3xl">
          <span className="rounded-full border border-accent-dim/60 bg-accent-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Topic to deck — in minutes</span>
          <h1 className="mt-6 text-[3.6rem] font-semibold leading-[0.88] tracking-[-0.04em] sm:text-[5.2rem]">Topic in.<br /><span className="bg-gradient-to-r from-accent to-[#8B5CF6] bg-clip-text text-transparent">Standing ovation out.</span></h1>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-fg-muted">Research, outline, grounded writing, precise render and vision critique — done for you.</p>
          <div className="mt-8 flex justify-center">{authed ? <Button variant="primary" onClick={handleChat}>Go to chat</Button> : <Button variant="primary" onClick={() => onAuth?.("register")}>Join today — free</Button>}</div>
          <div className="mt-6 text-[11px] uppercase tracking-[0.12em] text-fg-faint">Scroll ↓ one step at a time</div>
        </div>
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_30rem_at_50%_0%,var(--color-accent-tint),transparent_70%)] opacity-60" />
      </section>
      {/* PIPELINE STEPS — each full screen, snap, large, varied */}
      {[
        { n: "01", label: "brief", title: "One question at a time.", desc: "Topic → title → team → theme → density. Everything defaults.", bg: "bg-panel", align: "left" },
        { n: "02", label: "research", title: "Research that researches.", desc: "Multi-angle SearXNG + arXiv/Crossref, source-diversity guard.", bg: "bg-sunken", align: "right" },
        { n: "03", label: "outline", title: "Outline you can edit.", desc: "Cards in plain language — reorder, retitle, switch type.", bg: "bg-panel", align: "center" },
        { n: "04", label: "you approve", title: "You’re the gate.", desc: "Nothing reaches the renderer unapproved.", bg: "bg-accent text-white", align: "center" },
        { n: "05", label: "content", title: "Grounded & coherent.", desc: "One small-grammar call per slide from your notes.", bg: "bg-panel", align: "left" },
        { n: "06", label: "render", title: "Render — deterministic.", desc: "38 themes × styles, chrome locked after theme.", bg: "bg-sunken", align: "right" },
        { n: "07", label: "critique", title: "Vision critique loop.", desc: "Real PNGs inspected; floor flags instead of shrinking.", bg: "bg-panel", align: "center" },
      ].map((s, i) => (
        <section key={s.label} className={`relative flex h-screen snap-start items-center overflow-hidden px-6 sm:px-10 ${s.bg === "bg-accent text-white" ? "bg-accent text-white" : s.bg === "bg-sunken" ? "bg-sunken/80 backdrop-blur-sm" : "bg-panel/80 backdrop-blur-sm"}`}>
          <div className={`mx-auto flex w-full max-w-[1400px] flex-col gap-8 ${s.align === "center" ? "items-center text-center" : s.align === "left" ? "lg:flex-row" : "lg:flex-row-reverse"} lg:items-center`}>
            <div className="flex-1">
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${s.bg.includes("accent") ? "border-white/20 bg-white/10 text-white" : "border-accent-dim/60 bg-accent-tint text-accent"}`}>{s.n} — {s.label}</div>
              <h2 className={`mt-4 text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.03em] sm:text-[3.6rem] ${s.bg.includes("accent") ? "text-white" : "text-fg"}`}>{s.title}</h2>
              <p className={`mt-3 max-w-md text-[15px] leading-relaxed ${s.bg.includes("accent") ? "text-white/80" : "text-fg-muted"} ${s.align === "center" ? "mx-auto" : ""}`}>{s.desc}</p>
            </div>
            <div className="flex-1 flex justify-center">
              <div className={`w-full max-w-md rounded-[1.5rem] border bg-panel p-4 shadow-[var(--shadow-float)] ${i % 2 === 0 ? "rotate-[-1deg]" : "rotate-[1deg]"}`}>
                {s.label === "brief" && <div><div className="h-2 w-12 rounded-full bg-accent/20" /><div className="mt-3 h-3 w-3/4 rounded-full bg-line" /><div className="mt-6 grid grid-cols-3 gap-2"><div className="h-16 rounded-lg bg-accent-tint" /><div className="h-16 rounded-lg bg-sunken" /><div className="h-16 rounded-lg bg-sunken" /></div></div>}
                {s.label === "research" && <div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-sunken p-3"><div className="text-[18px] font-bold">128%</div><div className="text-[11px] text-fg-faint">more recall</div></div><div className="rounded-xl bg-sunken p-3"><div className="text-[18px] font-bold">3.2×</div><div className="text-[11px] text-fg-faint">faster</div></div><div className="rounded-xl bg-accent p-3 text-white"><div className="text-[18px] font-bold">0</div><div className="text-[11px] text-white/70">invented</div></div></div>}
                {s.label === "outline" && <div className="rounded-xl border bg-sunken p-4"><div className="text-[11px] uppercase text-fg-faint">Section 02</div><div className="font-semibold">The argument in three parts</div><div className="flex gap-1.5 mt-2"><span className="bg-accent text-white rounded-full px-2 py-0.5 text-[10px]">01</span><span className="bg-line rounded-full px-2 py-0.5 text-[10px]">02</span></div></div>}
                {s.label === "you approve" && <div className="text-center py-6"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent text-white text-2xl">✓</div><div className="mt-3 font-medium">Nothing renders until you approve</div></div>}
                {s.label === "content" && <div className="grid grid-cols-2 gap-2"><div className="bg-accent-tint p-3 rounded-lg"><div className="font-semibold text-accent">Before</div><div className="h-2 bg-accent/20 rounded-full mt-1" /></div><div className="bg-sunken p-3 rounded-lg border"><div className="font-semibold">After</div><div className="h-2 bg-line rounded-full mt-1" /></div></div>}
                {s.label === "render" && <div className="flex gap-2 overflow-hidden"><div className="w-40 shrink-0"><ThemeMiniCard theme={themes?.[0] ?? { palette:{bg:"#FFF",surface:"#F1F3F9",ink:"#0F172A",ink_muted:"#94A3B8",accent:"#6D5BFF",accent_alt:"#8B5CF6",on_accent:"#FFF"}, surfaces:{title:{bg:"#0F172A",ink:"#FFF",muted:"#94A3B8"}}, fonts:{heading:"Inter",body:"Inter"}, label:"Demo", name:"demo" }} /></div><div className="w-40 shrink-0 hidden sm:block"><ThemeMiniCard theme={themes?.[1] ?? { palette:{bg:"#FFF",surface:"#F1F3F9",ink:"#0F172A",ink_muted:"#94A3B8",accent:"#6D5BFF",accent_alt:"#8B5CF6",on_accent:"#FFF"}, surfaces:{title:{bg:"#0F172A",ink:"#FFF",muted:"#94A3B8"}}, fonts:{heading:"Inter",body:"Inter"}, label:"Demo 2", name:"demo2" }} /></div></div>}
                {s.label === "critique" && <div className="rounded-xl border bg-panel p-6 text-center"><div className="mx-auto h-10 w-10 rounded-full bg-accent-tint grid place-items-center text-accent">◯</div><div className="mt-3 font-semibold">Floor flags instead of 8pt</div><div className="text-[13px] text-fg-muted">Fix is less text</div></div>}
              </div>
            </div>
          </div>
        </section>
      ))}
      {/* THEMES FAST PREVIEW */}
      <section className="relative flex h-screen snap-start flex-col justify-center overflow-hidden bg-[#0B0F1A]/90 backdrop-blur-sm px-6 text-white sm:px-10">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Design languages</div>
          <h2 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.03em]">Thirty-eight themes, drawn live.</h2>
          <div className="mt-6 flex gap-4 overflow-hidden">
            <div className="flex w-max animate-[marquee_12s_linear_infinite] gap-4">
              {(themes ?? []).slice(0, 12).map(t => <div key={t.name} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}
              {(themes ?? []).slice(0, 12).map(t => <div key={`${t.name}-2`} className="w-64 shrink-0"><ThemeMiniCard theme={t} /></div>)}
            </div>
          </div>
          <style>{`@keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
        </div>
      </section>
      {/* FINAL CTA */}
      <section className="relative flex h-screen snap-start items-center justify-center bg-accent px-6 text-white">
        <div className="w-full max-w-2xl rounded-[1.5rem] bg-white p-10 text-center text-fg">
          <div className="text-[11px] uppercase tracking-[0.12em] text-accent">Ready?</div>
          <div className="mt-2 text-[2.4rem] font-semibold text-fg">Topic in. Standing ovation out.</div>
          <button onClick={handleChat} className="mt-6 rounded-full bg-accent px-6 py-2.5 font-semibold text-white">Start a chat</button>
        </div>
      </section>
      <footer className="flex min-h-[50vh] snap-start items-center border-t border-line bg-panel px-6 py-12 text-[13px] text-fg-muted">
        <span>© {new Date().getFullYear()} Presentation Forge — <a href="#/privacy" className="hover:text-fg">Privacy</a> · <a href="#/terms" className="hover:text-fg">Terms</a> · <a href="#/docs" className="hover:text-fg">Docs</a></span>
      </footer>
    </div>
  );
}
