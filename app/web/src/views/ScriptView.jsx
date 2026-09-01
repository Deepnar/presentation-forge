import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner } from "../components/ui.jsx";
import { DownloadIcon } from "../components/icons.jsx";
import { ProjectHeader, useProject } from "../components/ProjectNav.jsx";

/**
 * The speaker script as one of the project's four pages.
 *
 * It was a panel stacked below the report and research panels on the deck page,
 * which put three empty states between the deck's header and its slides. As a
 * page it gets the width its content wants — one card per slide, each with the
 * words that slide's presenter says — and the deck page gets its content back.
 *
 * A script only exists for a deck, so with no deck this says so rather than
 * offering to write words for slides that do not exist.
 */
export default function ScriptView({ slug, refreshToken, onBack, onNavigate }) {
  const project = useProject(slug, refreshToken);
  const hasDeck = project ? project.deck : true;

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <ProjectHeader
        project={project}
        active="script"
        onNavigate={onNavigate}
        onBack={onBack}
        meta={project?.slides ? `${project.slides} slide${project.slides === 1 ? "" : "s"}` : null}
      />
      <div className="mt-6 max-w-4xl">
        {hasDeck ? (
          <ScriptPanel slug={slug} />
        ) : (
          <Panel className="p-6 text-center">
            <div className="text-[14px] font-semibold text-fg">No deck to speak to</div>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-fg-muted">
              A speaker script is written per slide, so it needs a deck. Build one
              from this project's report first.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ScriptPanel({ slug }) {
  const [state, setState] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(null); // slide index | "all"
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    api.script(slug).then(setState).catch(() => setState({ exists: false, slides: [] }));
  }, [slug]);

  useEffect(() => { refresh(); }, [refresh]);

  function run(index) {
    if (busy) return;
    setBusy(true);
    setError("");
    setRegenerating(index ?? "all");
    setMsg(index == null ? "Writing the speaker script…" : `Rewriting slide ${index + 1}'s words…`);
    api.generateScript(slug, index == null ? {} : { index }, {
      status: (p) => {
        if (p?.index != null && p?.total != null) setMsg(`Writing slide ${p.index + 1} of ${p.total}…`);
      },
      result: () => refresh(),
    }).promise
      .catch((e) => setError(e.message))
      .finally(() => { setBusy(false); setRegenerating(null); setMsg(""); });
  }

  return (
    <div>
      {/* No eyebrow: the project navigation directly above already says which
          page this is, and repeating it makes the page look like a panel
          floating inside itself. */}
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] leading-relaxed text-fg-muted">
          The words each presenter says aloud — the full argument behind each
          slide's bullets, in the presenter's voice, grounded in the deck's
          research. Roughly 60–90 seconds per slide.
        </p>
        {state?.exists && (
          <div className="flex items-center gap-2">
            <a
              href={`/api/decks/${slug}/download/script.md`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[11.5px] text-fg-muted transition hover:border-line-strong hover:text-fg"
              title="Download script.md — the full speaker script"
            >
              <DownloadIcon className="h-3 w-3" />
              Download .md
            </a>
            <Button size="sm" variant="outline" onClick={() => run(null)} disabled={busy}>
              {regenerating === "all" ? <Spinner /> : null}
              Regenerate all
            </Button>
          </div>
        )}
      </div>

      {!state ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-fg-faint"><Spinner /> Loading…</div>
      ) : !state.exists ? (
        <div className="mt-5 max-w-md">
          <p className="text-[13px] leading-relaxed text-fg-muted">
            No script yet — generate one when you need it: what you say goes
            beyond what the slide says.
          </p>
          <Button variant="primary" className="mt-3" onClick={() => run(null)} disabled={busy}>
            {regenerating === "all" ? <Spinner /> : null}
            Generate speaker script
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {state.slides.map((s) => (
            <div key={s.index} className="rounded-card border border-line bg-panel p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10.5px] tabular-nums text-fg-faint">
                  {String(s.index + 1).padStart(2, "0")}
                </span>
                <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-fg-faint">{s.type}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">{s.headline}</span>
                <span className="shrink-0 text-[11px] text-fg-faint">{s.presenter ?? "—"}</span>
                <button
                  onClick={() => run(s.index)}
                  disabled={busy}
                  title="Regenerate this slide's words — keeps the other slides' scripts"
                  className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] text-fg-muted transition hover:border-line-strong hover:text-fg disabled:opacity-40"
                >
                  {regenerating === s.index ? <Spinner className="h-3 w-3" /> : "Regenerate"}
                </button>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
                {s.written ? s.body : "Not written yet — regenerate this slide to write its words."}
              </p>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-fg-muted"><Spinner /> {msg}</div>
      )}
      {error && (
        <div className="mt-2.5 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">{error}</div>
      )}
    </div>
  );
}
