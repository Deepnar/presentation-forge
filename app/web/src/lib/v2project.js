// V2 project client: fetch wrappers plus the save-state machine the
// SceneViewer drives. Framework-free except for fetch/localStorage
// injection points (tests drive it headless with fakes).
//
// Save-state contract (never "Saved" on engine success alone):
//   idle — no project bound yet
//   dirty — engine revision moved past the last confirmed save
//   saving — one PUT in flight (no overlapping saves per project)
//   saved — server confirmed; savedEngineRev === engine rev at submit
//   stale — server reported a newer stored revision; edits kept
//   error — validation failure; edits kept, draft preserved
//   unavailable — network/store failure; editing continues, warned
//
// A save captures a known authoritative revision: the scenes snapshot
// plus the engine revision at submit time. If further edits land while
// the PUT is in flight, the older response never marks them saved —
// savedEngineRev advances only when it still equals the submitted rev.
export const LAST_PROJECT_KEY = "forge.v2.lastProject";
// Session token for hosted accounts, same key and header shape as
// the V1 api client: without it every project call runs anonymous,
// so a signed-in owner's dashboard would list nobody's projects
// and saves would land on ownerless rows. Anonymous local boxes
// send nothing, exactly as before.
const TOKEN_KEY = "forge.token";
export function projectSessionKey() {
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null; }
  catch { return null; }
}
function authHeaders() {
  try {
    const t = projectSessionKey();
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}
export const AUTOSAVE_DELAY_MS = 2000;

export async function apiCover(project, { signal } = {}, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(project.id)}/cover?revision=${project.revision}`, {
    headers: authHeaders(), signal, cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body.cover) {
    throw Object.assign(new Error(body?.error ?? "preview unavailable"), { status: res.status, code: body?.code });
  }
  return body.cover;
}

export async function apiExport(id, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}/export.pptx`, { headers: { ...authHeaders() } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `export failed (${res.status})`);
  }
  return res.blob();
}

export async function apiList(fetchFn = fetch, { signal } = {}) {
  const res = await fetchFn("/api/v2/projects", { headers: { ...authHeaders() }, signal, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error ?? `list failed (${res.status})`);
    err.code = body?.code ?? null;
    err.status = res.status;
    throw err;
  }
  return body.projects ?? [];
}

export async function apiCreate({ title, scenes, theme, origin }, fetchFn = fetch) {
  const res = await fetchFn("/api/v2/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title, scenes, theme, origin }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error ?? `create failed (${res.status})`);
    err.code = body?.code ?? null;
    err.status = res.status;
    throw err;
  }
  return body.project;
}

// Authorization belongs to the action's captured session, including local anonymity.
export function capturedProjectFetch(token, current, fetchFn = fetch) {
  return (url,options = {}) => {
    if (!current() || projectSessionKey() !== token)
      throw Object.assign(new Error('The project session changed.'), { code: 'session-changed' });
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization',`Bearer ${token}`);
    else headers.delete('Authorization');
    return fetchFn(url,{ ...options, headers, credentials: 'omit' });
  };
}

export async function apiCopy(id, { title, scenes, theme }, fetchFn = fetch) {
  const response = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}/copy`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, scenes, ...(theme ? { theme } : {}) }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok || !body.project) throw Object.assign(
    new Error(body?.error ?? 'Copy could not be confirmed. Check the workspace before trying again.'),
    { code: body?.code, status: response.status });
  return body.project;
}

export async function apiLoad(id, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}`, { headers: { ...authHeaders() } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error ?? `load failed (${res.status})`);
    err.code = body?.code ?? null;
    err.status = res.status;
    throw err;
  }
  return body.project;
}

export async function apiSave(id, { baseRevision, title, scenes, theme, origin }, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ baseRevision, title, scenes, theme, origin }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 409 || body?.code === "stale-revision") {
    const err = new Error(body?.error ?? "stale project revision");
    err.code = "stale-revision";
    err.expectedRevision = body?.expectedRevision ?? null;
    err.actualRevision = body?.actualRevision ?? null;
    throw err;
  }
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error ?? `save failed (${res.status})`);
    err.code = body?.code ?? null;
    err.status = res.status;
    throw err;
  }
  return body.project;
}

