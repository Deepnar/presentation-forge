export const COVER_TIMEOUT_MS = 15000;
export const COVER_CACHE_BYTES = 8 * 1024 * 1024;

// Each workspace owns its queue and cache; neither survives its account/view.
export function createCoverLoader({ request, prepare, current = () => null, onExpired = () => {}, limit = 2, timeout = COVER_TIMEOUT_MS, maxEntries = 24, maxBytes = COVER_CACHE_BYTES }) {
  const session = current(), jobs = new Map(), cache = new Map(), watchers = new Set();
  let active = 0, bytes = 0, live = true, expired = false;
  const emit = (watcher, state) => { if (watchers.has(watcher)) watcher.notify(state); };
  function cancel(job) {
    if (job.done) return;
    job.done = true; clearTimeout(job.timer); job.abort.abort(); jobs.delete(job.key);
    if (job.started) active--;
  }
  function checkSession() {
    if (!live || expired) return false;
    if (current() === session) return true;
    expired = true;
    for (const job of [...jobs.values()]) cancel(job);
    cache.clear(); bytes = 0;
    for (const watcher of watchers) emit(watcher, { status: 'expired' });
    onExpired(); return false;
  }
  function remember(key, svg) {
    const size = new TextEncoder().encode(svg).byteLength;
    if (size > maxBytes || maxEntries < 1) return;
    while (cache.size >= maxEntries || bytes + size > maxBytes) {
      const oldest = cache.keys().next().value;
      bytes -= cache.get(oldest).size; cache.delete(oldest);
    }
    cache.set(key, { svg, size }); bytes += size;
  }
  function finish(job, state) {
    if (job.done || !checkSession()) return;
    job.done = true; clearTimeout(job.timer); jobs.delete(job.key); if (job.started) active--;
    if (state.status === 'ready') remember(job.key, state.svg);
    else job.abort.abort();
    for (const watcher of job.watchers) emit(watcher, state);
    drain();
  }
  function drain() {
    if (!checkSession()) return;
    for (const job of jobs.values()) {
      if (active >= limit) break;
      if (job.started) continue;
      job.started = true; active++;
      Promise.resolve().then(async () => {
        if (job.done || !checkSession()) return;
        const cover = await request(job.project, { signal: job.abort.signal });
        if (job.done || !checkSession()) return;
        if (cover.projectId !== job.project.id || cover.revision !== job.project.revision) throw new Error('preview identity changed');
        const svg = await prepare(cover, { signal: job.abort.signal });
        if (typeof svg !== 'string' || !svg.startsWith('<svg')) throw new Error('invalid preview');
        finish(job, { status: 'ready', svg });
      }).catch(error => finish(job, { status: 'error', code: error.code }));
    }
  }
  function subscribe(project, notify) {
    if (!checkSession()) { notify({ status: expired ? 'expired' : 'idle' }); return () => {}; }
    const key = `${project.id}:${project.revision}`, watcher = { notify };
    watchers.add(watcher);
    let job = jobs.get(key);
    if (cache.has(key)) {
      const value = cache.get(key); cache.delete(key); cache.set(key, value);
      emit(watcher, { status: 'ready', svg: value.svg });
    } else {
      if (!job) {
        job = { key, project: { id: project.id, revision: project.revision }, abort: new AbortController(), watchers: new Set(), started: false, done: false };
        jobs.set(key, job);
        job.timer = setTimeout(() => finish(job, { status: 'error', code: 'cover-timeout' }), timeout);
      }
      job.watchers.add(watcher); emit(watcher, { status: 'loading' }); drain();
    }
    return () => {
      watchers.delete(watcher);
      if (job && !job.done) {
        job.watchers.delete(watcher);
        if (!job.watchers.size) { cancel(job); drain(); }
      }
    };
  }
  return {
    subscribe, checkSession,
    dispose() {
      live = false;
      for (const job of [...jobs.values()]) cancel(job);
      watchers.clear(); cache.clear(); bytes = 0;
    },
    stats: () => ({ active, queued: [...jobs.values()].filter(job => !job.started).length, entries: cache.size, bytes, watchers: watchers.size }),
  };
}

export function createCoverPreparer({ validate, fonts, render }) {
  return async (cover, { signal }) => {
    const active = () => { if (signal.aborted) throw new DOMException('Preview cancelled', 'AbortError'); };
    active();
    const verdict = await validate(cover.scene);
    active();
    if (!verdict.ok) throw new Error('invalid saved preview');
    const faces = await fonts([cover.scene]);
    active();
    if (!faces.ready) throw Object.assign(new Error('preview fonts unavailable'), { code: faces.unsupported?.length ? 'cover-fonts-unsupported' : 'cover-fonts' });
    return render(cover.scene, { wrapText: true });
  };
}
