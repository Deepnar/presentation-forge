import { test } from "node:test";
import assert from "node:assert/strict";
import { localFallbackArmed, isGatewayUnreachable, armedTimeout } from "../src/devfallback.js";

/**
 * The development-only local fallback.
 *
 * Two properties matter more than the feature itself. It must be OFF unless
 * explicitly armed, because a hosted box that quietly answers from a local
 * model serves the wrong quality to real users under the product's name. And
 * it must fire only when the gateway is UNREACHABLE — a 401 or a 400 is a bad
 * key or a bad request, and falling back on those hides the one thing the
 * operator needs to see.
 */

function withEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, "FORGE_DEV_LOCAL_FALLBACK");
  const prev = process.env.FORGE_DEV_LOCAL_FALLBACK;
  if (value === null) delete process.env.FORGE_DEV_LOCAL_FALLBACK;
  else process.env.FORGE_DEV_LOCAL_FALLBACK = value;
  try {
    return fn();
  } finally {
    if (had) process.env.FORGE_DEV_LOCAL_FALLBACK = prev;
    else delete process.env.FORGE_DEV_LOCAL_FALLBACK;
  }
}

test("the fallback is off unless explicitly armed", () => {
  assert.equal(withEnv(null, localFallbackArmed), false);
  assert.equal(withEnv("", localFallbackArmed), false);
  assert.equal(withEnv("0", localFallbackArmed), false);
  // Not "truthy wins": only the exact opt-in arms it, so a stray value left in
  // a deployment environment cannot switch a hosted box onto local models.
  assert.equal(withEnv("true", localFallbackArmed), false);
  assert.equal(withEnv("yes", localFallbackArmed), false);
  assert.equal(withEnv("1", localFallbackArmed), true);
});

test("a hanging request counts as unreachable", () => {
  // The gateway's actual failure mode: the transport's own timeout aborts.
  const abort = new Error("The operation was aborted");
  abort.name = "AbortError";
  assert.equal(isGatewayUnreachable(abort), true);

  const timeoutErr = new Error("timed out");
  timeoutErr.name = "TimeoutError";
  assert.equal(isGatewayUnreachable(timeoutErr), true);
});

test("Cloudflare's origin-unreachable statuses count, and 524 above all", () => {
  for (const status of [502, 503, 504, 520, 522, 524, 530]) {
    assert.equal(
      isGatewayUnreachable(new Error(`Cloud ${status}: <html>error</html>`)),
      true,
      `HTTP ${status} is the gateway being down`,
    );
  }
});

test("a rejected or malformed request never falls back", () => {
  // These are the ones that must keep failing: falling back would turn a bad
  // key or a bad payload into a quietly-degraded run nobody investigates.
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500]) {
    assert.equal(
      isGatewayUnreachable(new Error(`Cloud ${status}: nope`)),
      false,
      `HTTP ${status} is the request being wrong, not the gateway being down`,
    );
  }
  assert.equal(isGatewayUnreachable(new Error("Unexpected token < in JSON")), false);
  assert.equal(isGatewayUnreachable(null), false);
});

test("a refused connection counts, including when wrapped by fetch", () => {
  const bare = new Error("connect ECONNREFUSED");
  bare.code = "ECONNREFUSED";
  assert.equal(isGatewayUnreachable(bare), true);

  // Node's fetch reports the real cause one level down.
  const wrapped = new TypeError("fetch failed");
  wrapped.cause = bare;
  assert.equal(isGatewayUnreachable(wrapped), true);

  const dns = new TypeError("fetch failed");
  dns.cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
  assert.equal(isGatewayUnreachable(dns), true);
});

test("arming shortens the wait; unarmed keeps the configured timeout exactly", () => {
  // Unarmed, a dead gateway should take as long as it takes — the error is the
  // answer, and shortening it would change production behaviour.
  assert.equal(withEnv(null, () => armedTimeout(300_000)), 300_000);
  // Armed, three attempts at five minutes each is fifteen minutes before the
  // fallback that was the point of arming it.
  assert.equal(withEnv("1", () => armedTimeout(300_000)), 45_000);
  // A configured timeout already below the cap is never lengthened.
  assert.equal(withEnv("1", () => armedTimeout(10_000)), 10_000);
});
