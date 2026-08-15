/**
 * Live report-WRITE runs, keyed by slug, kept OUTSIDE React so a write started
 * in the deck's Report panel survives navigating to the ReportView mid-write.
 * The ReportView subscribes and disables Render .docx / Download / Plan while
 * a write for its slug is in flight, so a report can never be double-rendered
 * while it is being rewritten. Mirrors runs.js but keyed by slug (the ReportView
 * has no chat id).
 */

const store = new Map(); // slug -> { abort, status, finished, subs:Set<fn> }

export const reportWrites = {
  begin(slug, run) {
    store.set(slug, { ...run, status: run.status ?? "Queued…", finished: false, subs: new Set() });
  },

  get(slug) {
    return store.get(slug);
  },

  update(slug, patch) {
    const r = store.get(slug);
    if (!r) return;
    Object.assign(r, patch);
    for (const fn of r.subs) fn(patch);
  },

  subscribe(slug, fn) {
    store.get(slug)?.subs.add(fn);
  },

  unsubscribe(slug, fn) {
    store.get(slug)?.subs.delete(fn);
  },

  end(slug) {
    const r = store.get(slug);
    if (r) for (const fn of r.subs) fn({ finished: true });
    store.delete(slug);
  },
};
