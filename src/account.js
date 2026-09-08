import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();

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
