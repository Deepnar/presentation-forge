import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge, Empty } from "../components/ui.jsx";
import { DownloadIcon } from "../components/icons.jsx";
import { progressLabel } from "../lib/progress.js";
import { reportWrites } from "../lib/reportWrites.js";
import { ProjectHeader, useProject } from "../components/ProjectNav.jsx";

const REPORT_SECTIONS = [
  "Abstract", "Acknowledgement", "Introduction", "Theoretical Background",
  "Application", "Future Scope", "Conclusion", "References",
];

/**
 * A report's full-document view — the land target of the sidebar's Reports tab
 * and of the home "from a brief" report flow. It FEELS like reading the report:
 * a cover block (title, subject, guide, team), then each section in the fixed
 * graded order with its paragraphs and tables rendered as prose, not YAML.
 * Render .docx and the download action sit at the bottom, and a report-only
 * deck also gets the reverse-flow door: plan a companion deck from the same
 * research through the outline gate.
 */
export default function ReportView({ slug, refreshToken, onBack, onPlanReady, onDeckChanged, onNavigate }) {
  const project = useProject(slug, refreshToken);
  const [data, setData] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [depth, setDepth] = useState("full");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);
  // Whether a rendered report.docx exists on disk — SERVER state, so the
  // Download link survives reopen/navigation without re-rendering. Probe on
  // load, update after each render. The render result itself (preview pages)
  // stays component state; the link is derived from this flag.
  const [rendered, setRendered] = useState(false);
  const [preview, setPreview] = useState(null); // { pages, thumbs } after render
  const [notFound, setNotFound] = useState(false);
  // A report WRITE in flight for this slug — registered by whoever started the
  // generation (the deck's Report panel, or a standalone report chat), so the
  // view knows not to render or download a report that is being rewritten.
  const [writing, setWriting] = useState(null); // { status } | null

  useEffect(() => {
    setNotFound(false);
    api.report(slug)
      .then((r) => {
        setData(r.report);
        setIdentity(r.identity ?? {});
        setRendered(r.rendered === true);
      })
      .catch((e) => { setNotFound(e.status === 404); setError(e.message); });
    api.decks().then((r) => {
      const d = r.decks.find((x) => x.slug === slug);
      if (d?.meta?.reportDepth) setDepth(d.meta.reportDepth);
    }).catch(() => {});
  }, [slug, refreshToken]);

  // Adopt any in-flight report write for this slug (started from the deck's
  // Report panel or the chat) and disable the render/download/plan actions
  // while it runs, showing its status and a Stop that aborts it. The write
  // and the render share one busy state (`busy || writing` below), so a
  // "Writing section N of M" can never leave a stuck "Rendering…" behind.
  useEffect(() => {
    const run = reportWrites.get(slug);
    if (run && !run.finished) setWriting({ status: run.status });
    const onPatch = (patch) => {
      if (patch.finished) setWriting(null);
      else if (patch.status != null) setWriting((w) => ({ status: patch.status }));
    };
    reportWrites.subscribe(slug, onPatch);
    return () => reportWrites.unsubscribe(slug, onPatch);
  }, [slug]);

  async function renderDoc() {
    setBusy(true);
    setError("");
    setStatus("Rendering…");
    try {
      const r = await api.renderReport(slug);
      setRendered(true);
      // The rasterised preview pages — the report AS IT OPENS in Word.
      if (r.previewPages?.length) {
        const stamp = Date.now();
        setPreview({
          pages: r.previewPages.map((s) => `${s}?t=${stamp}`),
          thumbs: (r.previewThumbs ?? r.previewPages).map((s) => `${s}?t=${stamp}`),
        });
      }
      setStatus("");
      // The render wrote the .docx — grab it without a second click. Same
      // synthetic-anchor trick the deck export flow uses.
      const href = r.docx ?? `/api/decks/${slug}/download/report.docx`;
      const a = document.createElement("a");
      a.href = href;
      a.download = href.split("/").pop();
      document.body.appendChild(a);
      a.click();
      a.remove();
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

  // F20 — the report-as-deck bridge: append one report section as a real slide
  // of the companion deck, so the two artefacts share content freely. Only
  // decks that already have a deck.yaml can take a slide.
  async function addSectionAsSlide(name) {
    setBusy(true);
    setError("");
    setStatus("Adding slide…");
    try {
      const d = await api.deck(slug);
      const section = data.content[name];
      const paras = [...(section.paragraphs ?? []), ...(section.entries ?? [])].filter((s) => String(s).trim());
      const slide = {
        type: "bullets",
        headline: name.length > 60 ? name.slice(0, 57) + "…" : name,
        bullets: paras.slice(0, 4),
      };
      await api.saveDeck(slug, { ...d.deck, slides: [...d.deck.slides, slide] }, d.meta);
      onDeckChanged?.();
      setStatus("");
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    // A write in flight (started from the deck's Report panel or a chat) is
    // aborted through the shared registry; a render/plan started here through
    // the local job.
    reportWrites.get(slug)?.abort?.();
    job?.abort();
    setWriting(null);
    setStatus("");
  }

  const content = data?.content ?? {};

  // The fixed section order is the document's spine: sections appear in the
  // graded order whether or not every one has content. Empty sections are
  // skipped gracefully — never a bare heading.
  const present = REPORT_SECTIONS.filter((name) => {
    const sec = content[name];
    if (!sec) return false;
    const paras = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])].filter((s) => String(s).trim());
    const hasTable = Array.isArray(sec.table?.header) && sec.table.header.length;
    return paras.length > 0 || hasTable;
  });

  const acad = identity?.academic ?? {};
  const guide = identity?.guide ?? {};
  const team = identity?.team ?? {};
  const members = team?.members ?? [];

  if (!data && !notFound) {
    return (
      <div className="mx-auto max-w-4xl px-10 py-10">
        <div className="skeleton h-8 w-80 rounded-lg" />
        <div className="mt-7 space-y-3">
          <div className="skeleton h-40 rounded-card" />
          <div className="skeleton h-52 rounded-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-10 py-10 pb-28">
      <ProjectHeader
        project={project}
        active="report"
        onNavigate={onNavigate}
        onBack={onBack}
        meta="The written companion — the same argument at length, on the institutional template."
      />

      <div className="max-w-4xl">
      {notFound ? (
        <div className="mt-8">
          <Empty
            title="No report here yet"
            hint="Write one below, or start a report from the home prompt in Report mode. The machine drafts; the final words are yours."
          />
        </div>
      ) : (
        <div className="mt-6">
          {/* Cover block — the report's title page as the reader first sees it. */}
          <div className="panel-surface rounded-[var(--radius-lg)] border border-line bg-panel p-8 text-center">
            <div className="flex justify-center">
              <Badge className="bg-accent/10 text-accent">Report</Badge>
            </div>
            <h1 className="mx-auto mt-3 max-w-2xl break-words text-[1.75rem] font-semibold leading-tight tracking-[-0.015em]">
              {data?.title}
            </h1>
            {data?.subtitle && (
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">{data.subtitle}</p>
            )}
            <div className="mx-auto mt-5 max-w-2xl border-t border-line/60 pt-4 text-[12px] leading-relaxed text-fg-muted">
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
                {acad.subject && <span><span className="text-fg-faint">Subject · </span>{acad.subject}</span>}
                {acad.year && <span><span className="text-fg-faint">Year · </span>{acad.year}</span>}
                {guide.name && <span><span className="text-fg-faint">Guide · </span>{guide.name}</span>}
                {team.label && <span><span className="text-fg-faint">{team.label}</span></span>}
              </div>
              {members.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  {members.map((m, i) => (
                    <span key={i} className="text-fg-muted">
                      {m.name}{m.roll ? <span className="text-fg-faint"> · {m.roll}</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 text-[11px] font-mono text-fg-faint">{slug}</div>
          </div>

          <div className="mt-7 space-y-3">
            {present.map((name, i) => {
              const sec = content[name];
              const paras = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])].filter((s) => String(s).trim());
              const table = Array.isArray(sec.table?.header) && sec.table.header.length ? sec.table : null;
              return (
                <Panel key={name} className="p-5">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-[14px] font-semibold tracking-tight text-fg">
                      <span className="mr-2 font-mono tabular-nums text-fg-faint">{i + 1}</span>
                      {name}
                    </h2>
                    <div className="flex items-center gap-2">
                      {table && (
                        <span className="text-[10.5px] uppercase tracking-wider text-fg-faint">+ table</span>
                      )}
                      <button
                        onClick={() => addSectionAsSlide(name)}
                        disabled={busy || writing}
                        title="Append this section as a slide of the deck"
                        className="rounded-lg border border-line px-2 py-0.5 text-[10.5px] text-fg-faint transition hover:border-line-strong hover:text-fg disabled:opacity-40"
                      >
                        + Add as slide
                      </button>
                    </div>
                  </div>
                  {paras.length > 0 ? (
                    <div className="space-y-2.5">
                      {paras.map((p, j) => (
                        <p key={j} className="text-[13px] leading-[1.75] text-fg-muted">
                          {p}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[13px] italic text-fg-faint">No paragraphs written for this section.</div>
                  )}
                  {table && <SectionTable table={table} />}
                </Panel>
              );
            })}
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">
              The rendered document
            </div>
            <Badge className="bg-raised text-fg-faint">{preview.pages.length} page{preview.pages.length > 1 ? "s" : ""}</Badge>
          </div>
          <div className="space-y-4">
            {preview.pages.map((src, i) => (
              <div key={src}>
                <div className="mb-1 text-[10.5px] font-mono text-fg-faint">page {i + 1}</div>
                <img
                  src={src}
                  alt={`Report page ${i + 1}`}
                  className="w-full rounded-card border border-line shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)]"
                  loading={i === 0 ? undefined : "lazy"}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!notFound && (
        <div className="sticky bottom-0 z-10 mt-8 border-t border-line bg-panel/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2.5 py-3.5">
          <Button variant="primary" onClick={renderDoc} disabled={busy || writing || !data}>
            {(busy || writing) && <Spinner />}
            Render .docx
          </Button>
          {rendered && !writing && (
            <a
              href={`/api/decks/${slug}/download/report.docx`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-fg-muted transition hover:border-line-strong hover:text-fg"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Download report.docx
            </a>
          )}
          {data && (
            <>
              <div className="mx-auto" />
              <Button variant="outline" onClick={planDeck} disabled={busy || writing} title="Plan a companion deck from this report's sections">
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
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </>
          )}
        </div>
        </div>
      )}

      {(status || writing) && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-fg-muted">
          <Spinner /> {writing?.status ?? status}
          {(busy || writing) && <button onClick={stop} className="text-[11px] text-fg-faint transition hover:text-fg">Stop</button>}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">
          {error}
        </div>
      )}
      </div>
    </div>
  );
}

/** A report table as a real table — header row, plain rows, borderless like
 *  the donor's style. Never raw YAML. */
function SectionTable({ table }) {
  const header = table.header ?? [];
  const rows = table.rows ?? [];
  return (
    <div className="mt-3.5 overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        {table.caption && (
          <caption className="mb-1.5 text-left text-[10.5px] uppercase tracking-wider text-fg-faint">
            {table.caption}
          </caption>
        )}
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} className="border-b border-line-strong px-3 py-2 text-left font-semibold text-fg">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 ? "bg-sunken/50" : ""}>
              {row.map((cell, ci) => (
                <td key={ci} className="border-b border-line px-3 py-2 text-fg-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
