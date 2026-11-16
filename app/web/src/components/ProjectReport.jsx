// The project's written report: write one from the slides, notes and
// files, then download it as .docx. Earlier ones stay listed, newest
// first, so writing again never loses the one already read.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { apiListDocuments, apiRemoveDocument, apiDownloadDocument } from "../lib/v2project.js";
import { withBudgetRetry } from "../lib/budget.js";
import { progressLabel } from "../lib/progress.js";

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function ProjectReport({ projectId, revision }) {
  const [documents, setDocuments] = useState(null);
  const [depth, setDepth] = useState("full");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const run = useRef(null);
  const load = useCallback(() => { apiListDocuments(projectId).then(setDocuments).catch((e) => setError(e.message)); }, [projectId]);
  useEffect(() => { setDocuments(null); setError(null); load(); }, [load]);
  useEffect(() => () => run.current?.abort(), []);

  async function write() {
    setError(null); setNotice(null); setStatus("Starting…");
    try {
      await withBudgetRetry((allowOverrun) => {
        const r = api.projectReport(projectId, { depth, allowOverrun }, {
          status: (p) => setStatus(progressLabel(p) ?? "Writing…"),
          result: (out) => {
            const skipped = out?.skipped?.length ?? 0;
            setNotice(skipped ? `Written, without ${skipped} section${skipped > 1 ? "s" : ""} the model could not write.` : "Written.");
          },
        });
        run.current = r;
        return r.promise;
      });
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      run.current = null; setStatus(null); load();
    }
  }

  const busy = status !== null;
  return (
    <div data-project-report className="flex flex-col gap-1.5 border-t border-line pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-fg-faint">Report</span>
        <div className="flex items-center gap-1.5">
          <select aria-label="Report length" value={depth} disabled={busy} onChange={(e) => setDepth(e.target.value)}
            className="rounded border border-line bg-panel px-1 py-0.5 text-[12px] text-fg">
            <option value="full">Full</option>
            <option value="brief">Brief</option>
          </select>
          <button type="button" data-write-report disabled={busy} onClick={write}
            title="Write a report from this project's slides, notes and files"
            className="rounded border border-line px-2 py-0.5 text-[12.5px] text-fg hover:bg-raised disabled:opacity-40">
            {documents?.length ? "Write again" : "Write report"}
          </button>
        </div>
      </div>
      {busy && (
        <div role="status" className="flex items-center justify-between gap-2 text-[12px] text-fg-muted">
          <span>{status}</span>
          <button type="button" onClick={() => run.current?.abort()} className="text-fg-faint hover:text-fg">Stop</button>
        </div>
      )}
      {notice && !busy && <div role="status" className="text-[12px] text-fg-muted">{notice}</div>}
      {documents?.map((d, i) => (
        <div key={d.id} data-document={d.id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1.5">
          <div className="min-w-0">
            <div className="truncate text-[12.5px] text-fg" title={d.title}>{d.title}</div>
            <div className="text-[11.5px] text-fg-faint">
              {when(d.createdAt)}{revision != null && d.basisRevision !== revision && i === 0 ? " · slides changed since" : ""}
            </div>
          </div>
          <div className="flex flex-none items-center gap-1">
            <button type="button" data-download-document onClick={() => apiDownloadDocument(projectId, d.id).catch((e) => setError(e.message))}
              className="rounded border border-line px-2 py-0.5 text-[12px] text-fg hover:bg-raised">.docx</button>
            <button type="button" aria-label={`Remove ${d.title}`} title="Remove" onClick={() => apiRemoveDocument(projectId, d.id).then(load).catch((e) => setError(e.message))}
              className="rounded px-1 text-[13px] text-fg-muted hover:bg-raised hover:text-fg">×</button>
          </div>
        </div>
      ))}
      {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}

// The speaker script, written into each slide's notes. What was written
// lands in one step when the run ends or is stopped, so one undo takes it
// back; notes the person wrote are kept unless they tick "Replace mine".
export function ProjectScript({ projectId, getScenes, onWritten }) {
  const [status, setStatus] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const run = useRef(null);
  useEffect(() => () => run.current?.abort(), []);

  async function write() {
    setError(null); setNotice(null); setStatus("Starting…");
    const written = [], skipped = [];
    try {
      await withBudgetRetry((allowOverrun) => {
        const r = api.projectScript(projectId, { scenes: getScenes(), overwrite, allowOverrun }, {
          status: (p) => setStatus(progressLabel(p) ?? "Writing…"),
          slide: (s) => { if (s?.words) written.push(s); else if (s) skipped.push(s); },
        });
        run.current = r;
        return r.promise;
      });
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      run.current = null;
      setStatus(null);
      if (written.length) {
        const out = await onWritten(written);
        if (out && out.ok === false) setError(out.message ?? "the notes could not be written");
      }
      const own = skipped.filter((s) => s.reason === "your own notes").length;
      if (written.length || skipped.length) {
        setNotice(`Notes written for ${written.length} slide${written.length === 1 ? "" : "s"}${own ? ` · ${own} kept as you wrote them` : ""}${skipped.length - own ? ` · ${skipped.length - own} skipped` : ""}. Undo takes them back.`);
      }
    }
  }

  const busy = status !== null;
  return (
    <div data-project-script className="flex flex-col gap-1.5 border-t border-line pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-fg-faint">Speaker notes</span>
        <button type="button" data-write-script disabled={busy} onClick={write}
          title="Write what to say for every slide into its notes"
          className="rounded border border-line px-2 py-0.5 text-[12.5px] text-fg hover:bg-raised disabled:opacity-40">Write for all slides</button>
      </div>
      <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
        <input type="checkbox" checked={overwrite} disabled={busy} onChange={(e) => setOverwrite(e.target.checked)} />
        Replace notes I wrote
      </label>
      {busy && (
        <div role="status" className="flex items-center justify-between gap-2 text-[12px] text-fg-muted">
          <span>{status}</span>
          <button type="button" onClick={() => run.current?.abort()} className="text-fg-faint hover:text-fg">Stop</button>
        </div>
      )}
      {notice && !busy && <div role="status" className="text-[12px] text-fg-muted">{notice}</div>}
      {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}
