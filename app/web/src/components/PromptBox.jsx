import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Spinner } from "./ui.jsx";
import { progressLabel } from "../views/NewDeck.jsx";
import { useModels } from "../lib/useModels.js";
import { ChevronDown, DocIcon, LayersIcon, SlidersIcon, SparkleIcon, UpArrowIcon } from "./icons.jsx";

/**
 * The home generate surface, on its own tonal step. Deck mode streams a brief
 * to the outline; Report mode streams a report that lands in the deck's Report
 * panel — from an existing deck, or from a brief alone (a standalone report
 * with no deck, the reverse flow's other door). All share the model pill and
 * the circular submit. The sliders icon opens the full wizard — nothing is
 * hidden behind this box, it is the fast path.
 */
export default function PromptBox({ decks, mode, setMode, brief, setBrief, focusSignal, onNewDeck, onPlanReady, onReportDone, onStandaloneReport }) {
  const { models, mode: modelMode, cloudOn, defaultModel } = useModels();
  const [model, setModel] = useState("");
  const [identity, setIdentity] = useState(null);
  const [reportSlug, setReportSlug] = useState("");
  const [reportSource, setReportSource] = useState("deck"); // deck | brief
  const [depth, setDepth] = useState("brief");
  const [audience, setAudience] = useState("");
  const [maxSlides, setMaxSlides] = useState(0); // 0 = unset, auto
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);
  const taRef = useRef(null);

  // Gamma-style quick presets, as affordances over the existing pipeline — no
  // new flow. Audience is folded into the brief, slide count maps to the
  // pipeline's maxSlides. Zero hand-holding, both optional.
  const AUDIENCES = [
    { id: "", label: "Class" },
    { id: "audience: undergraduate class — assume little background, keep it clear.", label: "Students" },
    { id: "audience: faculty exam panel — formal, graded, cite your sources.", label: "Panel" },
    { id: "audience: a technical conference — assume domain fluency, go deep.", label: "Conf" },
  ];
  const SLIDE_COUNTS = [0, 8, 14, 20];

  useEffect(() => {
    api.identity().then((r) => setIdentity(r.identity ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (focusSignal > 0 && mode === "deck") taRef.current?.focus();
  }, [focusSignal, mode]);

  const canSubmit = busy ? false : mode === "deck"
    ? brief.trim().length > 0
    : reportSource === "brief" ? brief.trim().length > 0 : Boolean(reportSlug);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    setStatus("Queued…");
    // The brief carries the audience preset when one is chosen; maxSlides maps
    // to the pipeline's bound directly.
    const fullBrief = audience ? `${brief.trim()}\n\n${audience}` : brief.trim();
    const j = mode === "deck"
      ? api.createDeck(
          { brief: fullBrief, maxSlides: maxSlides || undefined, identity, model: model || undefined },
          {
            status: (p) => setStatus(progressLabel(p)),
            plan: (d) => onPlanReady({ slug: d.slug, plan: d.plan, theme: "" }),
          },
        )
      : reportSource === "brief"
        ? api.createReport(
            // A standalone report grounds itself: the report generator needs
            // research/notes.md, so the brief always drives a research pass.
            { brief, depth, research: true, model: model || undefined, identity },
            {
              status: (p) => setStatus(progressLabel(p)),
              result: (d) => onStandaloneReport(d.slug),
            },
          )
        : api.generateReport(
            reportSlug,
            { depth, model: model || undefined },
            {
              status: (p) => setStatus(progressLabel(p)),
              result: () => onReportDone(reportSlug),
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
    <div className="w-full max-w-2xl">
      <div className="surface-well rounded-[var(--radius-lg)] border border-line bg-prompt p-3">
        {mode === "deck" ? (
          <textarea
            ref={taRef}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="Describe the presentation… (e.g. topic, angle, audience)"
            className="w-full resize-none border-none bg-transparent px-2 py-1 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-faint/60"
          />
        ) : (
          <div className="px-2 py-1">
            <div className="mb-2 flex items-center gap-1">
              <div className="flex items-center gap-0.5 rounded-full bg-panel p-0.5">
                <ModePill active={reportSource === "deck"} onClick={() => setReportSource("deck")}>
                  From a deck
                </ModePill>
                <ModePill active={reportSource === "brief"} onClick={() => setReportSource("brief")}>
                  From a brief
                </ModePill>
              </div>
              <span className="ml-1.5 text-[11px] text-fg-faint">
                {reportSource === "brief" ? "standalone — no deck required" : "same research as the deck"}
              </span>
            </div>

            {reportSource === "brief" ? (
              <textarea
                ref={taRef}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="Describe the report… (e.g. topic, depth, audience)"
                className="w-full resize-none border-none bg-transparent px-1 py-1 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-faint/60"
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[14rem] flex-1">
                  <select
                    value={reportSlug}
                    onChange={(e) => setReportSlug(e.target.value)}
                    disabled={!decks.length}
                    title={decks.length ? "Which deck to write the report from" : "Create a deck first"}
                    className="w-full appearance-none rounded-lg border border-line bg-sunken py-2 pl-3 pr-8 text-[13px] text-fg outline-none transition hover:border-line-strong focus:border-accent disabled:opacity-50"
                  >
                    <option value="">{decks.length ? "Choose a deck…" : "Create a deck first"}</option>
                    {decks.map((d) => (
                      <option key={d.slug} value={d.slug}>{d.title}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
                </div>
                <div className="flex items-center gap-0.5 rounded-full bg-panel p-0.5">
                  <ModePill active={depth === "full"} onClick={() => setDepth("full")}>Full</ModePill>
                  <ModePill active={depth === "brief"} onClick={() => setDepth("brief")}>Brief</ModePill>
                </div>
              </div>
            )}

            {reportSource === "brief" && (
              <div className="mt-2 flex items-center gap-0.5 rounded-full bg-panel p-0.5 self-start">
                <ModePill active={depth === "full"} onClick={() => setDepth("full")}>Full depth</ModePill>
                <ModePill active={depth === "brief"} onClick={() => setDepth("brief")}>Brief</ModePill>
              </div>
            )}
          </div>
        )}

        {/* Gamma-style quick presets — audience and slide count, both optional,
            both folded into the existing brief→pipeline flow. */}
        {mode === "deck" && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
            <div className="flex items-center gap-0.5 rounded-full bg-panel p-0.5">
              {AUDIENCES.map((a) => (
                <ModePill key={a.id || "none"} active={audience === a.id} onClick={() => setAudience(a.id)}>
                  {a.label}
                </ModePill>
              ))}
            </div>
            <div className="flex items-center gap-0.5 rounded-full bg-panel p-0.5">
              {SLIDE_COUNTS.map((n) => (
                <ModePill key={n} active={maxSlides === n} onClick={() => setMaxSlides(n)}>
                  {n === 0 ? "auto slides" : `${n} slides`}
                </ModePill>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5 border-t border-line/60 px-1 pt-2">
          <div className="flex items-center gap-0.5 rounded-full bg-panel p-0.5">
            <ModePill active={mode === "deck"} onClick={() => setMode("deck")} icon={LayersIcon}>
              Deck
            </ModePill>
            <ModePill active={mode === "report"} onClick={() => setMode("report")} icon={DocIcon}>
              Report
            </ModePill>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                title={modelMode === "cloud" ? "Cloud model — requires the attached key" : "Which local model does the work"}
                className="appearance-none rounded-full border border-line bg-sunken py-1.5 pl-7 pr-7 text-[12px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent max-w-[14rem]"
              >
                <option value="">auto · {defaultModel}</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <SparkleIcon className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
            </div>

            <button
              onClick={onNewDeck}
              title="Advanced options — sources, research, team"
              className="grid h-8 w-8 place-items-center rounded-full text-fg-faint transition hover:bg-hover hover:text-fg active:scale-95"
            >
              <SlidersIcon className="h-4 w-4" />
            </button>

            <button
              onClick={submit}
              disabled={!canSubmit}
              title="Generate"
              className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_14px_-6px_rgba(0,0,0,0.7)] transition hover:bg-accent-hi active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            >
              <UpArrowIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {(busy || status) && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-panel px-3 py-2">
            <Spinner className="text-fg-faint" />
            <span className="flex-1 truncate text-[12px] text-fg-muted">{status}</span>
            {busy && (
              <button onClick={stop} className="text-[11px] text-fg-faint transition hover:text-fg">Stop</button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function ModePill({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`pill px-2.5 py-1 text-[12px] font-medium transition ${
        active ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
