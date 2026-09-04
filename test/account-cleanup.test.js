import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDeletableAccounts, selectionToken, confirmPhrase, MIN_AGE_DAYS } from "../src/cleanup.js";

/**
 * Who a bulk cleanup may remove.
 *
 * This is the most destructive thing the admin panel can do, and the failure
 * mode is not a wrong number — it is a filter that matched more than the
 * operator read. Every rule below is a veto that the caller cannot switch off.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-04T00:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();

const base = () => ({
  users: [
    { email: "stale@x.test", name: "Stale", createdAt: ago(60) },
    { email: "boss@x.test", name: "Boss", createdAt: ago(60), admin: true },
    { email: "author@x.test", name: "Author", createdAt: ago(60) },
    { email: "spender@x.test", name: "Spender", createdAt: ago(60) },
    { email: "fresh@x.test", name: "Fresh", createdAt: ago(2) },
    { email: "me@x.test", name: "Operator", createdAt: ago(60) },
  ],
  deckOwners: new Set(["author@x.test"]),
  usedUserIds: new Set([42]),
  idFor: (e) => (e === "spender@x.test" ? 42 : null),
  protect: ["me@x.test"],
  now: NOW,
});

const reasonFor = (skipped, email) => skipped.find((s) => s.email === email)?.reason;

test("only the account that owns nothing and did nothing is selected", () => {
  const { selected, skipped } = selectDeletableAccounts(base());
  assert.deepEqual(selected.map((s) => s.email), ["stale@x.test"]);
  assert.equal(skipped.length, 5, "and every exclusion is reported, not dropped");
});

test("an admin is never selectable", () => {
  const { selected, skipped } = selectDeletableAccounts(base());
  assert.ok(!selected.some((s) => s.email === "boss@x.test"));
  assert.equal(reasonFor(skipped, "boss@x.test"), "is an admin");
});

test("the operator running the cleanup is never selectable", () => {
  const { skipped } = selectDeletableAccounts(base());
  assert.equal(reasonFor(skipped, "me@x.test"), "is you");
});

test("an account that owns decks is never selectable — deletion would orphan them", () => {
  // deleteUserAccount removes the user and everything that cascades, and
  // nothing removes their decks: meta.owner would name an account that no
  // longer exists and the folder would sit on the volume forever.
  const { skipped } = selectDeletableAccounts(base());
  assert.equal(reasonFor(skipped, "author@x.test"), "owns decks");
});

test("an account that has generated is never selectable", () => {
  const { skipped } = selectDeletableAccounts(base());
  assert.equal(reasonFor(skipped, "spender@x.test"), "has generated");
});

test("a brand-new account is spared whatever else is true of it", () => {
  const { skipped } = selectDeletableAccounts(base());
  assert.match(reasonFor(skipped, "fresh@x.test"), /newer than/);
});

test("the age floor may be raised but never lowered", () => {
  // A caller asking to delete accounts "older than 0 days" gets the floor.
  const wide = selectDeletableAccounts({ ...base(), olderThanDays: 0 });
  assert.equal(wide.criteria.olderThanDays, MIN_AGE_DAYS);
  assert.ok(!wide.selected.some((s) => s.email === "fresh@x.test"), "2 days old is still spared");

  const strict = selectDeletableAccounts({ ...base(), olderThanDays: 90 });
  assert.deepEqual(strict.selected, [], "60 days is not older than 90");
});

test("an unparseable creation date is not evidence of age", () => {
  const o = base();
  o.users = [{ email: "undated@x.test", name: "?", createdAt: "not a date" }];
  const { selected, skipped } = selectDeletableAccounts(o);
  assert.deepEqual(selected, []);
  assert.equal(reasonFor(skipped, "undated@x.test"), "unknown age");
});

test("a pattern narrows the selection and never widens it", () => {
  const o = base();
  o.users.push({ email: "stale2@probe.test", name: "S2", createdAt: ago(60) });
  const all = selectDeletableAccounts(o);
  assert.equal(all.selected.length, 2);
  const narrowed = selectDeletableAccounts({ ...o, emailPattern: "probe" });
  assert.deepEqual(narrowed.selected.map((s) => s.email), ["stale2@probe.test"]);
  // A pattern cannot rescue an account a rule vetoed.
  const cannotWiden = selectDeletableAccounts({ ...o, emailPattern: "boss" });
  assert.deepEqual(cannotWiden.selected, []);
});

/* ------------------------------------------------------------------ token */

test("the token stands for the set, not the filter", () => {
  const a = [{ email: "a@x.test" }, { email: "b@x.test" }];
  const b = [{ email: "b@x.test" }, { email: "a@x.test" }];
  assert.equal(selectionToken(a), selectionToken(b), "order is not part of the identity");
  assert.notEqual(selectionToken(a), selectionToken([{ email: "a@x.test" }]));
  assert.notEqual(selectionToken(a), selectionToken([...a, { email: "c@x.test" }]));
});

test("an account appearing between preview and confirm invalidates the token", () => {
  // This is the property the whole dry run rests on: the confirmation
  // authorises the list that was read, not the filter that produced it.
  const before = selectDeletableAccounts(base());
  const o = base();
  o.users.push({ email: "arrived@x.test", name: "New", createdAt: ago(60) });
  const after = selectDeletableAccounts(o);
  assert.notEqual(selectionToken(before.selected), selectionToken(after.selected));
});

test("the confirmation phrase carries the count, so a stale one cannot approve more", () => {
  assert.equal(confirmPhrase(110), "delete 110 accounts");
  assert.equal(confirmPhrase(1), "delete 1 account");
  assert.notEqual(confirmPhrase(110), confirmPhrase(111));
});
