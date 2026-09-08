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
    err.code = body.code ?? null;
    err.token = body.token ?? null;
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
  landing: () =>
    fetch("/api/landing/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  decks: () => call("/api/decks"),
  deck: (slug) => call(`/api/decks/${slug}`),
  saveDeck: (slug, deck, meta) =>
    call(`/api/decks/${slug}`, { method: "PUT", body: JSON.stringify({ deck, meta }) }),
  deleteDeck: (slug) => call(`/api/decks/${slug}`, { method: "DELETE" }),
  adminClearUsage: (email) => call(`/api/admin/users/${encodeURIComponent(email)}/usage`, { method: "DELETE" }),
  adminSetSetting: (name, value) => call(`/api/admin/settings/${name}`, { method: "PUT", body: JSON.stringify({ value }) }),
  adminAutoKey: () => call("/api/admin/auto/key"),
  adminSetAutoKey: (key) => call("/api/admin/auto/key", { method: "PUT", body: JSON.stringify({ key }) }),
  adminClearAutoKey: () => call("/api/admin/auto/key", { method: "DELETE" }),
  adminCleanupPreview: (criteria) => call("/api/admin/users/cleanup/preview", { method: "POST", body: JSON.stringify(criteria ?? {}) }),
  adminCleanupRun: (body) => call("/api/admin/users/cleanup", { method: "POST", body: JSON.stringify(body) }),
  validateDeck: (deck) =>
    call("/api/validate", { method: "POST", body: JSON.stringify({ deck }) }),
  renderDeck: (slug, opts = {}) =>
    call(`/api/decks/${slug}/render`, { method: "POST", body: JSON.stringify(opts) }),
  sweepDensity: (slug, opts, handlers) =>
    stream(`/api/decks/${slug}/sweep`, opts, handlers),
  identity: () => call("/api/identity"),
  saveIdentity: (identity) =>
    call("/api/identity", { method: "PUT", body: JSON.stringify({ identity }) }),
  types: () => call("/api/types"),
  styles: () => call("/api/styles"),
  templates: () => call("/api/templates"),
  typeSpecimens: (theme) => call(`/api/types/${encodeURIComponent(theme || "default")}/specimens`),
  convertSlide: (slug, index, payload, handlers) =>
    stream(`/api/decks/${slug}/slides/${index}/convert`, payload, handlers),
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
  resumeGenerate: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/generate/resume`, payload, handlers),
  finalizeDeck: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/finalize`, payload, handlers),
  stopGenerate: (slug) =>
    call(`/api/decks/${slug}/generate/stop`, { method: "POST", body: JSON.stringify({}) }),
  models: () => call("/api/models"),
  chatThread: (slug) => call(`/api/decks/${slug}/chat`),
  clearChat: (slug) => call(`/api/decks/${slug}/chat`, { method: "DELETE" }),
  chatDeck: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/chat`, payload, handlers),
  policy: () => call("/api/policy"),
  docs: () =>
    fetch("/api/docs").then((r) =>
      r.ok ? r.text() : Promise.reject(new Error("docs unavailable"))),
  report: (slug) => call(`/api/decks/${slug}/report`),
  research: (slug) => call(`/api/decks/${slug}/research`),
  saveResearch: (slug, { notes, sources }) =>
    call(`/api/decks/${slug}/research`, { method: "PUT", body: JSON.stringify({ notes, sources }) }),
  renderReport: (slug, opts = {}) =>
    call(`/api/decks/${slug}/report/render`, { method: "POST", body: JSON.stringify(opts) }),
  reportPreview: (slug) =>
    call(`/api/decks/${slug}/report/preview`, { method: "POST", body: JSON.stringify({}) }),
  generateReport: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/report/generate`, payload, handlers),
  createReport: (payload, handlers) => stream("/api/reports", payload, handlers),
  planDeckFromReport: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/report/deck`, payload, handlers),
  cloud: () => call("/api/cloud"),
  cloudSaveKey: (key) => call("/api/cloud/key", { method: "PUT", body: JSON.stringify({ key }) }),
  cloudClearKey: () => call("/api/cloud/key", { method: "DELETE" }),
  cloudTest: () => call("/api/cloud/test", { method: "POST", body: JSON.stringify({}) }),
  cloudBudget: (dailyTokens) => call("/api/cloud/budget", { method: "PUT", body: JSON.stringify({ dailyTokens }) }),
  cloudRoute: (route) => call("/api/cloud/routing", { method: "PUT", body: JSON.stringify({ route }) }),
  autoStatus: () => call("/api/auto/status"),
  autoTest: () => call("/api/auto/test", { method: "POST", body: JSON.stringify({}) }),
  autoUsage: () => call("/api/auto/usage"),
  keysStatus: () => call("/api/keys/status"),
  keysSave: (key, provider, acceptCosts) => call("/api/keys", { method: "PUT", body: JSON.stringify({ key, provider, acceptCosts }) }),
  keysClear: () => call("/api/keys", { method: "DELETE" }),
  googleLogin: (credential) => call("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) }).then((r) => { rememberToken(r.token); return r.user; }),
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
  donor: () => call("/api/donor"),
  donorUpload: (file) =>
    fetch("/api/donor", {
      method: "POST",
      headers: {
        "X-File-Name": encodeURIComponent(file.name),
        "Content-Type": file.type || "application/octet-stream",
        ...authHeader(),
      },
      body: file,
    }).then(async (res) => {
      const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    }),
  donorRemove: () => call("/api/donor", { method: "DELETE" }),
  register: (payload) =>
    call("/api/auth/register", { method: "POST", body: JSON.stringify(payload) })
      .then((r) => {
        if (r.token) rememberToken(r.token);
        return { ...r.user, verifySent: r.verifySent === true, localOwner: r.localOwner === true };
      }),
  login: (payload) =>
    call("/api/auth/login", { method: "POST", body: JSON.stringify(payload) })
      .then((r) => { rememberToken(r.token); return r.user; }),
  authConfig: () =>
    call("/api/auth/registration").catch(() => ({ open: true, mail: false, verifyRequired: false })),
  forgotPassword: (email) =>
    call("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token, password) =>
    call("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) }),
  verifyEmail: (token) =>
    call("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: () =>
    call("/api/auth/verify/resend", { method: "POST", body: JSON.stringify({}) }),
  logout: () =>
    call("/api/auth/logout", { method: "POST", body: JSON.stringify({}) })
      .finally(clearToken),
  me: () => call("/api/auth/me"),
  script: (slug) => call(`/api/decks/${slug}/script`),
  generateScript: (slug, payload, handlers) =>
    stream(`/api/decks/${slug}/script`, payload, handlers),
  exportDeck: (slug, format, theme) =>
    call(`/api/decks/${slug}/export`, { method: "POST", body: JSON.stringify({ format, theme }) }),
  cloneDeck: (slug) => call(`/api/decks/${slug}/clone`, { method: "POST", body: JSON.stringify({}) }),
  bundleUrl: (slug) => `/api/decks/${slug}/bundle`,
  downloadBundle: (slug) =>
    fetch(`/api/decks/${slug}/bundle`, { method: "POST", headers: { ...authHeader() } }),
  versions: (slug) => call(`/api/decks/${slug}/versions`),
  restoreVersion: (slug, file) =>
    call(`/api/decks/${slug}/versions/${encodeURIComponent(file)}/restore`, { method: "POST", body: JSON.stringify({}) }),
  searchDecks: (q) => call("/api/decks/search", { method: "POST", body: JSON.stringify({ q }) }),
  project: (slug) => call(`/api/decks/${slug}/project`),
  presets: () => call("/api/presets"),
  savePreset: (preset) => call("/api/presets", { method: "POST", body: JSON.stringify(preset) }),
  updatePreset: (id, preset) => call(`/api/presets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(preset) }),
  deletePreset: (id) => call(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminStats: () => call("/api/admin/stats"),
  adminUsers: () => call("/api/admin/users"),
  adminSetRole: (email, role) => call(`/api/admin/users/${encodeURIComponent(email)}/role`, { method: "POST", body: JSON.stringify({ role }) }),
  adminDeleteUser: (email) => call(`/api/admin/users/${encodeURIComponent(email)}`, { method: "DELETE" }),
  adminDecks: () => call("/api/admin/decks"),
  adminHosted: () => call("/api/admin/hosted"),
  adminDonor: () => call("/api/admin/donor"),
  adminDonorUpload: (file) =>
    fetch("/api/admin/donor", {
      method: "POST",
      headers: {
        "X-File-Name": encodeURIComponent(file.name),
        "Content-Type": file.type || "application/octet-stream",
        ...authHeader(),
      },
      body: file,
    }).then(async (res) => {
      const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    }),
  adminSetHosted: (hosted) => call("/api/admin/hosted", { method: "POST", body: JSON.stringify({ hosted }) }),
};
