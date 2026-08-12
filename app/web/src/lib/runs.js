/**
 * Live generation runs, kept OUTSIDE React so a long run survives the view
 * switching away from the chat. ChatView is unmounted when the user opens the
 * Identity tab; an AbortController held in a component's state would die with
 * it, and a generation must not. A run lives here — {abort, status, finished}
 * — and any mounted ChatView for that chat subscribes and re-attaches to it,
 * so returning to the chat shows the run's live status and its Stop button
 * still works. Only the subscription is tied to the component; the run itself
 * and the server-side pipeline are never aborted by navigating away.
 */

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
