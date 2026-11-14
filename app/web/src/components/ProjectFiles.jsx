// The files a person added to this project as material, each with the role
// it plays — the truth to follow, a look to take, data to chart. The text
// read from them is what the Assistant can use.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiListFiles, apiAddFile, apiSetFileRole, apiRemoveFile } from "../lib/v2project.js";

const ROLES = [
  ["source", "Source"], ["source-of-truth", "Source of truth"], ["visual-reference", "Visual reference"],
  ["dataset", "Data"], ["template", "Template"], ["brand", "Brand"], ["asset", "Asset"], ["unknown", "Other"],
];
const ACCEPT = ".pdf,.docx,.pptx,.md,.markdown,.txt,.csv";
const KB = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function ProjectFiles({ projectId }) {
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);
  const load = useCallback(() => { apiListFiles(projectId).then(setFiles).catch((e) => setError(e.message)); }, [projectId]);
  useEffect(() => { setFiles(null); setError(null); load(); }, [load]);
  async function add(list) {
    setBusy(true); setError(null);
    try { for (const f of list) await apiAddFile(projectId, f); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); load(); }
  }
  return (
    <div data-project-files className="flex flex-col gap-1.5 border-t border-line pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-fg-faint">Files</span>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ""; if (l.length) add(l); }} />
        <button type="button" data-add-file disabled={busy} onClick={() => input.current?.click()} title="Add a PDF, Word, PowerPoint, Markdown, text or CSV file"
          className="rounded border border-line px-2 py-0.5 text-[12.5px] text-fg hover:bg-raised disabled:opacity-40">{busy ? "Adding…" : "Add file"}</button>
      </div>
      {files?.length === 0 && <div className="text-[12px] text-fg-faint">Add a report, data or a deck for the Assistant to work from.</div>}
      {files?.map((f) => (
        <div key={f.id} data-file={f.id} className="flex flex-col gap-1 rounded border border-line px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[12.5px] text-fg" title={f.name}>{f.name}</span>
            <button type="button" aria-label={`Remove ${f.name}`} title="Remove" onClick={() => apiRemoveFile(projectId, f.id).then(load).catch((e) => setError(e.message))}
              className="flex-none rounded px-1 text-[13px] text-fg-muted hover:bg-raised hover:text-fg">×</button>
          </div>
          <div className="flex items-center gap-2">
            <select aria-label={`Role of ${f.name}`} value={f.role} onChange={(e) => apiSetFileRole(projectId, f.id, e.target.value).then(load).catch((er) => setError(er.message))}
              className="min-w-0 flex-1 rounded border border-line bg-panel px-1 py-0.5 text-[12px] text-fg">
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="flex-none text-[11.5px] text-fg-faint">{f.kind.toUpperCase()} · {KB(f.size)}</span>
          </div>
        </div>
      ))}
      {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}
