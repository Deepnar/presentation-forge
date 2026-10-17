// V2-7A workspace dashboard: the primary entry point for saved
// presentations (Workspace → Project → Editor). Projects come only
// from GET /api/v2/projects — no frontend-only list. Creation
// paths: AI (existing generation), layout skeleton, or blank — all
// landing in real persisted projects through apiCreate.
import { useCallback, useEffect, useRef, useState } from "react";
import ProjectCover from "../components/ProjectCover.jsx";
import { createCoverLoader, createCoverPreparer } from "../lib/projectCovers.js";
import { sceneToSvg } from "../../../../packages/editor/scene-svg.js";
import { validateScene } from "../../../../packages/model/scene.ts";
import { ensureDeckFonts } from "../fonts.js";
import ProjectExportButton from "../components/ProjectExportButton.jsx";
import { apiList, apiCreate, apiRename, apiRemove, apiCover, projectSessionKey } from "../lib/v2project.js";
import { buildBlankScenes, buildLayoutScenes, layoutTemplateList, defaultProjectTitle } from "../lib/v2create.js";
import { relative } from "../lib/time.js";
import { Button, Panel, Empty, Spinner, Field, ConfirmModal } from "../components/ui.jsx";

const prepareCover = createCoverPreparer({ validate: validateScene, fonts: ensureDeckFonts, render: sceneToSvg });

function metaLine(p) {
  const bits = [];
  bits.push(`${p.slideCount ?? 0} slide${(p.slideCount ?? 0) === 1 ? "" : "s"}`);
  bits.push(`rev ${p.revision ?? 0}`);
  if (p.updatedAt) {
    try {
      bits.push(relative(p.updatedAt));
    } catch { /* timestamp display is best-effort */ }
  }
  return bits.join(" · ");
}

