import { test } from "node:test";
import assert from "node:assert/strict";
import { singleFlight } from "../app/web/src/lib/singleflight.js";

/**
 * The guard in front of a single-use exchange.
 *
 * Address confirmation POSTs a token that is spent on first use, from a React
 * effect — and an effect is not promised to run once. StrictMode mounts it,
 * cleans it up and mounts it again, so the token went out twice: the first call
 * spent it, the second was told it was already used, and the screen reported a
 * dead link for an address it had just confirmed. The only offer on that screen
 * issues a fresh token and repeats the whole thing.
 *
 * The near-miss is guarding the response instead of the request. A `live` flag
 * in the effect's cleanup stops the stale render and the request has already
 * gone, which is exactly what happened.
 */

test("the wrapped call runs once per key however many callers ask", async () => {
  let calls = 0;
  const once = singleFlight(async (key) => { calls += 1; return `ok:${key}`; });

  const [a, b, c] = await Promise.all([once("tok"), once("tok"), once("tok")]);
  assert.equal(calls, 1);
  assert.deepEqual([a, b, c], ["ok:tok", "ok:tok", "ok:tok"]);
});

test("a caller arriving mid-flight waits on the same answer", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const once = singleFlight(async () => { calls += 1; await gate; return "answer"; });

  const first = once("tok");
  const second = once("tok");          // while the first is still open
  release();
  assert.deepEqual(await Promise.all([first, second]), ["answer", "answer"]);
  assert.equal(calls, 1);
});

test("a rejection is shared too, and is not retried", async () => {
  // The failure has to reach both callers. Re-running on rejection would spend
  // a second token to reproduce the same error.
  let calls = 0;
  const once = singleFlight(async () => { calls += 1; throw new Error("already used"); });

  await assert.rejects(once("tok"), /already used/);
  await assert.rejects(once("tok"), /already used/);
  assert.equal(calls, 1);
});

test("a synchronous throw becomes a rejection rather than escaping", async () => {
  // Otherwise the first caller gets an exception, nothing is memoised, and the
  // second caller re-runs it — the exact behaviour this exists to prevent.
  let calls = 0;
  const once = singleFlight(() => { calls += 1; throw new Error("bad token"); });

  await assert.rejects(once("tok"), /bad token/);
  await assert.rejects(once("tok"), /bad token/);
  assert.equal(calls, 1);
});

test("a different key is a different exchange", async () => {
  // A second, genuinely different link in the same session must still be sent.
  const seen = [];
  const once = singleFlight(async (key) => { seen.push(key); return key; });

  await Promise.all([once("a"), once("b"), once("a")]);
  assert.deepEqual(seen, ["a", "b"]);
});

test("the answer survives settling, so a late caller never re-sends", async () => {
  // A remount after the exchange completed must read the stored answer, not
  // ask again with a token that no longer exists.
  let calls = 0;
  const once = singleFlight(async () => { calls += 1; return "confirmed"; });

  assert.equal(await once("tok"), "confirmed");
  assert.equal(await once("tok"), "confirmed");
  assert.equal(calls, 1);
});
