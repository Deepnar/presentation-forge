import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge, Empty } from "../components/ui.jsx";
import { ProjectHeader, useProject } from "../components/ProjectNav.jsx";

/**
 * The full Research view — the proper place for the researched content that
 * used to live in a small panel. Reads notes.md as readable prose, sources.json
 * as a table (domain, kind, URL), and the diversity/grounding summary the
 * research pass produced (how many sources, which domains, how many look
 * academic, which are single-source). Editing saves back through PUT /research,
 * and an edit is exactly what the next generation reads.
 */
export default function ResearchView({ slug, refreshToken, onBack, onNavigate }) {
  const project = useProject(slug, refreshToken);
  const [state, setState] = useState({ loading: true, exists: false, notes: "", sources: [], summary: null, figures: [] });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setState((s) => ({ ...s, loading: true }));
    setError("");
    api.research(slug)
      .then((r) => setState({
        loading: false, exists: r.exists, notes: r.notes ?? "", sources: r.sources ?? [],
        summary: r.summary ?? null, figures: r.figures ?? [],
      }))
      .catch((err) => { setState((s) => ({ ...s, loading: false })); setError(err.message); });
  };

  useEffect(() => load(), [slug, refreshToken]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.saveResearch(slug, { notes: draft });
      setState((s) => ({ ...s, notes: draft, exists: true }));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const s = state.summary ?? {};

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <ProjectHeader
        project={project}
        active="research"
        onNavigate={onNavigate}
        onBack={onBack}
        meta="What the writer draws from — the ground truth the deck and report are built on."
        action={state.exists && !editing && (
          <Button size="sm" variant="outline" onClick={() => { setDraft(state.notes); setEditing(true); }}>
            Edit notes
          </Button>
        )}
      />

      <div className="max-w-4xl">
      {state.loading ? (
        <div className="mt-8 flex items-center gap-2 text-[15px] text-fg-muted"><Spinner /> Loading…</div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">{error}</div>
      ) : !state.exists ? (
        <div className="mt-8">
          <Empty
            title="This deck hasn't been researched yet"
            hint="Turn research on and regenerate, or create it with sources — the notes the model writes from appear here."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* The diversity summary — the trust surface. */}
          <Panel className="p-5">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Coverage</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Sources" value={s.total ?? state.sources.length} />
              <Metric label="Domains" value={s.distinctDomains ?? 0} />
              <Metric label="Academic / authoritative" value={s.academicCount ?? 0} />
              <Metric label="Papers" value={s.paperCount ?? 0} />
            </div>
            {s.userProvided > 0 ? (
              <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-[12px] leading-relaxed text-fg-muted">
                <span className="font-medium text-fg">Your uploaded file is the only source.</span>{" "}
                The writer never goes outside it — anything a slide claims that
                the file does not carry is flagged in grounding.
              </div>
            ) : s.distinctDomains < 3 ? (
              <div className="mt-3 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">
                Fewer than 3 distinct domains — the research may lean on a single voice.
              </div>
            ) : null}
            {s.singleSourceDomains?.length > 0 && (
              <div className="mt-3 rounded-lg border border-line bg-sunken px-3 py-2 text-[12px] leading-relaxed text-fg-muted">
                <span className="font-medium text-fg">Single-source domains:</span>{" "}
                {s.singleSourceDomains.join(", ")} — claims resting on only one source.
              </div>
            )}
            {s.notesWords > 0 && (
              <div className="mt-3 text-[11px] text-fg-faint">~{s.notesWords.toLocaleString()} words of notes.</div>
            )}
          </Panel>

          {/* The figures the deck claims — so "are the graphs reflective of
              real numbers?" is answerable before presenting, not after. */}
          {state.figures.length > 0 && (
            <Panel className="p-5">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Figures the deck claims</div>
                <Badge className="bg-raised text-fg-faint">{state.figures.length}</Badge>
              </div>
              <p className="text-[12px] leading-relaxed text-fg-muted">
                Every number the deck's chart, journey and stat slides draw. Check each against the
                sources above — a figure that is not in the notes was flagged by grounding at generation.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {state.figures.map((f, i) => (
                  <span key={i} className="rounded border border-line bg-sunken px-2 py-0.5 font-mono text-[11px] tabular-nums text-fg-muted">
                    {f}
                  </span>
                ))}
              </div>
            </Panel>
          )}

          {/* The notes as readable prose. */}
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Notes</div>
              <Badge className="bg-raised text-fg-faint">notes.md</Badge>
            </div>
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="h-96 w-full resize-y rounded-lg border border-line bg-sunken p-3 font-mono text-[12px] leading-relaxed text-fg outline-none transition focus:border-accent"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="primary" onClick={save} disabled={saving}>
                    {saving && <Spinner />} Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                </div>
              </div>
            ) : (
              <ProseNotes text={state.notes} />
            )}
          </Panel>

          {/* The sources table. */}
          {state.sources.length > 0 && (
            <Panel className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Sources</div>
                <Badge className="bg-raised text-fg-faint">{state.sources.length}</Badge>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-fg-faint">
                    <th className="py-2 pr-3 font-medium">Title</th>
                    <th className="py-2 pr-3 font-medium">Domain</th>
                    <th className="py-2 pr-3 font-medium">Kind</th>
                    <th className="py-2 font-medium">Words</th>
                  </tr>
                </thead>
                <tbody>
                  {state.sources.map((src, i) => (
                    <tr key={i} className="border-b border-line/60 last:border-0">
                      <td className="max-w-md py-2 pr-3">
                        {src.url ? (
                          <a href={src.url} target="_blank" rel="noreferrer" className="break-all text-[12.5px] text-fg underline-offset-2 hover:underline">
                            {src.title || src.url}
                          </a>
                        ) : (
                          <span className="text-[12.5px] text-fg-muted">{src.title || "untitled"}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-fg-faint">{domainOf(src.url)}</td>
                      <td className="py-2 pr-3 text-[11.5px]">
                        <KindBadge src={src} />
                      </td>
                      <td className="py-2 font-mono text-[11px] tabular-nums text-fg-faint">
                        {typeof src.words === "number" ? src.words : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);
  const num = Number(value) || 0;
  const animatedRef = useRef(false);

  // Count-up: 0 → value over 700ms on the shell ease, triggered the first time
  // the metric scrolls into view. Reduced motion jumps straight to the value.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setDisplay(num); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || animatedRef.current) return;
      animatedRef.current = true;
      io.disconnect();
      const t0 = performance.now();
      const DURATION = 700;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / DURATION);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(num * eased));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [num]);

  return (
    <div ref={ref} className="rounded-lg border border-line bg-sunken px-3 py-2.5">
      <div className="text-[1.4rem] font-semibold tabular-nums leading-none">{display || "—"}</div>
      <div className="mt-1 text-[12px] uppercase tracking-wider text-fg-faint">{label}</div>
    </div>
  );
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function KindBadge({ src }) {
  if (String(src.kind).toLowerCase() === "user-provided") {
    return <Badge className="bg-accent/10 text-accent">your file</Badge>;
  }
  const isPaper = String(src.kind).toLowerCase() === "paper" || /arxiv\.org|doi\.org/.test(src.url ?? "");
  const isAcademic = /\.(edu|ac\.|gov|org|int)\b|wikipedia\.org|ncbi|researchgate/i.test(src.url ?? "");
  const label = isPaper ? "paper" : isAcademic ? "academic" : "web";
  const cls = isPaper ? "bg-accent/10 text-accent" : isAcademic ? "bg-raised text-fg-muted" : "bg-sunken text-fg-faint";
  return <Badge className={cls}>{label}</Badge>;
}

/**
 * Render notes.md as readable prose: source sections as blocks, lines as
 * paragraphs, one blank line between. Kept deliberately dependency-free — the
 * notes are plain research text, not rich markdown. Inline emphasis and code
 * markers are stripped too: the writer emits **bold** and backticks that the
 * reader should see as plain text, not literals.
 */
function ProseNotes({ text }) {
  const blocks = String(text ?? "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (!blocks.length) return <div className="text-[12px] text-fg-faint">(empty)</div>;

  // Strip **bold**, *italic* and `code` inline markers — they leak from the
  // model's notes and read as literals. The stripper runs char-wise so paired
  // markers inside a line all go, and a stray unmatched marker is dropped too.
  const stripInline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*`]/g, "");

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const isHeading = /^#{1,3}\s/.test(block);
        const content = isHeading
          ? stripInline(block.replace(/^#{1,3}\s*/, "").trim())
          : stripInline(block.split("\n").map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).join(" "));
        return (
          <div
            key={i}
            className={`leading-relaxed ${isHeading ? "text-[15px] font-semibold text-fg" : "text-[15px] text-fg-muted"}`}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
