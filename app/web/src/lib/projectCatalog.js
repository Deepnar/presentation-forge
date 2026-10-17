const timestamp = value => { const n = new Date(value ?? 0).getTime(); return Number.isFinite(n) ? n : 0; };
const normalize = text => String(text ?? '').trim().toLowerCase();

export function catalogEntries(saved = [], generated = []) {
  const entries = new Map();
  for (const [kind, items, idField, timeField] of [['saved', saved, 'id', 'updatedAt'], ['generated', generated, 'slug', 'updated']]) {
    if (!Array.isArray(items)) throw new Error('Invalid project list');
    for (const value of items) {
      if (!value || typeof value[idField] !== 'string' || !value[idField]) throw new Error('Invalid project identity');
      const id = value[idField], key = `${kind}:${id}`;
      if (!entries.has(key)) entries.set(key, { key, kind, id, title: value.title || id, updated: timestamp(value[timeField]), value });
    }
  }
  return [...entries.values()].sort((a, b) => b.updated - a.updated || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function filterCatalog(entries, { query = '', type = 'all', hits = [] } = {}) {
  const needle = normalize(query), remote = new Set(hits);
  return entries.filter(row => {
    if (type === 'saved' && row.kind !== 'saved') return false;
    if (type === 'generated' && row.kind !== 'generated') return false;
    if (type === 'reports' && (row.kind !== 'generated' || !row.value.report)) return false;
    const theme = row.kind === 'saved' ? row.value.theme?.name : row.value.theme;
    return !needle || [row.title, row.id, theme].some(text => normalize(text).includes(needle)) || (row.kind === 'generated' && remote.has(row.id));
  });
}

export function createCatalogLoader({ saved, generated, search, isCurrent = () => true, onChange, delay = 250, timeout = 15000 }) {
  let live = true, searchTimer;
  const jobs = new Map(), requests = { saved, generated, search };
  let state = { saved: { status: 'idle', items: [] }, generated: { status: 'idle', items: [] }, search: { status: 'idle', query: '', hits: [] } };
  function cancel(key) {
    const job = jobs.get(key);
    if (job) { clearTimeout(job.timer); job.abort.abort(); jobs.delete(key); }
  }
  function dispose() { live = false; clearTimeout(searchTimer); for (const key of [...jobs.keys()]) cancel(key); }
  function active() { if (!live) return false; if (!isCurrent()) { dispose(); return false; } return true; }
  function publish(key, value) { if (!active()) return; state = { ...state, [key]: value }; onChange(state); }
  function run(key, query = '') {
    if (!active()) return;
    cancel(key);
    const job = { abort: new AbortController() }; jobs.set(key, job);
    const base = key === 'search' ? { query, hits: [] } : { items: [] };
    publish(key, { ...base, status: 'loading' });
    function finish(value) {
      if (jobs.get(key) !== job || !active()) return;
      jobs.delete(key); clearTimeout(job.timer); publish(key, { ...base, ...value });
    }
    job.timer = setTimeout(() => { job.abort.abort(); finish({ status: 'error', error: new Error('This request took too long. Try again.') }); }, timeout);
    Promise.resolve().then(() => {
      if (jobs.get(key) !== job || !active()) return;
      return key === 'search' ? requests.search(query, { signal: job.abort.signal }) : requests[key]({ signal: job.abort.signal });
    }).then(items => {
      if (jobs.get(key) !== job || !active()) return;
      if (key === 'search') {
        if (!Array.isArray(items) || items.some(hit => typeof hit !== 'string')) throw new Error('Invalid search response');
        finish({ status: 'ready', hits: items });
      } else {
        if (!Array.isArray(items)) throw new Error('Invalid project list');
        catalogEntries(key === 'saved' ? items : [], key === 'generated' ? items : []);
        finish({ status: 'ready', items });
      }
    }).catch(error => finish({ status: 'error', error }));
  }
  function setQuery(query, immediate = false) {
    if (!active()) return;
    clearTimeout(searchTimer); cancel('search');
    const q = normalize(query);
    publish('search', { status: q ? 'waiting' : 'idle', query: q, hits: [] });
    if (q) searchTimer = setTimeout(() => run('search', q), immediate ? 0 : delay);
  }
  return {
    refresh(source) {
      if (!active()) return;
      if (source && !['saved', 'generated', 'search'].includes(source)) throw new Error('Unknown project source');
      if (source === 'search') { setQuery(state.search.query, true); return; }
      for (const key of source ? [source] : ['saved', 'generated']) run(key);
      if (!source || source === 'generated') setQuery(state.search.query);
    },
    setQuery, dispose,
    snapshot: () => state,
  };
}
