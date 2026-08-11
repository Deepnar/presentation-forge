import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button } from "../components/ui.jsx";
import PromptBox from "../components/PromptBox.jsx";
import DeckThumb from "../components/DeckThumb.jsx";
import { ChevronLeft, ChevronRight } from "../components/icons.jsx";

const SUGGESTED = [
  "Green hydrogen: how electrolysis technologies compare",
  "Real-time ray tracing and the future of rasterisation",
  "Mechanical keyboards: ergonomics of typing",
];

/**
 * The landing view — the "topic in → deck out" promise on the surface. Banner,
 * the generate prompt box, suggestion pills that fill it, and a carousel of
 * real recent decks. The carousel hides only when there are no decks; the
 * prompt and pills are always valid.
 */
export default function Home({ decks, org, onNewDeck, onOpenDeck, onPlanReady, onReportDone }) {
  const [themes, setThemes] = useState([]);
  const [mode, setMode] = useState("deck");
  const [brief, setBrief] = useState("");
  const [focusSignal, setFocusSignal] = useState(0);
  const scrollerRef = useRef(null);

  useEffect(() => {
    api.themes().then((r) => setThemes(r.themes)).catch(() => {});
  }, []);

  const themeLabel = (slug) => themes.find((t) => t.name === slug)?.label ?? slug;

  function pickSuggestion(s) {
    setMode("deck");
    setBrief(s);
    setFocusSignal((n) => n + 1);
  }

  function scrollCarousel(dir) {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.25rem] font-normal leading-tight tracking-tight text-fg">
            What shall we present?
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            {org
              ? `A brief in, a themed deck out — every model call stays on this machine.`
              : `A brief in, a themed deck out — nothing leaves this machine.`}
          </p>
        </div>
        <Button variant="outline" onClick={onNewDeck}>+ New deck</Button>
      </div>

      <div className="mt-10 flex justify-center">
        <PromptBox
          decks={decks}
          mode={mode}
          setMode={setMode}
          brief={brief}
          setBrief={setBrief}
          focusSignal={focusSignal}
          onNewDeck={onNewDeck}
          onPlanReady={onPlanReady}
          onReportDone={onReportDone}
        />
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => pickSuggestion(s)}
            title={s}
            className="pill max-w-[26rem] truncate bg-panel px-3 py-1.5 text-[12.5px] text-fg-muted transition hover:bg-raised hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>

      {decks.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[13px] font-medium uppercase tracking-wider text-fg-faint">Recent decks</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => scrollCarousel(-1)}
                aria-label="Scroll back"
                className="grid h-7 w-7 place-items-center rounded-full border border-line text-fg-faint transition hover:border-line-strong hover:text-fg"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => scrollCarousel(1)}
                aria-label="Scroll forward"
                className="grid h-7 w-7 place-items-center rounded-full border border-line text-fg-faint transition hover:border-line-strong hover:text-fg"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div ref={scrollerRef} className="scroll-x flex gap-4 pb-1">
            {decks.map((d) => (
              <button
                key={d.slug}
                onClick={() => onOpenDeck(d.slug)}
                className="w-64 shrink-0 rounded-[var(--radius-lg)] border border-line bg-panel p-3 text-left transition hover:border-line-strong hover:bg-raised"
              >
                <DeckThumb
                  slug={d.slug}
                  title={d.title}
                  theme={d.theme}
                  className="aspect-video w-full rounded-lg"
                />
                <div className="mt-2.5 truncate text-[13px] font-medium text-fg">{d.title}</div>
                <div className="mt-0.5 text-[11px] text-fg-faint">
                  {d.slides} slides{d.theme ? ` · ${themeLabel(d.theme)}` : ""}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
