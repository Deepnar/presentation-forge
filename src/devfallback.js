/**
 * A DEVELOPMENT-ONLY escape hatch, and deliberately not a product feature.
 *
 * The TCET gateway goes down in a shape that looks like health: `/v1/models`
 * answers in under a second while `/v1/chat/completions` hangs and Cloudflare
 * eventually returns 524. While it is down, nothing in the app can be exercised
 * end to end — not resume, not research reaching the page, not the report
 * render — because every one of those needs a completion to come back.
 *
 * When armed, this lets a run finish on the local Ollama instead, so the
 * PIPELINE stays testable. It never makes the output worth judging: a deck that
 * reads well on a local model and badly through the gateway is a deck that
 * reads badly, because nobody hosted is running the local one. `AGENTS.md`
 * states that rule and this module does not soften it.
 *
 * Three properties keep it out of the product:
 *
 * 1. **Environment only.** Not `config/`, not an admin toggle, not a setting.
 *    Anything under `config/` is runtime-flippable and survives a redeploy;
 *    an env var takes shell access to the server process, which the people a
 *    hosted box serves do not have.
 * 2. **Off unless explicitly armed.** The default everywhere — production,
 *    tests, a fresh clone — is the documented hosted behaviour: Auto is the
 *    gateway only, and a dead gateway is an error.
 * 3. **Never silent.** Arming it warns at boot, and every response it rescues
 *    carries `devLocalFallback` so a caller cannot mistake a test result for a
 *    product one.
 */

/**
 * Whether the local fallback is armed. `FORGE_DEV_LOCAL_FALLBACK=1`, read per
 * call rather than captured at import: a module-level const reading the
 * environment defeats the seam a test uses to set it, which is exactly how
 * `src/db.js`'s test seam came to have never once worked.
 */
export function localFallbackArmed() {
  return process.env.FORGE_DEV_LOCAL_FALLBACK === "1";
}

/** Cloudflare's origin-unreachable range, plus the ordinary gateway 5xx. */
const GATEWAY_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

/** Node's fetch reports connection failures on `err.cause.code`. */
const NETWORK_CODES = new Set([
  "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH",
]);

/**
 * Whether an error is the gateway being unreachable rather than the request
 * being wrong. A 400 or a 401 is a bug or a bad key and must keep failing —
 * falling back on those would hide the very thing the operator needs to see.
 *
 * The caller filters its own aborts before asking, so an AbortError here is the
 * request timing out, which is the gateway's actual failure mode today.
 */
export function isGatewayUnreachable(err) {
  if (!err) return false;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;

  for (let e = err; e; e = e.cause) {
    if (e.code && NETWORK_CODES.has(e.code)) return true;
  }

  const status = /^Cloud (\d{3})\b/.exec(err.message ?? "");
  if (status && GATEWAY_STATUS.has(Number(status[1]))) return true;

  return false;
}

/**
 * How long to let a gateway request hang before trying local. The normal
 * timeout is five minutes and the transport retries twice, so an unarmed run
 * against a dead gateway is a fifteen-minute wait — acceptable when the error
 * is the answer, useless when the point is to exercise something behind it.
 */
export function armedTimeout(configured) {
  const cap = 45_000;
  return localFallbackArmed() ? Math.min(configured, cap) : configured;
}
