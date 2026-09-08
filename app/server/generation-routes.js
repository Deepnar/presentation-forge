/** Type specimens, chat, creation, and resumable generation routes. */

import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../../src/paths.js";
import { deckSchema, typeDescriptions } from "../../src/ai/catalog.js";
import { loadTheme } from "../../src/theme.js";
import { placeholderSlides } from "../../src/placeholders.js";
import { render } from "../../src/render.js";
import { preview } from "../../src/preview.js";
import { createDeck, createDeckFromReport, createReport, finalizeDeck, generateFromPlan, generationStatus, resumeGeneration } from "../../src/ai/pipeline.js";
import { loadThread, resetThread, runChatTurn } from "../../src/ai/chat.js";
import { modelChoices } from "../../src/ai/ollama.js";
import { meterSummary, estimateTokens } from "../../src/usage.js";
import { donorStatus } from "../../src/report.js";
import { bearerToken, userForToken } from "../../src/auth.js";
import { fail, ok, wrap } from "./http.js";

const generationRuns = new Map();

export function generationRunInfo(slug) {
  const run = generationRuns.get(slug);
  return {
    active: Boolean(run && !run.finished),
    status: run?.statusData?.status ?? null,
    runId: run?.runId ?? null,
    kind: run?.kind ?? null,
  };
}

export function registerGenerationRoutes(app, {
  withRenderSlot, startSSE, isAutoRoute, reserveAutoOrThrow, settleRequest,
}) {
app.get("/api/types", wrap(async (_req, res) => {
  const schema = await deckSchema();
  const descriptions = await typeDescriptions();
  ok(res, {
    types: schema.definitions.slide.properties.type.enum,
    descriptions,
  });
}));


app.get("/api/types/:theme/specimens", withRenderSlot(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to use the deck workspace");
  const themeName = req.params.theme === "default" ? "warm-humanist" : req.params.theme;
  if (!(await listThemes()).includes(themeName)) return fail(res, 404, `unknown theme "${themeName}"`);
  const schema = await deckSchema();
  const types = schema.definitions.slide.properties.type.enum;
  const { specimenDeck } = await import("../../src/specimens.js");
  const deck = await specimenDeck();
  deck.theme = themeName;
  deck.slides.forEach((s) => { delete s.presenter; });

  const cacheDir = path.join(ROOT, "decks", ".specimen-cache", themeName);
  const previewDir = path.join(cacheDir, "preview");
  const expected = deck.slides.length;
  let rendered = false;
  try {
    const existing = await readdir(path.join(previewDir, "thumbs"));
    rendered = existing.length >= expected;
  } catch { /* render below */ }
  if (!rendered) {
    const deckFile = path.join(cacheDir, "specimen.yaml");
    await mkdir(cacheDir, { recursive: true });
    await writeFile(deckFile, YAML.stringify(deck), "utf8");
    const r = await render({ deckFile, themeName });
    await preview(r.outFile, { outDir: previewDir, dpi: 60 });
  }

  ok(res, {
    types,
    previews: buildSpecimenUrls(themeName, types.length),
  });
}));


app.get("/api/specimens/:theme", withRenderSlot(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to use the deck workspace");
  const themeName = req.params.theme === "default" ? "warm-humanist" : req.params.theme;
  if (!(await listThemes()).includes(themeName)) return fail(res, 404, `unknown theme "${themeName}"`);
  const { specimenDeck } = await import("../../src/specimens.js");
  const deck = await specimenDeck();
  deck.theme = themeName;
  deck.slides.forEach((s) => { delete s.presenter; });
  const cacheDir = path.join(ROOT, "decks", ".specimen-cache", themeName);
  const previewDir = path.join(cacheDir, "preview");
  const expected = deck.slides.length;
  try {
    const existing = await readdir(path.join(previewDir, "thumbs"));
    if (existing.length >= expected) {
      return ok(res, { previews: buildSpecimenUrls(themeName, expected) });
    }
  } catch { /* need to render */ }

  const deckFile = path.join(cacheDir, "specimen.yaml");
  await mkdir(cacheDir, { recursive: true });
  await writeFile(deckFile, YAML.stringify(deck), "utf8");
  const r = await render({ deckFile, themeName });
  await preview(r.outFile, { outDir: previewDir, dpi: 60 });

  ok(res, { previews: buildSpecimenUrls(themeName, expected) });
}));

function buildSpecimenUrls(themeName, count) {
  const base = `/api/specimens/${encodeURIComponent(themeName)}/`;
  return Array.from({ length: count }, (_, i) => `${base}slide-${String(i + 1).padStart(2, "0")}.png`);
}

