import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge } from "../components/ui.jsx";
import { progressLabel } from "./NewDeck.jsx";

/**
 * The human gate. The model proposes the plan; nothing renders until this is
 * approved or edited. Approve hands the plan to the generation endpoint, which
 * streams slide-writing progress and opens the finished deck.
 */
export default function Outline({ slug, plan, initialTheme, onDone, onBack }) {
  const [types, setTypes] = useState([]);
  const [title, setTitle] = useState(plan.title ?? "");
  const [subtitle, setSubtitle] = useState(plan.subtitle ?? "");
  const [sections, setSections] = useState(plan.sections ?? []);
  const [slides, setSlides] = useState(plan.slides ?? []);
  const [themes, setThemes] = useState([]);
  const [theme, setTheme] = useState(initialTheme ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);

  useEffect(() => {
    api.types().then((r) => setTypes(r.types)).catch(() => {});
    api.themes().then((r) => setThemes(r.themes)).catch(() => {});
  }, []);

  const editSlide = (i, patch) =>
    setSlides((s) => s.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)));

  function moveSlide(i, dir) {
    setSlides((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const out = [...s];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  }

  async function approve() {
    const clean = slides
      .map((s, i) => ({
        type: s.type ?? "bullets",
        section: Number.isInteger(s.section)
          ? Math.min(Math.max(0, s.section), Math.max(0, sections.length - 1))
          : null,
        purpose: (s.purpose ?? "").trim(),
      }))
      .filter((s) => s.type && s.purpose);
    if (!clean.length) {
      setError("Add at least one slide with a purpose.");
      return;
    }

    setBusy(true);
    setError("");
    setStatus("Approving…");
    const j = api.generate(
      slug,
      { plan: { title, subtitle, sections, slides: clean }, theme: theme || undefined },
      {
        status: (p) => setStatus(progressLabel(p)),
        result: () => onDone(slug),
      },
    );
    setJob(j);
    try {
      await j.promise;
    } catch (err) {
      setError(err.name === "AbortError" ? "Cancelled." : err.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    job?.abort();
    setStatus("");
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <button
        onClick={onBack}
        disabled={busy}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-faint transition hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
        New deck
      </button>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[1.7rem] font-semibold tracking-tight">Review the outline</h1>
            <Badge className="bg-raised text-fg-faint">{slug}</Badge>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            Nothing renders until you approve. Edit freely — the plan below is the
            brief the writer works from.
          </p>
        </div>
      </header>

      <Panel className="mb-5 p-5">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Deck</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Subtitle</div>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="optional"
              className="w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent"
            />
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Sections</div>
          <div className="flex flex-wrap items-center gap-2">
            {sections.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-fg-faint">{i}</span>
                <input
                  value={s}
                  onChange={(e) => setSections((x) => x.map((v, j) => (j === i ? e.target.value : v)))}
                  className="w-44 rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
                />
                <button
                  onClick={() => {
                    setSections((x) => x.filter((_, j) => j !== i));
                    setSlides((sl) => sl.map((s2) => ({ ...s2, section: s2.section === i ? null : s2.section })));
                  }}
                  className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber"
                  title="Remove section"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            ))}
            <Button size="sm" onClick={() => setSections((x) => [...x, `Section ${x.length + 1}`])}>
              + Add
            </Button>
          </div>
        </div>
      </Panel>

      <div className="space-y-3">
        {slides.map((s, i) => (
          <Panel key={i} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] tabular-nums text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
                <select
                  value={s.type ?? "bullets"}
                  onChange={(e) => editSlide(i, { type: e.target.value })}
                  className="appearance-none rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
                >
                  {types.length ? types.map((t) => <option key={t} value={t}>{t}</option>)
                    : <option value={s.type}>{s.type}</option>}
                </select>
              </div>
              <div className="flex items-center gap-1">
                {sections.length > 0 && (
                  <select
                    value={s.section ?? ""}
                    onChange={(e) => editSlide(i, { section: e.target.value === "" ? null : Number(e.target.value) })}
                    className="appearance-none rounded-lg border border-line bg-sunken px-2 py-1.5 text-[12px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent"
                  >
                    <option value="">no section</option>
                    {sections.map((name, si) => <option key={si} value={si}>{si} · {name}</option>)}
                  </select>
                )}
                <button onClick={() => moveSlide(i, -1)} disabled={i === 0}
                  className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-fg disabled:opacity-30">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
                </button>
                <button onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1}
                  className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-fg disabled:opacity-30">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <button
                  onClick={() => setSlides((x) => x.filter((_, j) => j !== i))}
                  className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber"
                  title="Remove slide"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            </div>
            <textarea
              value={s.purpose ?? ""}
              onChange={(e) => editSlide(i, { purpose: e.target.value })}
              rows={2}
              placeholder="What this slide must convey…"
              className="w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm leading-relaxed text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent"
            />
          </Panel>
        ))}
      </div>

      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => setSlides((x) => [...x, { type: "bullets", section: null, purpose: "" }])}>
          + Add slide
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-fg-faint">Theme</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="appearance-none rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
          >
            <option value="">from deck.yaml</option>
            {themes.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
          </select>
        </label>

        <div className="flex items-center gap-2">
          {busy && <Button size="sm" onClick={stop}>Stop</Button>}
          <Button variant="primary" onClick={approve} disabled={busy}>
            {busy && <Spinner />}
            Approve &amp; generate
          </Button>
        </div>
      </div>

      {busy && (
        <Panel className="mt-4 p-4">
          <div className="flex items-center gap-3 text-sm text-fg">
            <Spinner />
            {status}
          </div>
        </Panel>
      )}

      {error && (
        <Panel className="mt-4 border-amber/30 bg-amber/5 p-3.5">
          <div className="text-xs leading-relaxed text-amber">{error}</div>
        </Panel>
      )}
    </div>
  );
}
