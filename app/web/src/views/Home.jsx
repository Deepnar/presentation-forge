import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useReveal } from "../lib/reveal.js";
import Footer from "../components/Footer.jsx";
import { Card, CTA, Figure, Section, SectionHead } from "../components/landing/parts.jsx";
import ThemeCycle from "../components/landing/ThemeCycle.jsx";
import TypeScroll from "../components/landing/TypeScroll.jsx";
import ThemeWall from "../components/landing/ThemeWall.jsx";

/** The pipeline, in the reader's terms rather than the module names. */
const STEPS = [
  { n: "01", t: "Brief", d: "One question at a time — topic, title, team, theme, density. Everything has a default, so answering nothing still works." },
  { n: "02", t: "Research", d: "Multi-angle search across the web and the literature, with a guard against leaning on a single source. The notes stay yours to edit." },
  { n: "03", t: "Outline", d: "A plan in plain language. Reorder it, retitle it, change what kind of slide a point should be." },
  { n: "04", t: "You approve", d: "Nothing reaches the renderer until you say so. The gate is the product, not a step in it.", gate: true },
  { n: "05", t: "Content", d: "Each slide written against your research rather than invented, and kept to what its layout can actually hold." },
  { n: "06", t: "Render", d: "A deck and a matching report. The model never picks a coordinate, a colour or a typeface." },
  { n: "07", t: "Critique", d: "Every slide rasterised and read back, so a flaw is caught in the image rather than on the projector." },
];

/** The product beyond the gallery. */
const FEATURES = [
  { t: "It interviews you", d: "The briefing is a conversation, not a form. Say the topic and it works out the rest, asking only where your answer would change the deck." },
  { t: "Sources you can open", d: "Research keeps what it read. Every claim traces back to a note, and the notes stay in the project for you to check or replace." },
  { t: "Edit any slide", d: "Change a headline, swap a slide's type, reorder the argument. Re-render and the layout re-fits itself around the new text." },
  { t: "Speaker notes", d: "A script per slide, written from the same material, so what you say and what is on the screen do not drift apart." },
  { t: "A report, not just slides", d: "The companion document comes out of the same content — structured, paginated, with its contents page numbered correctly." },
  { t: "Your marks, not ours", d: "Institution, department, guide and crest are per account and applied by locked code, so branding is consistent and never the model's idea." },
  { t: "Runs on your machine", d: "Local models are a first-class backend, not a fallback. Nothing has to leave the laptop if you would rather it did not." },
  { t: "Real files out", d: "A .pptx and a .docx you can open, edit and hand in. No viewer, no lock-in, no export step that loses the formatting." },
];