app.get("/api/specimens/:theme/:file", wrap(async (req, res) => {
  const themeName = req.params.theme === "default" ? "warm-humanist" : req.params.theme;
  const file = path.join(ROOT, "decks", ".specimen-cache", themeName, "preview", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file, { dotfiles: "allow" });
  } catch {
    res.status(404).end();
  }
}));


app.post("/api/decks", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { brief, briefing, sources, research, papers, researchSource, upload, theme, maxSlides, model, identity, slidesPerMember, density, imageSupply } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      const upcoming = Number(maxSlides) > 0 ? Number(maxSlides) : 12;
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({ research: Boolean(research) }));
      settleAuto({ eventId: reservation.eventId, slides: upcoming });
    }
    const r = await createDeck({
      brief, briefing, sources, research, papers, researchSource, upload, theme, maxSlides, model, identity, slidesPerMember, density, imageSupply,
      owner: req.user.email,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("plan", { slug: r.slug, plan: r.plan, stats: r.stats });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});
app.get("/api/models", wrap(async (_req, res) => {
  const { models, default: def, cloud, auto, route } = await modelChoices();
  ok(res, { models, default: def, cloud, auto, route, hosted: isHosted() });
}));


app.get("/api/decks/:slug/chat", wrap(async (req, res) => {
  const thread = await loadThread(path.join(DECKS, req.params.slug));
  ok(res, thread);
}));


app.delete("/api/decks/:slug/chat", wrap(async (req, res) => {
  await resetThread(path.join(DECKS, req.params.slug));
  ok(res, {});
}));


