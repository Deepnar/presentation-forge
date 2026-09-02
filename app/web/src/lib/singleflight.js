/**
 * One in-flight call per key, shared by every caller that asks for it.
 *
 * This exists for exchanges that cannot be repeated. A confirmation or reset
 * token is spent on first use, so a component that POSTs one from an effect has
 * to send it exactly once — and React does not promise that: StrictMode mounts
 * an effect, cleans it up and mounts it again, and any remount runs it afresh.
 * The verify screen sent the token twice, spent it on the first call, was told
 * on the second that the link was already used, and reported a dead link for an
 * address it had just confirmed.
 *
 * Guarding the *response* is not enough, which is the trap: a `let live = true`
 * cleanup flag stops the stale render, but the request has already gone. The
 * guard has to sit in front of the call.
 *
 * The promise itself is shared rather than a "done" boolean, so a second caller
 * arriving mid-flight waits on the same answer and sees the same outcome,
 * rejections included. The entry is kept after settling: for a single-use token
 * the answer is permanent, and re-asking would spend a token that no longer
 * exists.
 */
export function singleFlight(fn) {
  const calls = new Map();
  return (key, ...rest) => {
    if (!calls.has(key)) calls.set(key, Promise.resolve().then(() => fn(key, ...rest)));
    return calls.get(key);
  };
}
