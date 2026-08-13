import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge } from "../components/ui.jsx";

/**
 * The full Research view — the proper place for the researched content that
 * used to live in a small panel. Reads notes.md as readable prose, sources.json
 * as a table (domain, kind, URL), and the diversity/grounding summary the
 * research pass produced (how many sources, which domains, how many look
 * academic, which are single-source). Editing saves back through PUT /research,
 * and an edit is exactly what the next generation reads.
 */
export default function ResearchView({ slug, refreshToken, onBack }) {
  const [state, setState] = useState({ loading: true, exists: false, notes: "", sources: [], summary: null });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setState((s) => ({ ...s, loading: true }));
    setError("");
    api.research(slug)
      .then((r) => setState({ loading: false, exists: r.exists, notes: r.notes ?? "", sources: r.sources ?? [], summary: r.summary ?? null }))
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
    <div className="mx-auto max-w-4xl px-10 py-10">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 text-xs text-fg-faint transition hover:text-fg">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
        Back to deck
      </button>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-semibold tracking-tight">Research</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            What the writer draws from — the ground truth the deck and report are built on.
          </p>
        </div>
        {state.exists && !editing && (
          <Button size="sm" variant="outline" onClick={() => { setDraft(state.notes); setEditing(true); }}>
            Edit notes
          </Button>
        )}
      </header>

      {state.loading ? (
        <div className="mt-8 flex items-center gap-2 text-[13px] text-fg-muted"><Spinner /> Loading…</div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">{error}</div>
      ) : !state.exists ? (
        <div className="mt-8 rounded-card border border-dashed border-line p-10 text-center text-[13px] leading-relaxed text-fg-muted">
          No research pass ran for this deck. Regenerate with the research option on
          (or with sources) and the notes the model writes from appear here.
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
            {s.distinctDomains < 3 && (
              <div className="mt-3 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">
                Fewer than 3 distinct domains — the research may lean on a single voice.
              </div>
            )}
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
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-sunken px-3 py-2.5">
      <div className="text-[1.4rem] font-semibold tabular-nums leading-none">{value ?? "—"}</div>
      <div className="mt-1 text-[10.5px] uppercase tracking-wider text-fg-faint">{label}</div>
    </div>
  );
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function KindBadge({ src }) {
  const isPaper = String(src.kind).toLowerCase() === "paper" || /arxiv\.org|doi\.org/.test(src.url ?? "");
  const isAcademic = /\.(edu|ac\.|gov|org|int)\b|wikipedia\.org|ncbi|researchgate/i.test(src.url ?? "");
  const label = isPaper ? "paper" : isAcademic ? "academic" : "web";
  const cls = isPaper ? "bg-accent/10 text-accent" : isAcademic ? "bg-raised text-fg-muted" : "bg-sunken text-fg-faint";
  return <Badge className={cls}>{label}</Badge>;
}

/**
 * Render notes.md as readable prose: source sections as blocks, lines as
 * paragraphs, one blank line between. Kept deliberately dependency-free — the
 * notes are plain research text, not rich markdown.
 */
function ProseNotes({ text }) {
  const blocks = String(text ?? "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (!blocks.length) return <div className="text-[12px] text-fg-faint">(empty)</div>;

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const isHeading = /^#{1,3}\s/.test(block);
        const content = isHeading
          ? block.replace(/^#{1,3}\s*/, "").trim()
          : block.split("\n").map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).join(" ");
        return (
          <div
            key={i}
            className={`leading-relaxed ${isHeading ? "text-[13.5px] font-semibold text-fg" : "text-[13px] text-fg-muted"}`}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
