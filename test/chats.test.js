import { test } from "node:test";
import assert from "node:assert/strict";
import { findEmptyChat, chatsKey, createChat } from "../app/web/src/lib/chats.js";

const empty = () => createChat({ kind: "deck" });

test("findEmptyChat returns the reusable empty chat of the same kind", () => {
  const a = empty();
  const b = empty();
  assert.equal(findEmptyChat([a, b], "deck"), a);
});

test("findEmptyChat ignores chats that have a topic, a produced deck, or a different kind", () => {
  const fresh = empty();
  const withTopic = { ...empty(), topic: "Solar power" };
  const produced = { ...empty(), produced: true, deckSlug: "x" };
  const report = createChat({ kind: "report" });
  assert.equal(findEmptyChat([withTopic, produced, report], "deck"), null);
  assert.equal(findEmptyChat([withTopic, produced, report, fresh], "deck"), fresh);
  assert.equal(findEmptyChat([fresh], "report"), null, "a deck chat is not a reusable report chat");
});

test("findEmptyChat handles an empty or malformed list", () => {
  assert.equal(findEmptyChat([], "deck"), null);
  assert.equal(findEmptyChat(null, "deck"), null);
});

test("chatsKey is per-account and case-insensitive", () => {
  assert.equal(chatsKey("A@B.com"), chatsKey("a@b.com"));
  assert.match(chatsKey("a@b.com"), /forge\.chats\.a@b\.com/);
});
