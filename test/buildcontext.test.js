import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * What the Docker build context actually carries out of `config/`.
 *
 * The image runs with FORGE_CONFIG_DIR=/data/config, so nothing copied to
 * /app/config is ever read — which is exactly why this went unnoticed. An
 * image layer is still readable by anyone who pulls it, and `COPY config
 * ./config` was shipping the account database.
 *
 * The previous .dockerignore listed the state files to exclude by name, and
 * that list was written before accounts moved to SQLite: it named users.json
 * and sessions.json and knew nothing about forge.db, config/uploads or
 * config/identities. An allow-list of things to exclude goes stale every time
 * a subsystem adds a file, silently and on the unsafe side. The rule is now
 * deny-by-default, and this test is what keeps it that way — a .dockerignore
 * is otherwise never exercised by anything.
 *
 * The named-path cases matter more than the present-file ones: a clean
 * checkout has no forge.db, so a test that only walked the working tree would
 * pass while proving nothing.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Docker's ignore matching, as much of it as this check needs: patterns in
 * order with the last match winning, `!` for a re-include, and a path excluded
 * when it or any parent directory is excluded. That last part is why a bare
 * `config/uploads` entry hides the files beneath it.
 */
function patternToRegExp(pattern) {
  const parts = pattern.split("/");
  const rx = parts
    .map((part) => {
      if (part === "**") return "(?:[^/]+/)*[^/]+";
      return part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]");
    })
    .join("/");
  return new RegExp(`^${rx}$`);
}

function parseDockerignore(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const exception = line.startsWith("!");
      const body = exception ? line.slice(1).trim() : line;
      const clean = path.posix.normalize(body).replace(/\/+$/, "");
      return { exception, regex: patternToRegExp(clean), source: line };
    });
}

/** Every prefix of a path, so a parent-directory exclusion is seen. */
function selfAndParents(file) {
  const parts = file.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

function inBuildContext(patterns, file) {
  let excluded = false;
  for (const p of patterns) {
    // A re-include only counts against the file itself. Docker cannot resurrect
    // a file whose parent directory was excluded without a pattern reaching it,
    // and treating `!a/b.yaml` as un-excluding `a/` would make this check
    // report a leak-free context that docker build does not produce.
    const candidates = p.exception ? [file] : selfAndParents(file);
    if (candidates.some((c) => p.regex.test(c))) excluded = !p.exception;
  }
  return !excluded;
}

const patterns = parseDockerignore(await readFile(path.join(ROOT, ".dockerignore"), "utf8"));

test("the committed config templates reach the image", async () => {
  // The entrypoint seeds /data/config from /app/config/*.yaml on first boot, so
  // excluding these would leave a fresh volume with no models.yaml at all.
  const tracked = execFileSync("git", ["ls-files", "config"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  assert.ok(tracked.length > 0, "expected committed files under config/");
  for (const file of tracked) {
    assert.equal(inBuildContext(patterns, file), true, `${file} is committed but excluded from the build context`);
  }
});

test("no account, credential or user-content file under config/ reaches the image", () => {
  // Named rather than discovered: a clean checkout and CI have none of these on
  // disk, and those are the runs where a stale rule would go unreported.
  const mustNotShip = [
    "config/forge.db",
    "config/forge.db-wal",
    "config/forge.db-shm",
    "config/users.json",
    "config/sessions.json",
    "config/identity.yaml",
    "config/local.yaml",
    "config/hosted.json",
    "config/identities/0123456789abcdef.yaml",
    "config/uploads/a-users-private-paper.pdf",
    "config/presets/some-preset.json",
  ];
  for (const file of mustNotShip) {
    assert.equal(inBuildContext(patterns, file), false, `${file} would be copied into the image`);
  }
});

test("config/ is deny-by-default, so a new stateful file is excluded without an edit here", () => {
  // The property, not the instances: anything a later subsystem invents under
  // config/ must already be out. This is the half the old allow-list lacked.
  const invented = [
    "config/whatever-comes-next.json",
    "config/quotas.db",
    "config/tokens/refresh.json",
    "config/a/deeply/nested/secret",
  ];
  for (const file of invented) {
    assert.equal(inBuildContext(patterns, file), false, `${file} reached the image — config/ is no longer deny-by-default`);
  }
});

/**
 * The same question asked of git, because it is the same mistake twice.
 *
 * `.gitignore` listed `config/identity.yaml`, `brand/logos/` and
 * `brand/generated/` — the single-operator paths — and per-account storage
 * added `config/identities/` and `brand/users/<hash>/` underneath them, which
 * those entries do not reach: `brand/logos/` does not match
 * `brand/users/abc/logos/`. Both directories hold a real account's institution
 * and its crest, and both showed up as untracked the first time an account
 * saved anything.
 */
test("per-account state is ignored by git, not merely untracked so far", () => {
  const mustBeIgnored = [
    "config/identities/0123456789abcdef.yaml",
    "config/forge.db",
    "config/uploads/a-users-paper.pdf",
    "brand/users/0123456789abcdef/logos/crest.png",
    "brand/users/0123456789abcdef/generated/crest.png",
    "reference/users/0123456789abcdef/their-template.docx",
    "decks/some-slug/deck.yaml",
  ];
  for (const file of mustBeIgnored) {
    const res = spawnSync("git", ["check-ignore", "-q", file], { cwd: ROOT });
    assert.equal(res.status, 0, `${file} is not ignored by .gitignore — it would be committable`);
  }
});

test("the repo's own state directories stay out of the context", () => {
  for (const file of ["decks/some-slug/deck.yaml", ".env", "brand/logos/crest.png", "reference/institution.docx"]) {
    assert.equal(inBuildContext(patterns, file), false, `${file} would be copied into the image`);
  }
  // reference/.gitkeep is re-included so the volume mount point exists.
  assert.equal(inBuildContext(patterns, "reference/.gitkeep"), true);
});
