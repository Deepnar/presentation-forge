import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner } from "../components/ui.jsx";

/**
 * The brief → outline entry point. Streams research/planning progress and hands
 * the plan to the outline review — nothing is written to disk beyond the plan
 * until the human approves it.
 *
 * The identity half is the intake wizard: team, subject, guide and year are
 * pre-filled from config/identity.yaml, saved back as remembered defaults, and
 * frozen into decks/<slug>/meta.yaml so each deck carries the identity it was
 * made under.
 */
export default function NewDeck({ onPlanned, onBack }) {
  const [themes, setThemes] = useState([]);
  const [identity, setIdentity] = useState(null);
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
    api.identity().then((r) => setIdentity(r.identity ?? {})).catch(() => {});
  }, []);

  const id = identity ?? {};
  const acad = id.academic ?? {};
  const guide = id.guide ?? {};
  const team = id.team ?? {};

  const setAcad = (patch) => setIdentity((x) => ({ ...(x ?? {}), academic: { ...(x?.academic ?? {}), ...patch } }));
  const setGuide = (patch) => setIdentity((x) => ({ ...(x ?? {}), guide: { ...(x?.guide ?? {}), ...patch } }));
  const setTeam = (patch) => setIdentity((x) => ({ ...(x ?? {}), team: { ...(x?.team ?? {}), ...patch } }));

  const editMember = (i, patch) =>
    setTeam({ members: (team.members ?? []).map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("Queued…");
    // Remember defaults for the next deck (best-effort — never blocks).
    try { await api.saveIdentity(identity); } catch { /* optional */ }
    const j = api.createDeck(
      {
        brief,
        sources: sources.split("\n").map((s) => s.trim()).filter(Boolean),
        theme: theme || undefined,
        research,
        maxSlides: Number(maxSlides) || 24,
        identity,
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

  const input = "w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent";

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
            className={input}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Theme</div>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className={input}
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
              className={input}
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
            className={`${input} font-mono text-[12.5px]`}
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

        <Panel className="p-5">
          <div className="mb-4 text-[11px] font-medium uppercase tracking-wider text-fg-faint">
            Team &amp; submission
            <span className="ml-2 normal-case font-normal text-fg-faint/70">
              remembered for next time — these reach the chrome and the plan prompt
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Subject</div>
              <input value={acad.subject ?? ""} onChange={(e) => setAcad({ subject: e.target.value })} placeholder="Computer Graphics" className={input} />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Academic year</div>
              <input value={acad.year ?? ""} onChange={(e) => setAcad({ year: e.target.value })} placeholder="2026-2027" className={input} />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Semester</div>
              <input value={acad.semester ?? ""} onChange={(e) => setAcad({ semester: e.target.value })} placeholder="e.g. 7" className={input} />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Exam type</div>
              <input value={acad.exam_type ?? ""} onChange={(e) => setAcad({ exam_type: e.target.value })} placeholder="Innovative Examination (IE)" className={input} />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Guide</div>
              <input value={guide.name ?? ""} onChange={(e) => setGuide({ name: e.target.value })} placeholder="Dr. A. Sharma" className={input} />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Guide designation</div>
              <input value={guide.designation ?? ""} onChange={(e) => setGuide({ designation: e.target.value })} placeholder="Assistant Professor" className={input} />
            </label>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Team label <span className="font-normal normal-case text-fg-faint/70">(optional)</span></div>
            <input value={team.label ?? ""} onChange={(e) => setTeam({ label: e.target.value })} placeholder="Group no. 2b [18-24]" className={input} />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Members <span className="font-normal normal-case text-fg-faint/70">(tick who presents on the slides)</span></div>
            <div className="space-y-2">
              {(team.members ?? []).map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={m.name ?? ""}
                    onChange={(e) => editMember(i, { name: e.target.value })}
                    placeholder="Name"
                    className={`${input} flex-1`}
                  />
                  <input
                    value={m.roll ?? ""}
                    onChange={(e) => editMember(i, { roll: e.target.value })}
                    placeholder="Roll"
                    className={`${input} w-20`}
                  />
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
                    <input
                      type="checkbox"
                      checked={Boolean(m.presenting)}
                      onChange={(e) => editMember(i, { presenting: e.target.checked })}
                      className="h-3.5 w-3.5 accent-[--accent]"
                    />
                    presents
                  </label>
                  <button
                    onClick={() => setTeam({ members: (team.members ?? []).filter((_, j) => j !== i) })}
                    className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber"
                    title="Remove member"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <Button size="sm" className="mt-2" onClick={() => setTeam({ members: [...(team.members ?? []), { name: "", roll: "", presenting: false }] })}>
              + Add member
            </Button>
          </div>
        </Panel>

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