/** What the checks actually ask, in the order they ask it. */
const CHECKS = [
  { q: "Is the box on the slide?", a: "A watcher runs inside every render. A negative width is written without complaint and draws something that is not the shape." },
  { q: "Was the field drawn at all?", a: "Text that is never drawn is never fitted, so nothing downstream can miss it. Each field is marked and read back." },
  { q: "Does the text fit the box?", a: "Every theme against every slide type, measured before anything is rendered." },
  { q: "Did it survive the render?", a: "The slide is rasterised and the words read off the image. A file that parses proves only that it parses." },
];

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

  // The hero recedes as the first section arrives. Driven from scroll position
  // rather than a scroll-linked animation because it has to stop dead under
  // reduced motion, and a paused animation still holds its transform.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      const y = window.scrollY;
      const p = Math.min(1, y / (window.innerHeight * 0.9));
      el.style.transform = `translate3d(0, ${p * -60}px, 0)`;
      el.style.opacity = String(1 - p * 0.85);
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
    // No overflow clipping anywhere up this tree: overflow-x-hidden makes an
    // element a scroll container, and position:sticky inside one sticks to
    // THAT box rather than the viewport — which silently turns the scrubbed
    // sections into 500vh of blank page. The rails clip themselves instead.
    <div ref={pageRef} className="w-full">
      {/* ------------------------------------------------------------ hero */}
      {/* A <section>, not a <header>: App.jsx locates the product bar with
          document.querySelector("header"), and a second header element makes
          which one it finds a matter of document order. */}
      <section className="relative flex min-h-[86vh] items-center px-5 sm:px-8">
        <div ref={heroRef} className="mx-auto w-full max-w-5xl text-center will-change-transform">
          <div className="reveal eyebrow">Bulk by machine, polish by you</div>
          <h1 className="reveal display-1 mt-5 text-fg" style={{ "--reveal-delay": "70ms" }}>
            Bring the topic.<br />Leave with the deck.
          </h1>
          <p className="reveal lede mx-auto mt-6 max-w-xl" style={{ "--reveal-delay": "140ms" }}>
            It reads around the subject, argues a structure, writes every slide against what it
            found, and renders the whole thing — deck and report — in a design you did not have to
            think about.
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

      {/* -------------------------------------------------------- pipeline */}
      <Section>
        <SectionHead
          eyebrow="How it works"
          title="Seven steps, and you own the fourth."
          lede="The machine does the volume. The judgement stays with you, at the point where changing your mind still costs nothing."
        />
        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <Card
              key={s.n}
              as="li"
              className={`reveal ${s.gate ? "border-accent-dim bg-accent-tint" : ""}`}
              style={{ "--reveal-delay": `${i * 45}ms` }}
            >
              <div className="flex items-baseline gap-2.5">
                <span className={`font-mono text-[11px] ${s.gate ? "text-accent" : "text-fg-faint"}`}>{s.n}</span>
                <span className="text-[14px] font-semibold text-fg">{s.t}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{s.d}</p>
            </Card>
          ))}
        </ol>
      </Section>

      {/* ------------------------------------------------------ vocabulary */}
      <Section tight>
        <SectionHead
          eyebrow="The vocabulary"
          title={typeCount ? `${typeCount} ways to say it.` : "A slide type for the point you are making."}
          lede="A comparison is not a list, and a timeline is not a table. Each type is a layout written by hand and checked against every theme, so the shape fits the argument instead of the argument fitting a bullet."
        />
      </Section>
      <TypeScroll manifest={manifest} />

      {/* ----------------------------------------------------- theme cycle */}
      <Section tight>
        <SectionHead
          eyebrow="One deck, every theme"
          title="The words are yours. The design is not your problem."
          lede="Content and presentation are separated all the way down — a theme owns every colour, typeface and coordinate, and the writing never touches them. Keep scrolling and watch the same slide change clothes."
        />
      </Section>
      <ThemeCycle manifest={manifest} />

      {/* ---------------------------------------------------------- features */}
      <Section>
        <SectionHead
          eyebrow="What you actually get"
          title="A deck is the output. It is not the whole product."
          lede="Everything around the slides — the interview, the sources, the editing, the script, the report — is the part that makes the output yours."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Card key={f.t} className="reveal" style={{ "--reveal-delay": `${(i % 4) * 55}ms` }}>
              <div className="text-[14px] font-semibold text-fg">{f.t}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{f.d}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------- verification */}
      <Section>
        <SectionHead
          eyebrow="Why it holds up"
          title="A file that opens is not a slide that works."
          lede="A deck can be written successfully with text running off the canvas and one invisible colour on another. So the render is not the last step — it is the thing that gets inspected."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {CHECKS.map((c, i) => (
            <Card key={c.q} className="reveal" style={{ "--reveal-delay": `${i * 60}ms` }}>
              <div className="text-[14px] font-semibold text-fg">{c.q}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{c.a}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------------- gallery */}
      <Section>
        <SectionHead
          eyebrow="The gallery"
          title={themeCount ? `All ${themeCount}, at a glance.` : "The gallery"}
          lede="Every one is a hand-authored set of tokens — palette, type scale, spacing, shape. These are their real renders, not swatches."
        />
        <ThemeWall themes={themes} onBrowse={onBrowseThemes} />
      </Section>

      {/* -------------------------------------------------------------- cta */}
      <Section tight>
        <div className="reveal rounded-hero border border-line bg-panel px-6 py-14 text-center shadow-[var(--shadow-float)] sm:px-12">
          <h2 className="display-2 text-fg">Bring a topic.</h2>
          <p className="lede mx-auto mt-4 max-w-md">
            The briefing asks one question at a time and defaults the rest. Your first deck takes minutes.
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
