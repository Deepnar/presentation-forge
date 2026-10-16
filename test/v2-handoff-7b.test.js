import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditorHandoff, handoffError, EDITOR_IMPORT_REQUEST_ID } from "../app/web/src/lib/editorHandoff.js";
import { api } from "../app/web/src/api.js";

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture(options = {}) {
  const calls = [], navigation = [], states = [];
  const handoff = createEditorHandoff({ slug: "completed-source", mode: false,
    request: async (...args) => { calls.push(args); return { project: { id: "saved-project" } }; },
    navigate: async id => { navigation.push(id); return true; }, update: state => states.push(state), ...options });
  return { handoff, calls, navigation, states };
}
test("one pending click owns creation and navigation; a fresh view reuses the durable identity", async () => {
  const first = fixture(); const a = first.handoff.open(), b = first.handoff.open(); assert.equal(a, b);
  assert.equal(await a, true); assert.equal(first.calls.length, 1); assert.deepEqual(first.navigation, ["saved-project"]);
  const next = fixture(); await next.handoff.open();
  assert.deepEqual(first.calls[0], next.calls[0]); assert.equal(first.calls[0][1].requestId, EDITOR_IMPORT_REQUEST_ID);
});
test("an ambiguous response retries with the same identity, preserving a server-created project", async () => {
  const calls = []; let attempt = 0;
  const f = fixture({ request: async (slug, body) => { calls.push(body); if (!attempt++) throw new TypeError("connection lost after commit"); return { project: { id: "already-created" } }; } });
  assert.equal(await f.handoff.open(), false); assert.equal(f.states.at(-1).status, "error");
  assert.equal(await f.handoff.open(), true); assert.deepEqual(calls[0], calls[1]); assert.deepEqual(f.navigation, ["already-created"]);
});
test("navigation waits for confirmed creation and uses the returned current project", async () => {
  const request = deferred(), route = deferred();
  const f = fixture({ request: () => request.promise, navigate: id => { f.navigation.push(id); return route.promise; } });
  const result = f.handoff.open(); await Promise.resolve(); assert.deepEqual(f.navigation, []);
  request.resolve({ project: { id: "human-edited-project" }, reused: true });
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(f.navigation, ["human-edited-project"]);
  assert.equal(f.states.at(-1).status, "opening"); route.resolve(false); assert.equal(await result, false);
  assert.match(f.states.at(-1).message, /available from Projects/);
});
for (const [name, change] of [["unmounted view", f => f.handoff.dispose()], ["account or route changed", f => { f.current = false; }]]) {
  test(`a late response cannot navigate or update an ${name}`, async () => {
    const request = deferred(); const f = { current: true };
    Object.assign(f, fixture({ request: () => request.promise, current: () => f.current }));
    const result = f.handoff.open(); await Promise.resolve(); change(f);
    const before = f.states.length; request.resolve({ project: { id: "committed-in-background" } });
    assert.equal(await result, false); assert.deepEqual(f.navigation, []); assert.equal(f.states.length, before);
  });
}
test("disposing before the deferred request starts performs no write", async () => {
  const f = fixture(); const result = f.handoff.open(); f.handoff.dispose(); await result; assert.deepEqual(f.calls, []);
});
test("an expired view cannot initiate work", async () => {
  const f = fixture({ current: () => false }); assert.equal(await f.handoff.open(), false); assert.deepEqual(f.calls, []); assert.deepEqual(f.states, []);
});
test("a changed sign-in invalidates once and exposes recovery without any new write", async () => {
  const request = deferred(); let current = true, invalidations = 0;
  const f = fixture({ request: () => request.promise, current: () => current, invalidated: () => { invalidations++; } });
  const pending = f.handoff.open(); await Promise.resolve(); current = false;
  request.resolve({ project: { id: "old-owner-project" } }); await pending;
  assert.equal(invalidations, 1); assert.deepEqual(f.navigation, []);
  assert.equal(await f.handoff.open(), false); assert.equal(invalidations, 1);
});
test("a late failed response does not focus an error in a departed view", async () => {
  const request = deferred(); const f = fixture({ request: () => request.promise });
  const result = f.handoff.open(); await Promise.resolve(); f.handoff.dispose(); request.reject(new Error("offline"));
  await result; assert.equal(f.states.length, 1);
});
test("malformed success cannot navigate or claim a saved project", async () => {
  const f = fixture({ request: async () => ({ ok: true }) }); assert.equal(await f.handoff.open(), false);
  assert.deepEqual(f.navigation, []); assert.equal(f.states.at(-1).status, "error");
});
test("dark source mode is consistent across string and remembered boolean", async () => {
  const first = fixture({ mode: true }), next = fixture({ mode: "dark" }); await first.handoff.open(); await next.handoff.open();
  assert.deepEqual(first.calls[0], next.calls[0]); assert.equal(next.calls[0][1].mode, "dark");
});
test("source conflicts and deleted copies refuse rather than rotating identity or replacing edits", async () => {
  for (const code of ["import-source-changed", "import-target-deleted"]) {
    const seen = []; const f = fixture({ request: async (slug, body) => { seen.push(body); throw Object.assign(new Error("conflict"), { code }); } });
    await f.handoff.open(); await f.handoff.open(); assert.deepEqual(seen[0], seen[1]); assert.deepEqual(f.navigation, []);
    assert.equal(f.states.at(-1).status, "error"); assert.match(f.states.at(-1).message, /changed|deleted/);
  }
});
test("refusals retain structured diagnostics and distinguish recovery paths", () => {
  const unsupported = handoffError({ status: 422, errors: [{ path: "slides[1].notes", reason: "notes are unsupported" }, "fit exceeds capacity", null, {}] });
  assert.match(unsupported.message, /original deck is unchanged/); assert.deepEqual(unsupported.details, ["slides[1].notes: notes are unsupported", "fit exceeds capacity"]);
  for (const [error, match] of [[{ status: 401 }, /Sign in/], [{ status: 403, message: "confirm your email" }, /confirm/], [{ status: 404 }, /unavailable to this account/], [{ status: 503 }, /storage is unavailable/], [{ code: "source-incomplete" }, /finalized/]]) assert.match(handoffError(error).message, match);
});
test("HTTP handoff sends bearer identity and preserves service diagnostics", async t => {
  const priorFetch = globalThis.fetch, priorStorage = globalThis.localStorage;
  t.after(() => { globalThis.fetch = priorFetch; if (priorStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = priorStorage; });
  globalThis.localStorage = { getItem: key => key === "forge.token" ? "test-session" : null };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/decks/completed-source/v2-project"); assert.equal(options.headers.Authorization, "Bearer test-session");
    assert.deepEqual(JSON.parse(options.body), { requestId: EDITOR_IMPORT_REQUEST_ID, mode: "light" });
    assert.equal(options.method, "POST"); assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ ok: false, code: "unsupported-content", error: "refused", errors: [{ path: "slides[0]", reason: "unsupported" }] }), { status: 422 });
  };
  await assert.rejects(api.importProject("completed-source", { requestId: EDITOR_IMPORT_REQUEST_ID, mode: "light" }), error => error.status === 422 && error.code === "unsupported-content" && error.errors[0].reason === "unsupported");
});