app.post("/api/decks/:slug/chat", async (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { instruction, model, slides } = req.body ?? {};
  if (!instruction?.trim()) {
    sse.send("error", { error: "body must include an `instruction`" });
    return sse.close();
  }
  const onlySlides = Array.isArray(slides)
    ? slides.filter((n) => Number.isInteger(n) && n >= 0)
    : null;
  let reservation = null;
  if (await isAutoRoute(model, req.user.email)) {
    try { reservation = reserveAutoOrThrow(req.user.email, 0); } catch (e) {
      sse.send("error", { error: e.message, limits: e.limits }); return sse.close();
    }
  }

  (async () => {
    const r = await runChatTurn({
      slug: req.params.slug,
      instruction,
      model,
      onlySlides,
      signal: ctrl.signal,
      onToken: (text) => sse.send("token", { text }),
      onProgress: (p) => sse.send("status", p),
    });
    if (!r.ok) {
      sse.send("error", { error: r.errors?.join("; ") });
      return sse.close();
    }
    const base = `/api/decks/${req.params.slug}/preview`;
    sse.send("result", {
      changes: r.changes,
      diff: r.diff,
      stats: r.stats,
      decisions: r.decisions,
      summary: r.summary,
      slides: (r.slides ?? []).map((f) => `${base}/${f}`),
      thumbs: (r.thumbs ?? []).map((f) => `${base}/thumbs/${f}`),
      problems: r.problems,
    });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


app.post("/api/reports", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { brief, sources, research, papers, researchSource, upload, depth, density, model, identity } = req.body ?? {};
  if (!brief?.trim()) {
    sse.send("error", { error: "body must include a `brief`" });
    return sse.close();
  }

  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(
        req.user.email, 0,
        estimateTokens({ slides: 8, research: true, depth: depth ?? "full" }),
      );
    }
    const r = await createReport({
      brief, sources, research, papers, researchSource, upload, depth, density, model, identity,
      owner: req.user.email,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", {
      slug: r.slug,
      title: r.title,
      sections: r.sections,
      skipped: r.skipped,
      depth: r.depth ?? depth,
      docx: `/api/decks/${r.slug}/download/report.docx`,
    });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


app.post("/api/decks/:slug/report/deck", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { theme, model } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({}));
    }
    const r = await createDeckFromReport({
      slug: req.params.slug, theme, model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("plan", { slug: r.slug, plan: r.plan, stats: r.stats });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});



function startDeckRun({ slug, kind, plan, theme, model, reservation = null }) {
  const ctrl = new AbortController();
  const run = {
    slug,
    runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    plan,
    abort: () => ctrl.abort(),
    statusData: { status: "Queued…" },
    subscribers: new Set(),
    finished: false,
    error: null,
    result: null,
  };
  generationRuns.set(slug, run);

  const broadcast = (event, data) => {
    if (event === "status") run.statusData = data;
    for (const s of run.subscribers) s.send(event, data);
  };
  const meter = newMeter();
  run.meter = meter;

  withMeter(meter, () => (async () => {
    const job = kind === "finalize"
      ? () => finalizeDeck({ slug, theme, model, signal: ctrl.signal, onProgress: (p) => broadcast("status", p) })
      : kind === "resume"
        ? () => resumeGeneration({ slug, theme, model, signal: ctrl.signal, onProgress: (p) => broadcast("status", p) })
        : () => generateFromPlan({ slug, plan, theme, model, signal: ctrl.signal, onProgress: (p) => broadcast("status", p) });
    const r = await job();
    const base = `/api/decks/${slug}/preview`;
    run.result = {
      slug,
      slides: (r.slides ?? []).map((f) => `${base}/${f}`),
      thumbs: (r.thumbs ?? []).map((f) => `${base}/thumbs/${f}`),
      problems: r.problems,
      skipped: r.skipped,
      stats: r.stats,
    };
    run.finished = true;
    broadcast("result", run.result);
  })().catch((err) => {
    if (ctrl.signal.aborted) {
      run.error = "Stopped — the deck's progress is preserved; resume from where it left off.";
    } else {
      run.error = err.message;
    }
    run.finished = true;
    broadcast("error", { error: run.error });
  }).finally(() => {
    if (reservation?.eventId) {
      try {
        settleAuto({ eventId: reservation.eventId, tokens: meterTotal(meter) });
      } catch { /* metering must never break a run's teardown */ }
    }
    for (const s of run.subscribers) s.close();
    run.subscribers.clear();
    setTimeout(() => {
      if (generationRuns.get(slug) === run) generationRuns.delete(slug);
    }, 5 * 60 * 1000);
  }));

  return run;
}


function attachToRun(res, run) {
  const sse = startSSE(res);
  const sub = { send: sse.send, close: sse.close };
  run.subscribers.add(sub);
  sse.done.catch(() => run.subscribers.delete(sub));
  if (run.finished) {
    if (run.error) sse.send("error", { error: run.error });
    else sse.send("result", run.result);
    sse.close();
  } else if (run.statusData) {
    sse.send("status", run.statusData);
  }
  return sse;
}


app.post("/api/decks/:slug/generate", async (req, res) => {
  const { plan, theme, model, resume } = req.body ?? {};

  const live = generationRuns.get(req.params.slug);
  if (live && !live.finished) {
    attachToRun(res, live);
    return;
  }
  if (!resume && (!plan || !Array.isArray(plan.slides) || !plan.slides.length)) {
    const sse = startSSE(res);
    sse.send("error", { error: "body must include an approved `plan` with slides" });
    return sse.close();
  }
  let reservation = null;
  if (await isAutoRoute(model, req.user.email)) {
    const slides = plan?.slides?.length ?? 0;
    try {
      reservation = reserveAutoOrThrow(req.user.email, slides, estimateTokens({ slides }));
    } catch (e) {
      const sse = startSSE(res);
      sse.send("error", { error: e.message, limits: e.limits });
      return sse.close();
    }
  }
  startDeckRun({
    slug: req.params.slug,
    kind: resume ? "resume" : "generate",
    plan,
    theme,
    model,
    reservation,
  });
  attachToRun(res, generationRuns.get(req.params.slug));
});


app.post("/api/decks/:slug/generate/resume", async (req, res) => {
  const live = generationRuns.get(req.params.slug);
  if (live && !live.finished) {
    attachToRun(res, live);
    return;
  }
  const { theme, model } = req.body ?? {};
  let reservation = null;
  if (await isAutoRoute(model, req.user.email)) {
    try {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({ slides: 8 }));
    } catch (e) {
      const sse = startSSE(res);
      sse.send("error", { error: e.message, limits: e.limits });
      return sse.close();
    }
  }
  startDeckRun({ slug: req.params.slug, kind: "resume", plan: null, theme, model, reservation });
  attachToRun(res, generationRuns.get(req.params.slug));
});


app.post("/api/decks/:slug/finalize", async (req, res) => {
  const live = generationRuns.get(req.params.slug);
  if (live && !live.finished) {
    attachToRun(res, live);
    return;
  }
  const { theme, model } = req.body ?? {};
  let reservation = null;
  if (await isAutoRoute(model, req.user.email)) {
    try {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({ slides: 6 }));
    } catch (e) {
      const sse = startSSE(res);
      sse.send("error", { error: e.message, limits: e.limits });
      return sse.close();
    }
  }
  startDeckRun({ slug: req.params.slug, kind: "finalize", plan: null, theme, model, reservation });
  attachToRun(res, generationRuns.get(req.params.slug));
});


app.post("/api/decks/:slug/generate/stop", wrap(async (req, res) => {
  const run = generationRuns.get(req.params.slug);
  if (run && !run.finished) run.abort();
  ok(res, { stopped: Boolean(run && !run.finished) });
}));

}
