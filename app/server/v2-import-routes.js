import { importGeneratedProject } from "../../src/projects/import-generated.js";
import { verificationRequired } from "../../src/auth.js";
import { projectsAllowed } from "./v2-projects-routes.js";
import { resolveUser } from "./auth-routes.js";
import { ok, fail, wrap } from "./http.js";

export function registerV2ImportRoutes(app) {
  app.post("/api/decks/:slug/v2-project", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    const principal = req.user ?? await resolveUser(req);
    if (!principal) return fail(res, 401, "log in to import a source deck");
    if (!principal.verified && verificationRequired()) return fail(res, 403, "confirm your email before importing");
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["requestId", "mode"].includes(key))) {
      return fail(res, 400, "body must contain requestId and optionally mode");
    }
    try {
      ok(res, await importGeneratedProject({ slug: req.params.slug, requestId: body.requestId, mode: body.mode, principal }));
    } catch (error) {
      const status = {
        unauthorized: 401, "email-unverified": 403, "not-found": 404, "bad-import-request": 400,
        "source-incomplete": 409, "source-changed": 409, "import-source-changed": 409,
        "import-target-deleted": 410, "invalid-source": 422, "unsupported-content": 422,
        "bad-theme": 422, "bad-style": 422, "bad-mode": 422, "bad-intent": 422, "invalid-document": 422,
        "storage-unavailable": 503, "store-misconfigured": 503,
      }[error.code] ?? 500;
      res.status(status).json({ ok: false, code: error.code ?? "import-failed", error: status === 500 ? "project import failed" : error.message, errors: error.details ?? [] });
    }
  }));
}
