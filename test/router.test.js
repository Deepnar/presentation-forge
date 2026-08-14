import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, hashFor } from "../app/web/src/lib/router.js";

test("parseHash resolves every supported view route", () => {
  assert.deepEqual(parseHash("#/chat"), { view: "chat", chatId: null });
  assert.deepEqual(parseHash("#/chat/abc-123"), { view: "chat", chatId: "abc-123" });
  assert.deepEqual(parseHash("#/deck/some-deck"), { view: "deck", slug: "some-deck" });
  assert.deepEqual(parseHash("#/report/some-deck"), { view: "report", slug: "some-deck" });
  assert.deepEqual(parseHash("#/research/some-deck"), { view: "research", slug: "some-deck" });
  assert.deepEqual(parseHash("#/themes"), { view: "themes" });
  assert.deepEqual(parseHash("#/identity"), { view: "identity" });
  assert.deepEqual(parseHash("#/home"), { view: "home" });
});

test("parseHash tolerates an empty or malformed hash by landing on chat", () => {
  assert.deepEqual(parseHash(""), { view: "chat" });
  assert.deepEqual(parseHash("#"), { view: "chat" });
  assert.deepEqual(parseHash("#/"), { view: "chat" });
  assert.deepEqual(parseHash("#/deck"), { view: "chat" }); // no slug — meaningless
  assert.deepEqual(parseHash("#/unknown"), { view: "chat" });
  assert.deepEqual(parseHash("garbage"), { view: "chat" });
});

test("hashFor builds the URL for a view + target", () => {
  assert.equal(hashFor("chat"), "#/chat");
  assert.equal(hashFor("chat", { chatId: "abc" }), "#/chat/abc");
  assert.equal(hashFor("deck", { slug: "x" }), "#/deck/x");
  assert.equal(hashFor("report", { slug: "x" }), "#/report/x");
  assert.equal(hashFor("research", { slug: "x" }), "#/research/x");
  assert.equal(hashFor("themes"), "#/themes");
  assert.equal(hashFor("identity"), "#/identity");
  assert.equal(hashFor("home"), "#/home");
});

test("hashFor refuses an artefact view without a slug", () => {
  assert.equal(hashFor("deck"), "#/chat");
  assert.equal(hashFor("report", {}), "#/chat");
});

test("hashFor and parseHash round-trip every route", () => {
  const routes = [
    { view: "chat", opts: { chatId: "c-1" } },
    { view: "deck", opts: { slug: "d-1" } },
    { view: "report", opts: { slug: "r-1" } },
    { view: "research", opts: { slug: "x-1" } },
    { view: "themes" },
    { view: "identity" },
    { view: "home" },
  ];
  for (const { view, opts } of routes) {
    assert.equal(parseHash(hashFor(view, opts)).view, view);
  }
});
