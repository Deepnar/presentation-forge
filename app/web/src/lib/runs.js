
const store = new Map(); // chatId -> { abort, status, finished, subs:Set<fn> }

export const runs = {
  begin(chatId, run) {
    store.set(chatId, { ...run, status: run.status ?? "Queued…", finished: false, subs: new Set() });
  },

  get(chatId) {
    return store.get(chatId);
  },

  update(chatId, patch) {
    const r = store.get(chatId);
    if (!r) return;
    Object.assign(r, patch);
    for (const fn of r.subs) fn(patch);
  },

  subscribe(chatId, fn) {
    store.get(chatId)?.subs.add(fn);
  },

  unsubscribe(chatId, fn) {
    store.get(chatId)?.subs.delete(fn);
  },

  end(chatId) {
    store.delete(chatId);
  },
};
