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
 * the circular submit.
 *
 * The sliders icon opens the config popover — the presets (audience, slide
 * count in deck mode; source, deck picker, depth in report mode) all live
 * behind it. The main surface stays just the brief + the Deck/Report toggle +
 * model + submit. The "+ New deck" wizard is the header/sidebar button, not
 * this box.
 */
export default function PromptBox({ decks, mode, setMode, brief, setBrief, focusSignal, onPlanReady, onReportDone, onStandaloneReport }) {
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
  const [configOpen, setConfigOpen] = useState(false);
  const taRef = useRef(null);
  const boxRef = useRef(null);

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

  // The popover closes on outside click and Escape — one listener covers both.
  useEffect(() => {
    if (!configOpen) return;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setConfigOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setConfigOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [configOpen]);

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

  const briefPlaceholder = mode === "report" && reportSource === "deck"
    ? "Describe the report's angle… (or leave blank to follow the deck's research)"
    : mode === "deck"
      ? "Describe the presentation… (e.g. topic, angle, audience)"
      : "Describe the report… (e.g. topic, depth, audience)";

  return (
    <div className="w-full max-w-2xl">
      <div ref={boxRef} className="relative surface-well rounded-[var(--radius-lg)] border border-line bg-prompt p-3">
        <textarea
          ref={taRef}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder={briefPlaceholder}
          className="w-full resize-none border-none bg-transparent px-2 py-1 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-faint/60"
        />

        {mode === "report" && (
          <p className="px-2 pb-1 text-[11px] text-fg-faint">
            {reportSource === "brief"
              ? "standalone report — no deck required"
              : reportSlug
                ? "written from the deck's shared research and outline"
                : "pick a deck in the config (sliders)"}
          </p>
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
              onClick={() => setConfigOpen((o) => !o)}
              title="Config — audience, slide count, report source"
              aria-expanded={configOpen}
              className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-95 ${
                configOpen ? "bg-hover text-fg" : "text-fg-faint hover:bg-hover hover:text-fg"
              }`}
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

        {configOpen && (
          <ConfigPopover
            mode={mode}
            reportSource={reportSource}
            setReportSource={setReportSource}
            decks={decks}
            reportSlug={reportSlug}
            setReportSlug={setReportSlug}
            depth={depth}
            setDepth={setDepth}
            audience={audience}
            setAudience={setAudience}
            maxSlides={maxSlides}
            setMaxSlides={setMaxSlides}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The config popover — everything that is not the brief itself. Deck mode:
 * audience + slide-count presets. Report mode: source (deck/brief), the deck
 * picker when writing from a deck, and the Full/Brief depth. Opens above the
 * footer from the sliders button; closes on outside click / Escape.
 */
function ConfigPopover({ mode, reportSource, setReportSource, decks, reportSlug, setReportSlug, depth, setDepth, audience, setAudience, maxSlides, setMaxSlides }) {
  const AUDIENCES = [
    { id: "", label: "Class" },
    { id: "audience: undergraduate class — assume little background, keep it clear.", label: "Students" },
    { id: "audience: faculty exam panel — formal, graded, cite your sources.", label: "Panel" },
    { id: "audience: a technical conference — assume domain fluency, go deep.", label: "Conf" },
  ];
  const SLIDE_COUNTS = [0, 8, 14, 20];

  return (
    <div
      className="fade-in absolute right-0 bottom-[3.25rem] z-20 w-72 rounded-[var(--radius-lg)] border border-line bg-panel p-3 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)]"
      style={{ animationDuration: "120ms" }}
    >
      {mode === "deck" ? (
        <>
          <ConfigGroup label="Audience">
            <div className="flex flex-wrap gap-1">
              {AUDIENCES.map((a) => (
                <ModePill key={a.id || "none"} active={audience === a.id} onClick={() => setAudience(a.id)}>
                  {a.label}
                </ModePill>
              ))}
            </div>
          </ConfigGroup>
          <ConfigGroup label="Slides">
            <div className="flex flex-wrap gap-1">
              {SLIDE_COUNTS.map((n) => (
                <ModePill key={n} active={maxSlides === n} onClick={() => setMaxSlides(n)}>
                  {n === 0 ? "auto" : `${n}`}
                </ModePill>
              ))}
            </div>
          </ConfigGroup>
        </>
      ) : (
        <>
          <ConfigGroup label="Source">
            <div className="flex items-center gap-0.5 rounded-full bg-sunken p-0.5">
              <ModePill active={reportSource === "deck"} onClick={() => setReportSource("deck")}>From a deck</ModePill>
              <ModePill active={reportSource === "brief"} onClick={() => setReportSource("brief")}>From a brief</ModePill>
            </div>
          </ConfigGroup>

          {reportSource === "deck" && (
            <ConfigGroup label="Deck">
              <div className="relative">
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
            </ConfigGroup>
          )}

          <ConfigGroup label="Depth">
            <div className="flex items-center gap-0.5 rounded-full bg-sunken p-0.5">
              <ModePill active={depth === "full"} onClick={() => setDepth("full")}>Full</ModePill>
              <ModePill active={depth === "brief"} onClick={() => setDepth("brief")}>Brief</ModePill>
            </div>
          </ConfigGroup>
        </>
      )}
    </div>
  );
}

function ConfigGroup({ label, children }) {
  return (
    <div className="py-1.5 first:pt-0 last:pb-0">
      <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">{label}</div>
      {children}
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
