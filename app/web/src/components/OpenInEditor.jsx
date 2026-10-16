import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { createEditorHandoff } from "../lib/editorHandoff.js";
import { Button, Spinner } from "./ui.jsx";

function sessionMarker() {
  try { return `${location.hash}\n${localStorage.getItem("forge.token")}`; }
  catch { return location.hash; }
}

export default function OpenInEditor({ slug, mode, accountKey, onOpenProject, originalLink = true, disabled = false, disabledReason = "" }) {
  const [state, setState] = useState({ status: "idle" });
  const action = useRef(null), navigate = useRef(onOpenProject), error = useRef(null);
  navigate.current = onOpenProject;
  useEffect(() => {
    const marker = sessionMarker();
    const expired = () => setState({ status: "expired", message: "Your sign-in changed. Reload this page before opening the editor." });
    const handoff = createEditorHandoff({ slug, mode, request: api.importProject,
      navigate: id => navigate.current(id), current: () => marker === sessionMarker(), update: setState, invalidated: expired });
    const onStorage = event => {
      if ((event.key === "forge.token" || event.key === null) && marker !== sessionMarker()) { handoff.dispose(); expired(); }
    };
    window.addEventListener("storage", onStorage);
    action.current = handoff;
    setState({ status: "idle" });
    return () => { window.removeEventListener("storage", onStorage); handoff.dispose(); action.current = null; };
  }, [slug, mode, accountKey]);
  useEffect(() => { if (state.status === "error") error.current?.focus(); }, [state]);
  const opening = state.status === "opening";
  return (
    <div data-editor-handoff className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={disabled || opening || state.status === "expired"} aria-busy={opening} onClick={() => action.current?.open()}>
          {opening && <Spinner />}{opening ? "Opening editor…" : "Open in editor"}
        </Button>
        {originalLink && <a className="rounded px-2 py-1 text-sm text-fg-muted underline underline-offset-4" href={`#/deck/${encodeURIComponent(slug)}`}>Open original deck</a>}
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">Opens a saved editable copy. Changes to either copy stay separate.</p>
      <p role="status" className="text-xs text-fg-muted">{opening ? "Creating or reopening your saved project…" : state.status === "error" ? "" : state.message || (disabled ? disabledReason : "")}</p>
      {state.status === "expired" && <Button variant="outline" onClick={() => location.reload()}>Reload page</Button>}
      {state.status === "error" && (
        <div ref={error} role="alert" tabIndex={-1} className="rounded-lg border border-line bg-panel p-3 text-sm text-fg outline-offset-2">
          <p>{state.message}</p>
          {state.details?.length > 0 && <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto break-words pl-5 text-xs">{state.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul>}
          <a href="#/projects" className="mt-2 inline-block underline underline-offset-4">View saved projects</a>
        </div>
      )}
    </div>
  );
}
