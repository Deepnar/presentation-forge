
export function localFallbackArmed() {
  return process.env.FORGE_DEV_LOCAL_FALLBACK === "1";
}

const GATEWAY_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

const NETWORK_CODES = new Set([
  "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH",
]);

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

export function armedTimeout(configured) {
  const cap = 45_000;
  return localFallbackArmed() ? Math.min(configured, cap) : configured;
}
