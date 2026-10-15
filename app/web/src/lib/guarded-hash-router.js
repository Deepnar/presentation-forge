const KEY = '__forgeRoute';

export function createGuardedHashRouter({ window: win, apply, getGuard = () => null }) {
  const previous = win.history.state?.[KEY];
  const session = previous?.session ?? `route-${Date.now()}-${Math.random()}`;
  let current = { hash: win.location.hash, index: previous?.index ?? 0 };
  let live = true;
  let busy = false;
  let traversal = null;

  function stamp(hash, index, push = false) {
    const state = { ...win.history.state, [KEY]: { session, index } };
    win.history[push ? 'pushState' : 'replaceState'](state, '', hash || win.location.href);
  }
  function accept(hash, index) {
    current = { hash, index };
    apply(hash);
  }
  function travel(index, commit = false) {
    if (traversal) return traversal.promise.then(() => live && travel(index, commit));
    const at = win.history.state?.[KEY]?.index;
    if (at === index) {
      if (commit) accept(win.location.hash, index);
      return Promise.resolve(true);
    }
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    traversal = { index, commit, resolve, promise, observed: at };
    win.history.go(index - at);
    return promise;
  }
  async function allowed(hash) {
    const guard = getGuard(hash);
    return !guard?.isDirty() || await guard.confirm(hash);
  }
  async function navigate(hash, { replace = false } = {}) {
    if (!live || busy) return false;
    if (hash === current.hash) { apply(hash); return true; }
    busy = true;
    try {
      if (!await allowed(hash) || !live) return false;
      if (traversal) await traversal.promise;
      if (!live) return false;
      await travel(current.index);
      if (!live) return false;
      const index = replace ? current.index : current.index + 1;
      stamp(hash, index, !replace);
      accept(hash, index);
      return true;
    } finally { busy = false; }
  }
  async function onLocation() {
    if (!live) return;
    const hash = win.location.hash;
    let state = win.history.state?.[KEY];
    // Native fragment assignments create entries outside navigate(). Adopt
    // them before guarding, so cancellation can return to the original entry.
    if (state?.session !== session || (state.index === current.index && hash !== current.hash)) {
      state = { session, index: current.index + 1 };
      stamp(hash, state.index);
    }
    const index = state.index;
    if (traversal) {
      if (traversal.index !== index) {
        if (traversal.observed !== index) {
          traversal.observed = index;
          win.history.go(traversal.index - index);
        }
        return;
      }
      const completed = traversal;
      traversal = null;
      if (completed.commit) accept(hash, index);
      completed.resolve(true);
      return;
    }
    if (hash === current.hash && index === current.index) return;
    if (busy) { await travel(current.index); return; }
    const guard = getGuard(hash);
    if (!guard?.isDirty()) { accept(hash, index); return; }
    busy = true;
    try {
      // Restore history position before opening the asynchronous choice.
      // Cancel leaves both the document and its original history entry intact.
      await travel(current.index);
      if (live && await allowed(hash) && live) await travel(index, true);
    } finally { busy = false; }
  }
  const onEvent = () => { onLocation().catch(() => { busy = false; }); };
  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const target = new URL(link.href, win.location.href);
    const here = new URL(win.location.href);
    if (target.origin !== here.origin || target.pathname !== here.pathname || target.search !== here.search || !target.hash) return;
    event.preventDefault();
    navigate(target.hash).catch(() => {});
  }
  stamp(current.hash, current.index);
  win.addEventListener('popstate', onEvent);
  win.addEventListener('hashchange', onEvent);
  win.document.addEventListener('click', onClick);
  apply(current.hash);
  return {
    navigate,
    sync() {
      stamp(win.location.hash, current.index);
      accept(win.location.hash, current.index);
    },
    dispose() {
      live = false;
      traversal?.resolve(false);
      traversal = null;
      win.removeEventListener('popstate', onEvent);
      win.removeEventListener('hashchange', onEvent);
      win.document.removeEventListener('click', onClick);
    },
  };
}
