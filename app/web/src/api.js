/** Tiny fetch wrapper. Every endpoint returns { ok, ... } or { ok:false, error }. */
async function call(url, options) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!body.ok) {
    const err = new Error(body.error ?? `HTTP ${res.status}`);
    err.errors = body.errors;
    throw err;
  }
  return body;
}

export const api = {
  themes: () => call("/api/themes"),
  decks: () => call("/api/decks"),
  deck: (slug) => call(`/api/decks/${slug}`),
  saveDeck: (slug, deck, meta) =>
    call(`/api/decks/${slug}`, { method: "PUT", body: JSON.stringify({ deck, meta }) }),
  renderDeck: (slug, opts = {}) =>
    call(`/api/decks/${slug}/render`, { method: "POST", body: JSON.stringify(opts) }),
  identity: () => call("/api/identity"),
  saveIdentity: (identity) =>
    call("/api/identity", { method: "PUT", body: JSON.stringify({ identity }) }),
};
