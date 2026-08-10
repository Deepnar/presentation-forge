import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner } from "../components/ui.jsx";

/**
 * The brief → outline entry point. Streams research/planning progress and hands
 * the plan to the outline review — nothing is written to disk beyond the plan
 * until the human approves it.
 */
export default function NewDeck({ onPlanned, onBack }) {
  const [themes, setThemes] = useState([]);
  const [brief, setBrief] = useState("");
  const [sources, setSources] = useState("");
  const [theme, setTheme] = useState("");
  const [research, setResearch] = useState(false);
  const [maxSlides, setMaxSlides] = useState(12);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);

  useEffect(() => {
    api.themes().then((r) => setThemes(r.themes)).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("Queued…");
    const j = api.createDeck(
      {
        brief,
        sources: sources.split("\n").map((s) => s.trim()).filter(Boolean),
        theme: theme || undefined,
        research,
        maxSlides: Number(maxSlides) || 24,
      },
      {
        status: (p) => setStatus(progressLabel(p)),
        plan: (d) => onPlanned(d.slug, d.plan, theme),
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
    <div className="mx-auto max-w-2xl px-8 py-9">
      <button
        onClick={onBack}
        disabled={busy}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-faint transition hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
        All decks
      </button>

      <header className="mb-7">
        <h1 className="text-[1.7rem] font-semibold tracking-tight">New deck</h1>
        <p className="mt-1 text-sm text-fg-muted">
          One brief builds the outline. You approve it before any slide is written.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Brief</div>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            required
            rows={4}
            placeholder="e.g. Ray tracing as the future of real-time rendering — how hardware rasterisation is being replaced, and what it means for games."
            className="w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm leading-relaxed text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Theme</div>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full appearance-none rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
            >
              <option value="">Default (warm-humanist)</option>
              {themes.map((t) => (
                <option key={t.name} value={t.name}>{t.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Max slides</div>
            <input
              type="number"
              min={3}
              max={24}
              value={maxSlides}
              onChange={(e) => setMaxSlides(e.target.value)}
              className="w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
            />
          </label>
        </div>

        <label className="block">
          <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Source URLs <span className="font-normal normal-case text-fg-faint/70">(one per line, optional)</span></div>
          <textarea
            value={sources}
            onChange={(e) => setSources(e.target.value)}
            rows={3}
            placeholder={"https://en.wikipedia.org/wiki/Path_tracing\nhttps://www.scratchapixel.com/lessons/3d-basic-rendering/global-illumination-path-tracing"}
            className="w-full rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={research}
            onChange={(e) => setResearch(e.target.checked)}
            className="h-4 w-4 accent-[--accent]"
          />
          <span className="text-sm text-fg-muted">
            Run a research pass
            {sources.trim() ? " over the sources above" : " (SearXNG metasearch on the brief)"}
          </span>
        </label>

        {busy && (
          <Panel className="p-4">
            <div className="flex items-center gap-3">
              <Spinner />
              <div className="text-sm text-fg">{status}</div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={stop}>Stop</Button>
            </div>
          </Panel>
        )}

        {error && (
          <Panel className="border-amber/30 bg-amber/5 p-3.5">
            <div className="text-xs leading-relaxed text-amber">{error}</div>
          </Panel>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy || !brief.trim()}>
            {busy && <Spinner />}
            Plan the deck
          </Button>
        </div>
      </form>
    </div>
  );
}

export function progressLabel(p) {
  switch (p.status) {
    case "researching": return "Researching sources…";
    case "planning": return "Planning the outline…";
    case "planned": return "Outline ready.";
    case "writing": return `Writing slide ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;
    case "rendering": return "Rendering slides…";
    default: return "Working…";
  }
}
