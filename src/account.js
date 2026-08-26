import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The signed-in account, for the duration of one request.
 *
 * The model client sits five or six calls below the HTTP layer (pipeline →
 * generate → turn → chat → resolveRole), and two things it decides are
 * per-account: which API key a BYOK provider uses, and whether this user's
 * default route is Auto or Cloud. Threading a user id through every one of
 * those signatures would touch the CLI too, which has no account at all.
 *
 * An async-local store keeps it request-scoped instead: the server wraps each
 * request, and anything underneath can ask who is calling. Outside a request —
 * the CLI, a scheduled sweep, a test — there is no account and every caller
 * falls back to the install-wide configuration, which is exactly the old
 * behaviour.
 */

const store = new AsyncLocalStorage();

/** Run `fn` with `account` ({ userId, email }) as the ambient account. */
export function runAsAccount(account, fn) {
  if (!account?.userId && !account?.email) return fn();
  return store.run(account, fn);
}

export function currentAccount() {
  return store.getStore() ?? null;
}

export function currentUserId() {
  return store.getStore()?.userId ?? null;
}
