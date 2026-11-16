// A project's written documents (F7): generate its report, list what it
// has, download one as .docx, remove one. The work is
// src/projects/report.js; this only carries it. Generation spends model
// budget, so it runs under the same reservation and BYOK accounting as a
// deck's report and streams its progress the same way.
import { fail, ok, wrap } from "./http.js";
import { resolveUser } from "./auth-routes.js";
import { getUserId, verificationRequired } from "../../src/auth.js";
import { withByokRun } from "../../src/byok-budget.js";
import { estimateTokens } from "../../src/usage.js";
import { projectStore } from "../../src/projects/backend.js";
import { validProjectId } from "../../packages/projects/document.js";
import { projectsAllowed, resolveProjectOwner } from "./v2-projects-routes.js";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function registerV2DocumentRoutes(app, { startSSE, isAutoRoute, reserveAutoOrThrow, settleRequest }) {
  const gate = async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host"), null;
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id"), null;
    const who = await resolveProjectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects"), null;
    return who;
  };

  app.get("/api/v2/projects/:id/documents", wrap(async (req, res) => {
    const who = await gate(req, res);
    if (!who) return;
    const { documents } = await (await projectStore()).listProjectDocuments({ owner: who.owner, admin: who.admin, id: req.params.id });
    if (!documents) return fail(res, 404, "no such project");
    ok(res, { documents });
  }));

  app.get("/api/v2/projects/:id/documents/:documentId", wrap(async (req, res) => {
    const who = await gate(req, res);
    if (!who) return;
    const { document } = await (await projectStore()).getProjectDocument({ owner: who.owner, admin: who.admin, id: req.params.id, documentId: String(req.params.documentId) });
    if (!document) return fail(res, 404, "no such document");
    ok(res, { document });
  }));

  // Chosen report sections compiled as slides for the editor to insert —
  // src/projects/report-slides.js; nothing is written to the deck here.
  app.post("/api/v2/projects/:id/documents/:documentId/slides", wrap(async (req, res) => {
    const who = await gate(req, res);
    if (!who) return;
    const { sections, index = 0, total = null } = req.body ?? {};
    if (!Array.isArray(sections) || !sections.length || sections.length > 20 || sections.some((n) => typeof n !== "string")) return fail(res, 422, "choose up to 20 sections");
    if (!Number.isInteger(index) || index < 0 || (total !== null && (!Number.isInteger(total) || total < index))) return fail(res, 422, "index and total must be slide positions");
    const { reportSlides } = await import("../../src/projects/report-slides.js");
    try {
      ok(res, { scenes: await reportSlides({ owner: who.owner, admin: who.admin, id: req.params.id, documentId: String(req.params.documentId), sections, index, total }) });
    } catch (err) {
      if (err?.code === "not-found") return fail(res, 404, err.message);
      if (err?.code === "empty") return fail(res, 422, err.message);
      throw err;
    }
  }));

  app.get("/api/v2/projects/:id/documents/:documentId/docx", wrap(async (req, res) => {
    const who = await gate(req, res);
    if (!who) return;
    const { renderProjectReport } = await import("../../src/projects/report.js");
    try {
      const out = await renderProjectReport({ owner: who.owner, admin: who.admin, id: req.params.id, documentId: String(req.params.documentId) });
      const name = `${String(out.title).replace(/[^\w .-]+/g, "").trim().slice(0, 80) || "report"}.docx`;
      res.set("Content-Type", DOCX);
      res.set("Content-Disposition", `attachment; filename="${name}"`);
      res.set("Cache-Control", "private, no-store");
      res.send(Buffer.from(out.bytes));
    } catch (err) {
      if (err?.code === "not-found") return fail(res, 404, err.message);
      if (err?.code === "no-donor") return fail(res, 409, err.message);
      throw err;
    }
  }));

  app.delete("/api/v2/projects/:id/documents/:documentId", wrap(async (req, res) => {
    const who = await gate(req, res);
    if (!who) return;
    const { removed } = await (await projectStore()).deleteProjectDocument({ owner: who.owner, admin: who.admin, id: req.params.id, documentId: String(req.params.documentId) });
    if (!removed) return fail(res, 404, "no such document");
    ok(res, {});
  }));

  // The speaker script, one slide at a time as each is written; the editor
  // puts the words into the slides' notes. `scenes` is the deck as the
  // editor has it, so unsaved edits are what the script speaks to.
  app.post("/api/v2/projects/:id/script", async (req, res) => {
    const who = await gate(req, res);
    if (!who) return;
    const user = await resolveUser(req, { allowCookie: false }).catch(() => null);
    if (user && !user.verified && verificationRequired()) return fail(res, 403, "confirm your email before writing a script");
    const { scenes = null, overwrite = false, model } = req.body ?? {};
    if (scenes !== null && (!Array.isArray(scenes) || scenes.length > 200 || scenes.some((sc) => !sc || typeof sc.id !== "string" || !Array.isArray(sc.elements)))) {
      return fail(res, 422, "scenes must be the project's slides");
    }
    const sse = startSSE(res);
    const ctrl = new AbortController();
    sse.done.catch(() => ctrl.abort());
    const email = user?.email ?? null;
    const estimate = estimateTokens({ slides: scenes?.length ?? 12, depth: "brief" });
    let reservation = null;
    (async () => {
      if (email && await isAutoRoute(model, email)) reservation = reserveAutoOrThrow(email, 0, estimate);
      const { writeProjectScript } = await import("../../src/projects/script.js");
      const write = async () => {
        let written = 0, skipped = 0, index = 0;
        const total = scenes?.length ?? null;
        for await (const slide of writeProjectScript({ owner: who.owner, admin: who.admin, id: req.params.id, scenes, overwrite: overwrite === true, model, signal: ctrl.signal })) {
          sse.send("status", { status: "script", index: index++, total });
          sse.send("slide", slide);
          if (slide.words) written++; else skipped++;
        }
        return { written, skipped };
      };
      const out = email
        ? await withByokRun({ userId: getUserId(email), provider: "cloud", estimate, allowOverrun: req.body?.allowOverrun === true }, write)
        : await write();
      sse.send("result", out);
      sse.close();
    })().finally(() => settleRequest(req, reservation)).catch((err) => {
      if (ctrl.signal.aborted) return;
      sse.send("error", { error: err.message, code: err.code ?? null });
      sse.close();
    });
  });

  app.post("/api/v2/projects/:id/report", async (req, res) => {
    const who = await gate(req, res);
    if (!who) return;
    const user = await resolveUser(req, { allowCookie: false }).catch(() => null);
    if (user && !user.verified && verificationRequired()) return fail(res, 403, "confirm your email before writing a report");
    const { depth = "full", model } = req.body ?? {};
    if (!["full", "brief"].includes(depth)) return fail(res, 422, "depth is full or brief");
    const sse = startSSE(res);
    const ctrl = new AbortController();
    sse.done.catch(() => ctrl.abort());
    const email = user?.email ?? null;
    const estimate = estimateTokens({ slides: 8, depth });
    let reservation = null;
    (async () => {
      if (email && await isAutoRoute(model, email)) reservation = reserveAutoOrThrow(email, 0, estimate);
      const { generateProjectReport } = await import("../../src/projects/report.js");
      const write = () => generateProjectReport({ owner: who.owner, admin: who.admin, id: req.params.id, depth, model, signal: ctrl.signal, onProgress: (p) => sse.send("status", p) });
      const out = email
        ? await withByokRun({ userId: getUserId(email), provider: "cloud", estimate, allowOverrun: req.body?.allowOverrun === true }, write)
        : await write();
      sse.send("result", out);
      sse.close();
    })().finally(() => settleRequest(req, reservation)).catch((err) => {
      if (ctrl.signal.aborted) return;
      sse.send("error", { error: err.message, code: err.code ?? null });
      sse.close();
    });
  });
}
