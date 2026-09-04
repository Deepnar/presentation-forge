import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The Auto quota under contention.
 *
 * `src/limits.js` caps what one account may spend on the shared gateway, and
 * that key bills the operator — so the cap is a cost control, not a courtesy.
 * It had never been driven by more than one request at a time.
 *
 * The routes enforced it as CHECK, then `await`, then RECORD. Be precise about
 * what that costs, because the obvious reading is wrong: driven through the
 * real HTTP routes, the old shape held the cap exactly. Everything between the
 * check and the record is synchronous (`node:sqlite` is), so the pair spans one
 * microtask, and each request's handler finishes it before the next request's
 * I/O event is dispatched. It was safe by accident, not by construction.
 *
 * The accident ends the moment two callers reach the check in the SAME tick —
 * which is what these tests do, and what any batch, retry loop or in-process
 * fan-out would do. Then all of them read the same pre-spend usage, all pass,
 * and only then does any of them record: ten admitted against a budget of two.
 *
 * So the fix is not a bug fix, it is the removal of a standing hazard: one
 * synchronous decision, in a transaction, with no window to widen.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-limits-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = scratch;
// Small numbers so the test states its intent rather than counting to thirty.
process.env.FORGE_AUTO_WINDOW_REQUESTS = "3";
process.env.FORGE_AUTO_WEEKLY_REQUESTS = "100";
process.env.FORGE_AUTO_WINDOW_SLIDES = "30";
process.env.FORGE_AUTO_WEEKLY_SLIDES = "1000";
process.env.FORGE_AUTO_WEEKLY_TOKENS = "10000000";

const { checkAutoLimits, recordAutoEvent, getUsage, reserveAuto, usageByUser, clearAutoEvents } = await import("../src/limits.js");
const auth = await import("../src/auth.js");

const email = "quota@example.test";
await auth.register({ name: "Q", email, password: "test-password-123" });
const userId = auth.getUserId(email);

/** What a route does today: check, yield, record. The yield is the bug. */
async function checkThenRecord(slides = 0) {
  const chk = checkAutoLimits({ userId, upcomingSlides: slides });
  if (!chk.allowed) return { allowed: false };
  await Promise.resolve();          // the `await enforceAuto(...)` boundary
  recordAutoEvent({ userId, slides });
  return { allowed: true };
}

test("serial requests stop exactly at the cap", async () => {
  const results = [];
  for (let i = 0; i < 6; i++) results.push(await checkThenRecord());
  assert.equal(results.filter((r) => r.allowed).length, 3, "three allowed, then refused");
  assert.equal(getUsage({ userId }).window.requests, 3);
});

test("the old split admits everything that arrives in one tick", async () => {
  // Characterising the hazard, not asserting desired behaviour: this is what
  // check-then-record does when nothing separates the callers, and it is why
  // the reservation below has to be one step rather than two careful ones.
  await auth.register({ name: "R", email: "race@example.test", password: "test-password-123" });
  const raceId = auth.getUserId("race@example.test");

  const attempt = async () => {
    const chk = checkAutoLimits({ userId: raceId, upcomingSlides: 0 });
    if (!chk.allowed) return false;
    await Promise.resolve();
    recordAutoEvent({ userId: raceId, slides: 0 });
    return true;
  };

  const allowed = (await Promise.all(Array.from({ length: 10 }, attempt))).filter(Boolean).length;
  assert.equal(allowed, 10, "all ten read the same unspent budget");
  assert.equal(getUsage({ userId: raceId }).window.requests, 10, "and all ten were billed");
});

test("reserveAuto admits exactly the cap however many arrive at once", async () => {
  await auth.register({ name: "S", email: "reserve@example.test", password: "test-password-123" });
  const id = auth.getUserId("reserve@example.test");

  // The fix: one synchronous decision. No await between reading the usage and
  // writing the event, so there is no point at which a second request can
  // observe the first's unspent budget.
  const attempt = async () => {
    await Promise.resolve();                      // arrive concurrently
    return reserveAuto({ userId: id, upcomingSlides: 0 }).allowed;
  };

  const allowed = (await Promise.all(Array.from({ length: 10 }, attempt))).filter(Boolean).length;
  assert.equal(allowed, 3, "the cap is the cap regardless of arrival order");
  assert.equal(getUsage({ userId: id }).window.requests, 3, "and nothing beyond it was billed");
});

