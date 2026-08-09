import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Empty, Spinner, SlideSkeleton } from "../components/ui.jsx";
import Lightbox from "../components/Lightbox.jsx";

export default function Decks() {
  const [decks, setDecks] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.decks().then((r) => setDecks(r.decks)).catch(() => setDecks([]));
  }, []);

  if (open) return <DeckDetail slug={open} onBack={() => setOpen(null)} />;

  return (
    <div className="mx-auto max-w-6xl px-8 py-9">
      <header className="mb-7">
        <h1 className="text-[1.7rem] font-semibold tracking-tight">Decks</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Each deck is a folder under <code className="text-fg-faint">decks/</code> holding
          a <code className="text-fg-faint">deck.yaml</code>.
        </p>
      </header>

      {decks === null && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[7.5rem] rounded-card" />)}
        </div>
      )}

      {decks?.length === 0 && (
        <Empty
          title="No decks yet"
          hint="The intake wizard will create these once the generation pipeline lands. Until then, a deck is any folder under decks/ containing a deck.yaml."
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {decks?.map((d) => (
          <button
            key={d.slug}
            onClick={() => setOpen(d.slug)}
            className="group rounded-card border border-line bg-panel p-4 text-left transition hover:border-line-strong hover:bg-raised"
          >
            <div className="line-clamp-2 text-[15px] font-medium leading-snug text-fg">
              {d.title}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-fg-faint">
              <span className="tabular-nums">{d.slides} slides</span>
              {d.theme && (
                <>
                  <span className="text-line-strong">·</span>
                  <span className="font-mono">{d.theme}</span>
                </>
              )}
            </div>
            <div className="mt-3 border-t border-line pt-2.5 text-[10.5px] text-fg-faint">
              {new Date(d.updated).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DeckDetail({ slug, onBack }) {
  const [data, setData] = useState(null);
  const [themes, setThemes] = useState([]);
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    api.deck(slug).then((r) => {
      setData(r);
      setTheme(r.deck.theme ?? "");
    });
    api.themes().then((r) => setThemes(r.themes)).catch(() => {});
  }, [slug]);

  async function rerender() {
    setBusy(true);
    setProblems([]);
    try {
      const r = await api.renderDeck(slug, { theme: theme || undefined });
      const stamp = Date.now();
      setData((d) => ({
        ...d,
        slides: r.slides.map((s) => `${s}?t=${stamp}`),
        thumbs: (r.thumbs ?? r.slides).map((s) => `${s}?t=${stamp}`),
      }));
      setProblems(r.problems ?? []);
    } catch (err) {
      setProblems([err.message, ...(err.errors ?? [])]);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-9">
        <div className="skeleton h-8 w-80 rounded-lg" />
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <SlideSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  const types = data.deck.slides.map((s) => s.type);

  return (
    <div className="mx-auto max-w-6xl px-8 py-9">
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-faint transition hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
        All decks
      </button>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[1.7rem] font-semibold leading-tight tracking-tight">
            {data.deck.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-fg-muted">
            <span className="tabular-nums">{data.deck.slides.length} slides</span>
            {data.deck.sections?.length > 0 && (
              <>
                <span className="text-line-strong">·</span>
                <span className="tabular-nums">{data.deck.sections.length} sections</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="appearance-none rounded-lg border border-line bg-sunken py-2 pl-3 pr-8 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
            >
              <option value="">from deck.yaml</option>
              {themes.map((t) => (
                <option key={t.name} value={t.name}>{t.label}</option>
              ))}
            </select>
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>

          <Button variant="primary" onClick={rerender} disabled={busy}>
            {busy && <Spinner />}
            {busy ? "Rendering" : "Render"}
          </Button>

          <a
            href={`/api/decks/${slug}/download/deck.pptx`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm text-fg-muted transition hover:border-line-strong hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
            </svg>
            .pptx
          </a>
        </div>
      </header>

      {problems.length > 0 && (
        <Panel className="mt-5 border-amber/30 bg-amber/5 p-3.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber">
            {problems.length} problem{problems.length > 1 ? "s" : ""}
          </div>
          <ul className="space-y-1 text-xs leading-relaxed text-fg-muted">
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Panel>
      )}

      {data.slides.length === 0 ? (
        <div className="mt-7">
          <Empty
            title="Not rendered yet"
            hint="Render turns deck.yaml into a .pptx, then rasterises it so you can check the result before opening PowerPoint."
            action={<Button variant="primary" onClick={rerender} disabled={busy}>Render now</Button>}
          />
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.slides.map((src, i) => (
            <button
              key={src}
              onClick={() => setZoom(i)}
              className="group text-left"
            >
              <div className="slide-frame overflow-hidden rounded-lg ring-accent transition group-hover:ring-2">
                {/* 480px thumb in the grid; the lightbox loads the full plate.
                    No lazy-loading — at ~28 kB each, fetching the deck outright
                    beats gating on intersection observers. */}
                <img
                  src={data.thumbs?.[i] ?? src}
                  alt={`Slide ${i + 1}`}
                  className="block w-full"
                />
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="font-mono tabular-nums text-fg-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="truncate text-fg-faint transition group-hover:text-fg-muted">
                  {types[i]}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {zoom !== null && (
        <Lightbox
          slides={data.slides}
          thumbs={data.thumbs}
          types={types}
          index={zoom}
          onIndex={setZoom}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}
