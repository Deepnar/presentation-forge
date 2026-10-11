// Live deck loading state machine (framework-free): idle →
// loading → ready | error, with stale-response avoidance and
// abort cleanup. React (SceneViewer) subscribes; tests drive it
// with an injected compile function and fake timers, no DOM.
//
// A response only lands if it is still the newest request:
// rapid theme changes and unmount-while-loading can never
// overwrite a newer deck or leak listeners. Selection
// reconciliation happens downstream — a new deck object
// remounts the viewer, which clears selection by construction.
export function createLiveDeckLoader({ compile }) {
  if (typeof compile !== "function") throw new Error("liveDeck: compile function required");
  const listeners = new Set();
  let requestId = 0;
  let controller = null;
  const state = {
    status: "idle",
    deck: null,
    error: null,
  };

  function snapshot() {
    return { status: state.status, deck: state.deck, error: state.error };
  }

  function emit() {
    const snap = snapshot();
    for (const fn of listeners) fn(snap);
  }

  async function load(input) {
    const id = ++requestId;
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    state.status = "loading";
    state.deck = null;
    state.error = null;
    emit();
    let data;
    try {
      data = await compile({ ...input, signal });
    } catch (err) {
      if (id !== requestId) return snapshot();
      state.status = "error";
      state.error = signal.aborted ? "request superseded" : (err?.message ?? String(err));
      emit();
      return snapshot();
    }
    if (id !== requestId || signal.aborted) return snapshot();
    if (!data || !Array.isArray(data.scenes)) {
      state.status = "error";
      state.error = "empty response";
      emit();
      return snapshot();
    }
    state.status = "ready";
    state.deck = data;
    emit();
    return snapshot();
  }

  function abort() {
    requestId += 1;
    if (controller) controller.abort();
    controller = null;
    if (state.status === "loading") {
      state.status = "idle";
      emit();
    }
    return snapshot();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { snapshot, load, abort, subscribe };
}