export async function apiRename(id, { title, baseRevision }, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title, baseRevision }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 409 || body?.code === "stale-revision") {
    const err = new Error(body?.error ?? "stale project revision");
    err.code = "stale-revision";
    err.expectedRevision = body?.expectedRevision ?? null;
    err.actualRevision = body?.actualRevision ?? null;
    throw err;
  }
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error ?? `rename failed (${res.status})`);
    err.code = body?.code ?? null;
    throw err;
  }
  return body.project;
}

export async function apiRemove(id, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}`, { method: "DELETE", headers: { ...authHeaders() } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? `delete failed (${res.status})`);
  return true;
}

export async function apiListRevisions(id, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}/revisions`, { headers: { ...authHeaders() } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error ?? `history failed (${res.status})`);
    err.code = body?.code ?? null;
    err.status = res.status;
    throw err;
  }
  return { currentRevision: body.currentRevision, retention: body.retention, revisions: body.revisions ?? [] };
}

export async function apiGetRevision(id, revision, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}/revisions/${encodeURIComponent(String(revision))}`, { headers: { ...authHeaders() } });
  const body = await res.json().catch(() => null);
  if (res.status === 410 || body?.code === "revision-pruned") {
    const err = new Error(body?.error ?? "revision pruned");
    err.code = "revision-pruned";
    err.revision = body?.revision ?? null;
    throw err;
  }
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error ?? `revision failed (${res.status})`);
    err.code = body?.code ?? null;
    err.status = res.status;
    throw err;
  }
  return { revision: body.revision, project: body.project };
}

export async function apiRestore(id, { revision, baseRevision, provenance }, fetchFn = fetch) {
  const res = await fetchFn(`/api/v2/projects/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ revision, baseRevision, provenance }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 409 || body?.code === "stale-revision") {
    const err = new Error(body?.error ?? "stale project revision");
    err.code = "stale-revision";
    err.expectedRevision = body?.expectedRevision ?? null;
    err.actualRevision = body?.actualRevision ?? null;
    throw err;
  }
  if (res.status === 410 || body?.code === "revision-pruned") {
    const err = new Error(body?.error ?? "revision pruned");
    err.code = "revision-pruned";
    throw err;
  }
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error ?? `restore failed (${res.status})`);
    err.code = body?.code ?? null;
    err.status = res.status;
    throw err;
  }
  return { project: body.project, restoredFrom: body.restoredFrom };
}

export function readLastProject(storage = null) {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    return s?.getItem(LAST_PROJECT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLastProject(id, storage = null) {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    if (id) s?.setItem(LAST_PROJECT_KEY, id);
    else s?.removeItem(LAST_PROJECT_KEY);
  } catch { /* persistence hint only — never blocks editing */ }
}

// One autosave lane per project session: coalesces rapid edits into a
// single PUT after a quiet period, never overlaps saves, retries one
// transient failure, and reports persistent failure without losing
// edits. The caller supplies authoritative snapshots; drafts
// (open text sessions, unapplied chart/table grids) never enter here.
export function createAutosave({ delayMs = AUTOSAVE_DELAY_MS, saveNow, onState }) {
  let timer = null;
  let running = false;
  let queued = false;
  let failures = 0;
  let disposed = false;

  async function run() {
    if (disposed || running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await saveNow();
      failures = 0;
    } catch (err) {
      failures += 1;
      // One retry for a transient failure; a second consecutive
      // failure surfaces and waits for the next edit or manual save.
      if (failures === 1 && !disposed) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!disposed) {
          try {
            await saveNow();
            failures = 0;
          } catch (err2) {
            onState?.({ type: "autosave-failed", error: err2 });
          }
        }
      } else {
        onState?.({ type: "autosave-failed", error: err });
      }
    } finally {
      running = false;
      if (queued && !disposed) {
        queued = false;
        schedule();
      }
    }
  }

  function schedule() {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run();
    }, delayMs);
  }

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    queued = false;
  }

  function dispose() {
    disposed = true;
    cancel();
  }

  return { schedule, cancel, dispose };
}
