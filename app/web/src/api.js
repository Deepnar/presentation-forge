/** Tiny fetch wrapper. Every endpoint returns { ok, ... } or { ok:false, error }. */
async function call(url, options) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...authHeader() },
    ...options,
  });
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!body.ok) {
    const err = new Error(body.error ?? `HTTP ${res.status}`);
    err.errors = body.errors;
    err.status = res.status;
    throw err;
  }
  return body;
}

const TOKEN_KEY = "forge.token";

function authHeader() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function rememberToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Server-sent events over a POST body. Dispatches each frame to
 * `handlers[event]`; an `error` frame rejects the promise. Returns
 * `{ promise, abort }` so a long generation can be cancelled — the server
 * aborts the underlying model call when the socket closes.
 */
function stream(url, body, handlers = {}) {
  const ctrl = new AbortController();
  const promise = (async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error ?? `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) dispatch(frame);
      await pump();
    };
    const dispatch = (frame) => {
      const ev = parseFrame(frame);
      if (!ev) return;
      if (ev.event === "error") throw new Error(ev.data?.error ?? "generation failed");
      handlers[ev.event]?.(ev.data);
    };
    await pump();
    if (buffer.trim()) dispatch(buffer); // trailing partial frame
  })();
  return { promise, abort: () => ctrl.abort() };
}

function parseFrame(frame) {
  const event = frame.match(/^event:\s*(.+)$/m)?.[1];
  const data = frame.match(/^data:\s*(.*)$/m)?.[1];
  if (data == null) return null;
  let parsed = data;
  try { parsed = JSON.parse(data); } catch { /* keep raw */ }
  return { event, data: parsed };
}

export const api = {
  themes: () => call("/api/themes"),
  decks: () => call("/api/decks"),
  deck: (slug) => call(`/api/decks/${slug}`),
  saveDeck: (slug, deck, meta) =>
    call(`/api/decks/${slug}`, { method: "PUT", body: JSON.stringify({ deck, meta }) }),
  deleteDeck: (slug) => call(`/api/decks/${slug}`, { method: "DELETE" }),
  validateDeck: (deck) =>
    call("/api/validate", { method: "POST", body: JSON.stringify({ deck }) }),
  renderDeck: (slug, opts = {}) =>
    call(`/api/decks/${slug}/render`, { method: "POST", body: JSON.stringify(opts) }),
  // Content-density sweep: rewrite content at sparse/balanced/dense, keeping
  // structure and presenters. SSE like generation — one call per slide.
  sweepDensity: (slug, opts, handlers) =>
    stream(`/api/decks/${slug}/sweep`, opts, handlers),
  identity: () => call("/api/identity"),
  saveIdentity: (identity) =>
    call("/api/identity", { method: "PUT", body: JSON.stringify({ identity }) }),
  types: () => call("/api/types"),
  styles: () => call("/api/styles"),
  templates: () => call("/api/templates"),
  // The type-swap gallery: one rendered preview per slide type in a theme.
  typeSpecimens: (theme) => call(`/api/types/${encodeURIComponent(theme || "default")}/specimens`),
  // Change one slide's type — remap when compatible, model rewrite otherwise.
  convertSlide: (slug, index, payload, handlers) =>
    stream(`/api/decks/${slug}/slides/${index}/convert`, payload, handlers),
  // Deck image upload — lands in decks/<slug>/assets/ (gitignored).
  uploadDeckImage: (slug, file) => {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return fetch(`/api/decks/${slug}/assets`, {
      method: "POST",
      headers: { "X-File-Ext": ext, "Content-Type": "application/octet-stream", ...authHeader() },
      body: file,
    }).then(async (res) => {
      const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    });
  },
  // Upload-only research mode: stage the briefing document (md/txt/docx/pdf)
  // so it becomes the only content source. Returns { token, name, words }.
  stageBriefingUpload: (file) => {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return fetch("/api/briefing/upload", {
      method: "POST",
      headers: { "X-File-Ext": ext, "X-File-Name": encodeURIComponent(file.name), "Content-Type": "application/octet-stream", ...authHeader() },
      body: file,
    }).then(async (res) => {
      const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    });
  },
  createDeck: (payload, handlers) => stream("/api/decks", payload, handlers),
  generate: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/generate`, payload, handlers),
  // Resume a dropped generation from its checkpoint — reconnects to a live run
  // when one exists, otherwise continues writing the remaining slides.
  resumeGenerate: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/generate/resume`, payload, handlers),
  // Finalize watchdog: run the post-write pass on a complete-but-unfinalised
  // deck and flip it to ready, instead of re-writing slides.
  finalizeDeck: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/finalize`, payload, handlers),
  stopGenerate: (slug) =>
    call(`/api/decks/${slug}/generate/stop`, { method: "POST", body: JSON.stringify({}) }),
  models: () => call("/api/models"),
  chatThread: (slug) => call(`/api/decks/${slug}/chat`),
  clearChat: (slug) => call(`/api/decks/${slug}/chat`, { method: "DELETE" }),
  chatDeck: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/chat`, payload, handlers),
  // README, served as plain text so the docs modal needs no markdown dependency.
  docs: () =>
    fetch("/api/docs").then((r) =>
      r.ok ? r.text() : Promise.reject(new Error("docs unavailable"))),
  report: (slug) => call(`/api/decks/${slug}/report`),
  // The deck's research — the panel's view/edit surface over notes.md +
  // sources.json. `exists: false` means no research pass ran yet.
  research: (slug) => call(`/api/decks/${slug}/research`),
  saveResearch: (slug, { notes, sources }) =>
    call(`/api/decks/${slug}/research`, { method: "PUT", body: JSON.stringify({ notes, sources }) }),
  renderReport: (slug, opts = {}) =>
    call(`/api/decks/${slug}/report/render`, { method: "POST", body: JSON.stringify(opts) }),
  generateReport: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/report/generate`, payload, handlers),
  // Standalone report — brief → report.yaml → .docx with no deck. And the
  // reverse flow: a report.yaml plans a companion deck (SSE, lands in Outline).
  createReport: (payload, handlers) => stream("/api/reports", payload, handlers),
  planDeckFromReport: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/report/deck`, payload, handlers),
  // Opt-in cloud backend (Settings/Cloud). The key itself never travels back
  // to the browser — status and test results are booleans and strings.
  cloud: () => call("/api/cloud"),
  cloudSaveKey: (key) => call("/api/cloud/key", { method: "PUT", body: JSON.stringify({ key }) }),
  cloudClearKey: () => call("/api/cloud/key", { method: "DELETE" }),
  cloudTest: () => call("/api/cloud/test", { method: "POST", body: JSON.stringify({}) }),
  // AUTO/CLOUD routing preference — auto is TCET campus gateway (free, rate-limited).
  cloudRoute: (route) => call("/api/cloud/routing", { method: "PUT", body: JSON.stringify({ route }) }),
  autoStatus: () => call("/api/auto/status"),
  autoTest: () => call("/api/auto/test", { method: "POST", body: JSON.stringify({}) }),
  autoUsage: () => call("/api/auto/usage"),
  // Per-user BYOK vault — encrypted at rest
  keysStatus: () => call("/api/keys/status"),
  keysSave: (key, provider) => call("/api/keys", { method: "PUT", body: JSON.stringify({ key, provider }) }),
  keysClear: () => call("/api/keys", { method: "DELETE" }),
  googleLogin: (credential) => call("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) }).then((r) => { rememberToken(r.token); return r.user; }),
  // Brand assets — institutional marks live in gitignored brand/logos/; the
  // server writes uploads there and re-runs normalisation. Never in the repo.
  brand: () => call("/api/brand"),
  brandUpload: (name, file) => {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return fetch(`/api/brand/${name}`, {
      method: "POST",
      headers: { "X-File-Ext": ext, "Content-Type": file.type || "application/octet-stream", ...authHeader() },
      body: file,
    }).then(async (res) => {
      const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    });
  },
  brandRemove: (name) => call(`/api/brand/${name}`, { method: "DELETE" }),
  // Local single-install accounts. The token is the only credential the browser
  // holds; the password is never stored or returned. Registering never logs in:
  // the new account is created and the visitor signs in with it explicitly.
  register: (payload) =>
    call("/api/auth/register", { method: "POST", body: JSON.stringify(payload) })
      .then((r) => r.user),
  login: (payload) =>
    call("/api/auth/login", { method: "POST", body: JSON.stringify(payload) })
      .then((r) => { rememberToken(r.token); return r.user; }),
  registrationOpen: () => call("/api/auth/registration").then((r) => r.open === true),
  logout: () =>
    call("/api/auth/logout", { method: "POST", body: JSON.stringify({}) })
      .finally(clearToken),
  me: () => call("/api/auth/me"),
  // The deck's speaker script — what each presenter says aloud per slide,
  // written to decks/<slug>/script.md. SSE like the sweep; `index` regens one
  // slide.
  script: (slug) => call(`/api/decks/${slug}/script`),
  generateScript: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/script`, payload, handlers),
  // Deck export (pdf/markdown), cloning, sharing bundles and version history.
  exportDeck: (slug, format, theme) =>
    call(`/api/decks/${slug}/export`, { method: "POST", body: JSON.stringify({ format, theme }) }),
  cloneDeck: (slug) => call(`/api/decks/${slug}/clone`, { method: "POST", body: JSON.stringify({}) }),
  bundleUrl: (slug) => `/api/decks/${slug}/bundle`,
  downloadBundle: (slug) => fetch(`/api/decks/${slug}/bundle`, { method: "POST" }),
  versions: (slug) => call(`/api/decks/${slug}/versions`),
  restoreVersion: (slug, file) =>
    call(`/api/decks/${slug}/versions/${encodeURIComponent(file)}/restore`, { method: "POST", body: JSON.stringify({}) }),
  searchDecks: (q) => call("/api/decks/search", { method: "POST", body: JSON.stringify({ q }) }),
  // Saved briefing formats — the reusable half of a briefing, per user.
  presets: () => call("/api/presets"),
  savePreset: (preset) => call("/api/presets", { method: "POST", body: JSON.stringify(preset) }),
  updatePreset: (id, preset) => call(`/api/presets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(preset) }),
  deletePreset: (id) => call(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
