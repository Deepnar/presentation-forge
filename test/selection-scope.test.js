import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeOpsToSelection } from "../src/ai/ops.js";

/**
 * Holding a turn to the slides the user selected.
 *
 * The panel's selection reaches the model only as prose — "the request below
 * applies to EXACTLY these" — and prose is a hint. A real turn asking to
 * shorten slide 5's bullets edited slide 6 instead and reported success: the
 * change list said one slide changed, and it was the wrong one.
 *
 * Nothing further down can catch that. Editing a slide the user did not mean
 * produces a perfectly valid deck, so validation, the fit sweeps and the render
 * are all clean. The only place it can be caught is between the model's ops and
 * applying them.
 */

const upd = (index) => ({ op: "update_slide", index, patch: { headline: "x" } });

test("an op on an unselected slide is refused", () => {
  const { ops, refused } = scopeOpsToSelection([upd(5)], [4]);
  assert.deepEqual(ops, []);
  assert.deepEqual(refused, [{ op: "update_slide", index: 5 }]);
});

test("ops on selected slides pass through untouched", () => {
  const given = [upd(4), upd(7)];
  const { ops, refused } = scopeOpsToSelection(given, [4, 7]);
  assert.deepEqual(ops, given);
  assert.deepEqual(refused, []);
});

test("with one slide selected, an op naming no slide is pointed at it", () => {
  // "no index" is the same drift wearing a different shape, and with exactly
  // one slide selected there is no ambiguity about what was meant.
  const { ops, refused } = scopeOpsToSelection([{ op: "update_slide", patch: { headline: "x" } }], [3]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].index, 3);
  assert.deepEqual(refused, []);
});

test("with several slides selected, an op naming no slide is refused", () => {
  const { ops, refused } = scopeOpsToSelection([{ op: "update_slide", patch: {} }], [1, 2]);
  assert.deepEqual(ops, []);
  assert.equal(refused[0].index, null);
});

test("destructive and reordering ops are scoped too", () => {
  for (const op of ["delete_slide", "replace_slide", "duplicate_slide"]) {
    const { ops } = scopeOpsToSelection([{ op, index: 9 }], [0]);
    assert.deepEqual(ops, [], `${op} outside the selection must not run`);
  }
  const { ops: moved } = scopeOpsToSelection([{ op: "move_slide", from: 9, to: 0 }], [0]);
  assert.deepEqual(moved, [], "move_slide is scoped by its `from`");
});

test("additive and deck-level ops are never scoped", () => {
  // Adding a slide while a selection is active is a legitimate request, and
  // set_meta is about the deck rather than any slide.
  const given = [
    { op: "append_slide", slide: { type: "bullets" } },
    { op: "insert_slide", index: 2, slide: { type: "bullets" } },
    { op: "set_meta", title: "T" },
  ];
  const { ops, refused } = scopeOpsToSelection(given, [0]);
  assert.deepEqual(ops, given);
  assert.deepEqual(refused, []);
});

test("no selection means the whole deck, unchanged", () => {
  const given = [upd(0), upd(5), { op: "delete_slide", index: 9 }];
  for (const empty of [null, undefined, []]) {
    assert.deepEqual(scopeOpsToSelection(given, empty).ops, given);
  }
});
