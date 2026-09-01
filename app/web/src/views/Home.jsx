import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useReveal } from "../lib/reveal.js";
import Footer from "../components/Footer.jsx";
import { CTA, Figure, Section } from "../components/landing/parts.jsx";
import PipelineScene from "../components/landing/PipelineScene.jsx";
import TypeScroll from "../components/landing/TypeScroll.jsx";
import ThemeCycle from "../components/landing/ThemeCycle.jsx";
import FeatureScene from "../components/landing/FeatureScene.jsx";
import CheckScene from "../components/landing/CheckScene.jsx";

/**
 * The landing page.
 *
 * Built as a run of pinned SCENES rather than a stack of blocks. Each scene
 * owns a slice of scroll and spends it advancing something — a step, a theme,
 * a rail, a grid assembling itself — so a reader who does nothing but scroll
 * still sees the whole product. Nothing on this page needs to be clicked or
 * dragged to reveal its content.
 *
 * Every scene keeps its own heading inside its sticky frame. A heading in a
 * block above the frame means the frame begins below the fold, and the reader
 * gets a screen of empty page before the content catches up.
 */
export default function Home({ user, onStartChat, onBrowseThemes, onAuth }) {
  const [themes, setThemes] = useState(null);
  const [manifest, setManifest] = useState(null);
  const pageRef = useRef(null);
  const heroRef = useRef(null);

  useEffect(() => {
    api.themes().then((r) => setThemes(r.themes)).catch(() => setThemes([]));
    api.landing().then(setManifest);
  }, []);

  useReveal(pageRef, [themes, manifest]);

  // The hero recedes as the first scene arrives. Driven from scroll position
  // rather than a scroll-linked animation, because it has to stop dead under
  // reduced motion and a paused animation still holds its transform.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      const p = Math.min(1, window.scrollY / (window.innerHeight * 0.9));
      el.style.transform = `translate3d(0, ${p * -70}px, 0)`;
      el.style.opacity = String(1 - p * 0.9);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  const typeCount = manifest?.vocabulary?.types;
  const themeCount = themes?.length;
  const start = () => (user ? onStartChat?.() : onAuth?.("register"));

  return (
    <div ref={pageRef} className="w-full">
      {/* A <section>, not a <header>: App.jsx finds the product bar with
          document.querySelector("header"), and a second header element makes
          which one it gets a matter of document order. */}
      <section className="relative flex min-h-[88vh] items-center px-5 sm:px-8">
        <div ref={heroRef} className="mx-auto w-full max-w-5xl text-center will-change-transform">
          <div className="reveal eyebrow">Bulk by machine, polish by you</div>
          <h1 className="reveal display-1 mt-5 text-fg" style={{ "--reveal-delay": "70ms" }}>
            Bring the topic.<br />Leave with the deck.
          </h1>
          <p className="reveal lede mx-auto mt-6 max-w-xl" style={{ "--reveal-delay": "140ms" }}>
            It reads around the subject, argues a structure, writes every slide against what it
            found, and renders the whole thing — deck and report — in a design you did not have
            to think about.
          </p>
          <div className="reveal mt-9 flex flex-wrap items-center justify-center gap-3" style={{ "--reveal-delay": "200ms" }}>
            <CTA onClick={start}>{user ? "Go to your decks" : "Start free"}</CTA>
            <CTA variant="secondary" onClick={onBrowseThemes}>See the themes</CTA>
          </div>
          <div className="reveal mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4" style={{ "--reveal-delay": "260ms" }}>
            <Figure value={themeCount ?? "—"} label="Design languages, each human-authored" />
            <Figure value={typeCount ?? "—"} label="Slide types, none of them a template" />
            <Figure value="0" label="Coordinates chosen by a model" />
            <Figure value="2" label="Files out: the deck and its report" />
          </div>
        </div>
      </section>

      <PipelineScene />
      <TypeScroll manifest={manifest} typeCount={typeCount} />
      <ThemeCycle manifest={manifest} themeCount={themeCount} onBrowseThemes={onBrowseThemes} />
      <FeatureScene />
      <CheckScene />

      <Section tight>
        <div className="reveal rounded-hero border border-line bg-panel px-6 py-14 text-center shadow-[var(--shadow-float)] sm:px-12">
          <h2 className="display-2 text-fg">Bring a topic.</h2>
          <p className="lede mx-auto mt-4 max-w-md">
            The briefing asks one question at a time and defaults the rest. Your first deck takes
            minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <CTA onClick={start}>{user ? "Go to your decks" : "Start free"}</CTA>
            {!user && (
              <button
                onClick={() => onAuth?.("login")}
                className="press rounded-pill px-5 py-3 text-[14px] font-medium text-fg-muted transition-colors hover:text-fg"
              >
                I already have an account
              </button>
            )}
          </div>
        </div>
      </Section>

      <Footer />
    </div>
  );
}
