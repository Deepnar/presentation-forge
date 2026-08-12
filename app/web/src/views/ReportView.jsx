import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge } from "../components/ui.jsx";
import { ChevronDown } from "../components/icons.jsx";
import { progressLabel } from "./NewDeck.jsx";

const REPORT_SECTIONS = [
  "Abstract", "Acknowledgement", "Introduction", "Theoretical Background",
  "Application", "Future Scope", "Conclusion", "References",
];

/**
 * A report's home — the land target of the home "from a brief" report flow and
 * the reverse-flow door: given a report.yaml, generate a companion deck from
 * the same research and route it through the outline gate. Renders .docx and
 * downloads it. Used for report-only decks (no deck.yaml yet); decks with both
 * artefacts use the deck detail view's Report panel instead.
 */
export default function ReportView({ slug, refreshToken, onBack, onPlanReady }) {
  const [data, setData] = useState(null);
  const [depth, setDepth] = useState("full");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.report(slug).then((r) => setData(r.report)).catch((e) => setError(e.message));
    api.decks().then((r) => {
      const d = r.decks.find((x) => x.slug === slug);
      if (d?.meta?.reportDepth) setDepth(d.meta.reportDepth);
    }).catch(() => {});
  }, [slug, refreshToken]);

  async function renderDoc() {
    setBusy(true);
    setError("");
    setStatus("Rendering…");
    try {
      const r = await api.renderReport(slug);
      setResult(r);
      setStatus("");
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function planDeck() {
    setBusy(true);
    setError("");
    setStatus("Queued…");
    const j = api.planDeckFromReport(
      slug,
      { depth },
      {
        status: (p) => setStatus(progressLabel(p)),
        plan: (d) => onPlanReady(d.plan),
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

  const content = data?.content ?? {};
  const present = REPORT_SECTIONS.filter((name) => {
    const sec = content[name];
    if (!sec) return false;
    const paras = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])].filter((s) => String(s).trim());
    const hasTable = Array.isArray(sec.table?.header) && sec.table.header.length;
    return paras.length > 0 || hasTable;
  });

  return (
    <div className="mx-auto max-w-4xl px-10 py-10">
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-fg-faint transition hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
        Home
      </button>

      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-accent/10 text-accent">Report</Badge>
          <span className="font-mono text-[11px] text-fg-faint">{slug}</span>
        </div>
        <h1 className="mt-2.5 break-words text-[1.6rem] font-semibold leading-tight tracking-tight">
          {data?.title ?? "Loading…"}
        </h1>
        {data?.subtitle && <p className="mt-1.5 text-sm text-fg-muted">{data.subtitle}</p>}
        {present.length > 0 && (
          <p className="mt-2 text-[12.5px] tabular-nums text-fg-faint">
            {present.length} sections
          </p>
        )}
      </header>

      {data ? (
        <div className="space-y-3">
          {present.map((name, i) => {
            const sec = content[name];
            const paras = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])].filter((s) => String(s).trim());
            return (
              <Panel key={name} className="p-4">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="text-[13px] font-semibold tracking-tight text-fg">
                    <span className="mr-1.5 font-mono tabular-nums text-fg-faint">{i + 1}</span>
                    {name}
                  </h2>
                  {sec.table?.header?.length > 0 && (
                    <span className="text-[10.5px] uppercase tracking-wider text-fg-faint">+ table</span>
                  )}
                </div>
                <div className="space-y-2">
                  {paras.slice(0, 2).map((p, j) => (
                    <p key={j} className="text-[13px] leading-relaxed text-fg-muted">
                      {p.length > 220 ? `${p.slice(0, 220)}…` : p}
                    </p>
                  ))}
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <div className="flex justify-center py-16"><Spinner className="text-fg-faint" /></div>
      )}

      <div className="sticky bottom-0 z-10 mt-8 border-t border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2.5 px-10 py-3.5">
          <Button variant="primary" onClick={renderDoc} disabled={busy || !data}>
            {busy && status === "Rendering…" && <Spinner />}
            Render .docx
          </Button>
          {result && (
            <a
              href={`/api/decks/${slug}/download/report.docx`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-fg-muted transition hover:border-line-strong hover:text-fg"
            >
              Download report.docx
            </a>
          )}

          <div className="mx-auto" />

          <Button variant="outline" onClick={planDeck} disabled={busy || !data} title="Plan a companion deck from this report's sections">
            Generate companion deck
          </Button>
          <div className="relative">
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              title="Companion deck's briefing depth"
              className="appearance-none rounded-lg border border-line bg-sunken py-1.5 pl-2.5 pr-7 text-[12px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent"
            >
              <option value="full">Full depth</option>
              <option value="brief">Brief</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
          </div>
        </div>
      </div>

      {status && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-fg-muted">
          <Spinner /> {status}
          {busy && <button onClick={stop} className="text-[11px] text-fg-faint transition hover:text-fg">Stop</button>}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">
          {error}
        </div>
      )}
    </div>
  );
}