test("a refused reservation records nothing", async () => {
  await auth.register({ name: "T", email: "refused@example.test", password: "test-password-123" });
  const id = auth.getUserId("refused@example.test");
  for (let i = 0; i < 3; i++) assert.equal(reserveAuto({ userId: id }).allowed, true);

  const before = getUsage({ userId: id }).window.requests;
  const denied = reserveAuto({ userId: id });
  assert.equal(denied.allowed, false);
  assert.ok(denied.errors.length > 0, "a refusal says why");
  assert.equal(getUsage({ userId: id }).window.requests, before, "a refusal is not a spend");
});

test("the slide budget is reserved atomically too, not just the request count", async () => {
  await auth.register({ name: "U", email: "slides@example.test", password: "test-password-123" });
  const id = auth.getUserId("slides@example.test");
  // windowSlides is 30 and windowRequests is 3, so two 20-slide decks would
  // pass the request cap and blow the slide cap if slides were not reserved.
  const attempt = async () => {
    await Promise.resolve();
    return reserveAuto({ userId: id, upcomingSlides: 20 }).allowed;
  };
  const allowed = (await Promise.all([attempt(), attempt()])).filter(Boolean).length;
  assert.equal(allowed, 1, "20 + 20 exceeds the 30-slide window");
  assert.equal(getUsage({ userId: id }).window.slides, 20);
});

test.after(() => rm(scratch, { recursive: true, force: true }));

/* ------------------------------------------------------ the operator's view */

test("usage is readable for every account in one pass, not one query each", async () => {
  await auth.register({ name: "V", email: "seen@example.test", password: "test-password-123" });
  await auth.register({ name: "W", email: "unseen@example.test", password: "test-password-123" });
  const seen = auth.getUserId("seen@example.test");
  const unseen = auth.getUserId("unseen@example.test");
  recordAutoEvent({ userId: seen, slides: 8 });
  recordAutoEvent({ userId: seen, slides: 4 });

  const all = usageByUser();
  assert.equal(all.get(seen).windowRequests, 2);
  assert.equal(all.get(seen).windowSlides, 12);
  assert.equal(all.get(seen).weekRequests, 2);
  // An account that has spent nothing is absent rather than zero-filled — the
  // caller defaults it, and carrying a row per registered account is the shape
  // this replaced.
  assert.equal(all.has(unseen), false);
});

test("clearing an account's usage gives it its budget back", async () => {
  // A quota is a cost control, not a punishment: a run that failed after the
  // budget was taken had no remedy short of deleting the account.
  await auth.register({ name: "X", email: "capped@example.test", password: "test-password-123" });
  const id = auth.getUserId("capped@example.test");
  for (let i = 0; i < 3; i++) assert.equal(reserveAuto({ userId: id }).allowed, true);
  assert.equal(reserveAuto({ userId: id }).allowed, false, "at the cap");

  const cleared = clearAutoEvents({ userId: id });
  assert.equal(cleared, 3, "it reports what it dropped");
  assert.equal(getUsage({ userId: id }).window.requests, 0);
  assert.equal(reserveAuto({ userId: id }).allowed, true, "and the account can spend again");
});

test("clearing one account leaves every other account alone", async () => {
  await auth.register({ name: "Y", email: "keep@example.test", password: "test-password-123" });
  await auth.register({ name: "Z", email: "drop@example.test", password: "test-password-123" });
  const keep = auth.getUserId("keep@example.test");
  const drop = auth.getUserId("drop@example.test");
  recordAutoEvent({ userId: keep, slides: 5 });
  recordAutoEvent({ userId: drop, slides: 5 });

  clearAutoEvents({ userId: drop });
  assert.equal(getUsage({ userId: keep }).window.requests, 1, "the neighbour is untouched");
  assert.equal(getUsage({ userId: drop }).window.requests, 0);
});
