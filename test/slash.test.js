import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlashCommand, SLASH_HELP, looksLikeSlash } from "../app/web/src/lib/slash.js";

test("parseSlashCommand extracts command and argument", () => {
  assert.deepEqual(parseSlashCommand("/theme swiss-international"), { command: "theme", arg: "swiss-international", rest: "" });
  assert.deepEqual(parseSlashCommand("/density dense"), { command: "density", arg: "dense", rest: "" });
  assert.deepEqual(parseSlashCommand("/slides 16"), { command: "slides", arg: "16", rest: "" });
});

test("parseSlashCommand is case-insensitive on the command", () => {
  assert.equal(parseSlashCommand("/Theme Dark-Neon").command, "theme");
});

test("parseSlashCommand returns the trailing text as `rest`", () => {
  const r = parseSlashCommand("/slides 16\nand keep it punchy");
  assert.equal(r.command, "slides");
  assert.equal(r.arg, "16");
  assert.equal(r.rest, "and keep it punchy");
});

test("a plain message is not a slash command", () => {
  assert.equal(parseSlashCommand("make slide 2 punchier"), null);
  assert.equal(parseSlashCommand(""), null);
});

test("looksLikeSlash distinguishes a stray slash from a command", () => {
  assert.equal(looksLikeSlash("/"), true);
  assert.equal(looksLikeSlash("/banana"), true);
  assert.equal(looksLikeSlash("hello"), false);
});

test("SLASH_HELP lists every command", () => {
  for (const cmd of ["theme", "density", "report", "papers", "slides", "help"]) {
    assert.ok(SLASH_HELP.includes(`/${cmd}`), `${cmd} in help`);
  }
});