export default function Workspace({ onOpen, onHistory, onCreateAI, onAuth, accountKey = null }) {
  const [projects, setProjects] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null); // null | "chooser" | "layout"
  const [busy, setBusy] = useState(null); // creation/rename/delete in flight
  const [notice, setNotice] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [sessionChanged, setSessionChanged] = useState(false);
  const recovery = useRef(null);
  useEffect(() => { if (sessionChanged) recovery.current?.focus(); }, [sessionChanged]);
  const [covers, setCovers] = useState(null);
  useEffect(() => {
    const loader = createCoverLoader({ request: apiCover, current: projectSessionKey, prepare: prepareCover,
      onExpired: () => { setSessionChanged(true); setProjects([]); } });
    setCovers(loader);
    const changed = event => { if (event.key === "forge.token" || event.key === null) loader.checkSession(); };
    const check = () => loader.checkSession();
    const timer = setInterval(check, 1000);
    window.addEventListener("storage", changed);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer); window.removeEventListener("storage", changed);
      window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); loader.dispose();
    };
  }, [accountKey]);

  const refresh = useCallback(async () => {
    if (!covers?.checkSession()) return;
    setError(null);
    try {
      const list = await apiList();
      if (covers.checkSession()) setProjects(list);
    } catch (err) {
      if (covers.checkSession()) { setError(err); setProjects([]); }
    }
  }, [covers]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function doCreate(kind, templateId = null, templateName = "") {
    setBusy(kind);
    setNotice(null);
    try {
      const scenes = kind === "layout" ? await buildLayoutScenes(templateId) : await buildBlankScenes();
      const created = await apiCreate({
        title: defaultProjectTitle(kind, templateName),
        scenes,
        origin: { kind: kind === "layout" ? "layout-gallery" : "blank" },
      });
      onOpen(created.id);
    } catch (err) {
      setNotice(`Could not create the presentation: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function doRename(p) {
    const title = renameDraft.trim();
    if (!title) return;
    setBusy(`rename-${p.id}`);
    try {
      await apiRename(p.id, { title, baseRevision: p.revision });
      setRenamingId(null);
      await refresh();
    } catch (err) {
      if (err?.code === "stale-revision") {
        setNotice("That project changed elsewhere — the list was reloaded; rename again from the fresh title.");
        await refresh();
      } else {
        setNotice(`Could not rename: ${err.message}`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function doDelete(p) {
    setBusy(`delete-${p.id}`);
    try {
      await apiRemove(p.id);
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      setNotice(`Could not delete: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (sessionChanged) return <div ref={recovery} role="alert" tabIndex={-1} className="m-6 rounded-card border border-line bg-panel p-4 text-sm">Your sign-in changed. Reload before viewing presentations. <Button onClick={() => location.reload()}>Reload page</Button></div>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" onClickCapture={event => {
      if (covers && !covers.checkSession()) { event.preventDefault(); event.stopPropagation(); }
    }}>
      <div className="mx-auto w-full max-w-6xl px-10 py-10">
        <div className="mb-7 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.015em]">Presentations</h1>
            <p className="mt-1 max-w-2xl text-[15px] text-fg-muted">
              Saved presentations live here. Open one to edit, or start a new one below.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} title="Reload the project list">Refresh</Button>
            <Button variant="primary" size="sm" data-workspace-create onClick={() => setCreating("chooser")}>Create presentation</Button>
          </div>
        </div>

        {notice && (
          <div role="status" className="mb-4 rounded-card border border-amber/30 bg-amber/5 px-3 py-2 text-[13px] text-amber">
            {notice}
          </div>
        )}

        {creating && (
          <Panel className="mb-6 p-5" data-create-chooser={creating}>
            <div className="mb-3 flex items-center gap-3">
              <strong className="text-[15px]">Start a new presentation</strong>
              <button onClick={() => setCreating(null)} className="ml-auto px-2 py-1 text-[12px] text-fg-muted transition hover:text-fg" aria-label="Close creation chooser">✕</button>
            </div>
            {creating === "chooser" && (
              <div className="grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  data-create-ai
                  onClick={onCreateAI}
                  className="rounded-card border border-line bg-raised p-4 text-left transition hover:border-accent"
                >
                  <div className="text-[14px] font-semibold">Create with AI</div>
                  <div className="mt-1 text-[13px] text-fg-muted">Describe the talk in chat; the existing generation workflow drafts the deck.</div>
                </button>
                <button
                  type="button"
                  data-create-layout
                  onClick={() => setCreating("layout")}
                  className="rounded-card border border-line bg-raised p-4 text-left transition hover:border-accent"
                >
                  <div className="text-[14px] font-semibold">Start from a layout</div>
                  <div className="mt-1 text-[13px] text-fg-muted">One editable slide from the 15-template gallery, saved immediately.</div>
                </button>
                <button
                  type="button"
                  data-create-blank
                  disabled={busy !== null}
                  onClick={() => doCreate("blank")}
                  className="rounded-card border border-line bg-raised p-4 text-left transition hover:border-accent disabled:opacity-60"
                >
                  <div className="text-[14px] font-semibold">{busy === "blank" ? "Creating…" : "Blank presentation"}</div>
                  <div className="mt-1 text-[13px] text-fg-muted">One intentionally empty slide, ready to edit.</div>
                </button>
              </div>
            )}
            {creating === "layout" && (
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <button type="button" onClick={() => setCreating("chooser")} className="text-[13px] text-fg-muted transition hover:text-fg">← All options</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-layout-grid>
                  {layoutTemplateList().map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-layout-pick={t.id}
                      disabled={busy !== null}
                      onClick={() => doCreate("layout", t.id, t.name)}
                      className="rounded-card border border-line bg-raised px-3 py-2.5 text-left transition hover:border-accent disabled:opacity-60"
                    >
                      <div className="text-[13.5px] font-semibold">{t.name}</div>
                      <div className="text-[12px] text-fg-faint">{t.category}</div>
                    </button>
                  ))}
                </div>
                {busy === "layout" && (
                  <div className="mt-3 flex items-center gap-2 text-[13px] text-fg-muted"><Spinner /> Creating…</div>
                )}
              </div>
            )}
          </Panel>
        )}

        {projects === null && !error && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading presentations">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-36 rounded-card" />)}
          </div>
        )}

        {error?.status === 401 && (
          <Empty
            title="Sign in to see presentations"
            hint="Saved presentations belong to an account on hosted installs."
            action={<Button variant="primary" onClick={onAuth}>Sign in</Button>}
          />
        )}

        {error && error.status !== 401 && (
          <div className="mb-4">
            {error.code === "store-misconfigured" || error.status === 403 ? (
              <Empty
                title="Project storage is disabled on this host"
                hint={error.message}
                action={<Button variant="outline" onClick={refresh}>Retry</Button>}
              />
            ) : (
              <div role="alert" className="rounded-card border border-amber/30 bg-amber/5 px-3 py-2 text-[13px] text-amber">
                Could not load presentations: {error.message}{" "}
                <Button size="sm" variant="outline" onClick={refresh}>Retry</Button>
              </div>
            )}
          </div>
        )}

        {projects !== null && !error && !sessionChanged && projects.length === 0 && (
          <Empty
            title="No presentations yet"
            hint="Create one above — blank, from a layout, or with AI — and it will appear here."
            action={<Button variant="primary" onClick={() => setCreating("chooser")}>Create presentation</Button>}
          />
        )}

        {projects !== null && projects.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-project-grid>
            {projects.map((p) => (
              <Panel key={p.id} className="flex flex-col p-4" data-project-card={p.id}>
                {covers && <ProjectCover key={p.revision} project={p} loader={covers} onOpen={onOpen} onRefresh={refresh} disabled={renamingId === p.id} />}
                {renamingId === p.id ? (
                  <div className="flex flex-col gap-2">
                    <Field label="Title" value={renameDraft} onChange={setRenameDraft} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => doRename(p)}>Apply</Button>
                      <Button size="sm" onClick={() => setRenamingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold" title={p.title}>{p.title}</div>
                      <div className="mt-0.5 text-[12.5px] text-fg-faint">{metaLine(p)}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="primary" data-project-open={p.id} onClick={() => onOpen(p.id)}>Open</Button>
                      <Button size="sm" data-project-history={p.id} title="Version history" onClick={() => onHistory(p.id)}>History</Button>
                      <Button size="sm" onClick={() => { setRenamingId(p.id); setRenameDraft(p.title); }}>Rename</Button>
                      <ProjectExportButton
                        data-project-export={p.id}
                        projectId={p.id} title={p.title}
                        className="rounded px-2.5 py-1.5 text-xs text-fg-muted transition hover:bg-hover hover:text-fg"
                      >
                        Export
                      </ProjectExportButton>
                      <Button size="sm" onClick={() => setConfirmDelete(p)}>Delete…</Button>
                    </div>
                  </>
                )}
              </Panel>
            ))}
          </div>
        )}

        {confirmDelete && (
          <ConfirmModal
            title={`Delete “${confirmDelete.title}”?`}
            body="Saved versions go with it. This cannot be undone."
            confirmLabel={busy === `delete-${confirmDelete.id}` ? "Deleting…" : "Delete"}
            danger
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => doDelete(confirmDelete)}
          />
        )}
      </div>
    </div>
  );
}
