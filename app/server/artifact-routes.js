/** Deck files, rendering, export, research, and report routes. */

import express from "express";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { readCredits, isCitable } from "../../src/credits.js";
import { render } from "../../src/render.js";
import { preview, reportPreview } from "../../src/preview.js";
import { renderReport, validateReport, donorStatus, donorDirForDeck } from "../../src/report.js";
import { DECKS } from "../../src/paths.js";
import { sweepDensity, convertSlideType, insertDeckSlide, reportUnavailable } from "../../src/ai/pipeline.js";
import { generateScript } from "../../src/ai/script.js";
import { ingestUpload, stageUpload, sweepStagedUploads, UPLOAD_MAX_BYTES, UPLOAD_EXT } from "../../src/ai/upload.js";
import { generateReport } from "../../src/ai/report.js";
import { researchSummary } from "../../src/ai/research.js";
import { deckFigures } from "../../src/ai/grounding.js";
import { estimateTokens, meterSummary } from "../../src/usage.js";
import { fail, ok, wrap } from "./http.js";

export function sniffImage(buf, ext) {
  if (ext === "png") return buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (ext === "jpg" || ext === "jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf.at(-2) === 0xff && buf.at(-1) === 0xd9;
  if (ext === "webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (ext === "gif") return ["GIF87a", "GIF89a"].includes(buf.subarray(0, 6).toString());
  if (ext === "avif") return buf.subarray(4, 12).toString().includes("ftyp");
  if (ext === "tiff") return ["49492a00", "4d4d002a"].includes(buf.subarray(0, 4).toString("hex"));
  return false;
}

export function registerArtifactRoutes(app, {
  withRenderSlot, startSSE, isAutoRoute, reserveAutoOrThrow, settleRequest,
}) {
app.get("/api/decks/:slug/versions", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug, "backups");
  let versions = [];
  try {
    const names = (await readdir(dir)).filter((f) => /^deck\.\d{4}-\d{2}-\d{2}T.+\.yaml$/.test(f));
    versions = await Promise.all(names.map(async (f) => {
      const s = await stat(path.join(dir, f));
      return { file: f, at: s.mtime.toISOString() };
    }));
    versions.sort((a, b) => b.at.localeCompare(a.at));
  } catch { /* no backups yet */ }
  ok(res, { versions });
}));


app.post("/api/decks/:slug/versions/:file/restore", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "backups", path.basename(req.params.file));
  if (!/^deck\.\d{4}-\d{2}-\d{2}T.+\.yaml$/.test(path.basename(req.params.file))) {
    return fail(res, 400, "unrecognised version file");
  }
  const data = await readFile(file, "utf8");
  await writeFile(path.join(DECKS, req.params.slug, "deck.yaml"), data, "utf8");
  ok(res, {});
}));


app.post("/api/validate", wrap(async (req, res) => {
  const { ok: valid, errors } = await validateDeck(req.body?.deck ?? {});
  ok(res, { valid, errors });
}));
const DECK_IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const DECK_IMAGE_MAX = 15 * 1024 * 1024; // 15 MB — a slide image, not a photo library


function sniffImage(buf, ext) {
  const h = buf.slice(0, 16);
  switch (ext) {
    case "png":
      return h.length >= 8 && h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
    case "jpg":
    case "jpeg":
      return h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
    case "gif":
      return h.length >= 4 && h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x38;
    case "webp":
      return h.length >= 12 && h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46
        && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50;
    case "avif":
      return h.length >= 12 && h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70
        && h[8] === 0x61 && h[9] === 0x76 && h[10] === 0x69;
    case "tiff":
      return (h.length >= 4 && h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0x00)
        || (h.length >= 4 && h[0] === 0x4d && h[1] === 0x4d && h[2] === 0x00 && h[3] === 0x2a);
    default:
      return false;
  }
}



app.post("/api/decks/:slug/assets", (req, res) => {
  const ext = String(req.headers["x-file-ext"] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!DECK_IMAGE_EXT.has(ext)) {
    return fail(res, 400, `unsupported image extension — allowed: ${[...DECK_IMAGE_EXT].join(", ")}`);
  }
  const maxMB = Math.round(DECK_IMAGE_MAX / 1024 / 1024);
  express.raw({ type: () => true, limit: DECK_IMAGE_MAX })(req, res, (err) => {
    if (err) return fail(res, 413, `image too large — max ${maxMB} MB`);
    (async () => {
      try {
        if (!req.body?.length) return fail(res, 400, "empty upload");
        if (!sniffImage(req.body, ext)) {
          return fail(res, 400, `file does not look like a ${ext} image`);
        }
        const dir = path.join(DECKS, req.params.slug, "assets");
        await mkdir(dir, { recursive: true });
        const name = `image-${Date.now().toString(36)}.${ext}`;
        await writeFile(path.join(dir, name), req.body);
        ok(res, { file: `assets/${name}`, url: `/api/decks/${req.params.slug}/assets/${name}` });
      } catch (err) {
        fail(res, 500, err.message);
      }
    })();
  });
});


app.get("/api/decks/:slug/assets/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "assets", path.basename(req.params.file));
  try {
    await stat(file);
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src data: blob:");
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));


app.post("/api/briefing/upload", (req, res, next) => {
  const ext = String(req.headers["x-file-ext"] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let name = "";
  try { name = decodeURIComponent(String(req.headers["x-file-name"] ?? "")); } catch { name = ""; }
  name = name.replace(/[^\w .()-]/g, "").slice(0, 120);
  if (!UPLOAD_EXT.has(ext)) {
    return fail(res, 400, `unsupported file type — upload a .md, .txt, .docx or .pdf`);
  }
  express.raw({ type: () => true, limit: UPLOAD_MAX_BYTES })(req, res, (err) => {
    if (err) return fail(res, 413, `file too large — max ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)} MB`);
    (async () => {
      try {
        const ingested = await ingestUpload(req.body, { name, ext });
        const staged = await stageUpload(ingested);
        ok(res, { ...staged, preview: ingested.text.slice(0, 500) });
      } catch (err) {
        fail(res, 400, err.message);
      }
    })();
  });
});


sweepStagedUploads().catch(() => {});

app.post("/api/decks/:slug/render", withRenderSlot(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug);
  const deckFile = path.join(dir, "deck.yaml");
  const themeName = req.body?.theme;
  const style = req.body?.style;
  let metaMode = null;
  try {
    metaMode = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8"))?.mode ?? null;
  } catch { /* optional */ }
  const mode = req.body?.mode ?? metaMode ?? "light";

  let r;
  try {
    r = await render({ deckFile, themeName, style, mode });
  } catch (err) {
    if (/render refused/i.test(err.message)) return fail(res, 422, err.message);
    throw err;
  }
  const p = await preview(r.outFile, { dpi: req.body?.dpi ?? 110 });
  const base = `/api/decks/${req.params.slug}/preview`;

  let deck = null;
  try { deck = YAML.parse(await readFile(deckFile, "utf8")); } catch { /* unreachable — just rendered */ }
  ok(res, {
    slides: p.pages.map((f) => `${base}/${path.basename(f)}`),
    thumbs: p.thumbs.map((f) => `${base}/thumbs/${path.basename(f)}`),
    problems: r.problems,
    placeholders: placeholderSlides(deck ?? {}),
    pptx: `/api/decks/${req.params.slug}/download/deck.pptx`,
  });
}));


app.post("/api/decks/:slug/sweep", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { density, theme, model } = req.body ?? {};
  if (!["sparse", "balanced", "dense"].includes(density)) {
    sse.send("error", { error: "density must be one of sparse|balanced|dense" });
    return sse.close();
  }

  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({ slides: 12 }));
    }
    const r = await sweepDensity({
      slug: req.params.slug, density, theme, model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", {
      slug: r.slug,
      density: r.density,
      slides: r.slides,
      thumbs: r.thumbs,
      problems: r.problems,
      swept: r.swept,
    });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


app.post("/api/decks/:slug/script", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { index, model } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(
        req.user.email, 0,
        index != null ? estimateTokens({}) : estimateTokens({ slides: 12 }),
      );
    }
    const r = await generateScript({
      slug: req.params.slug,
      index: index != null ? Number(index) : null,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", {
      slides: r.slides,
      regenerated: r.regenerated,
      problems: r.problems,
      file: `/api/decks/${req.params.slug}/download/script.md`,
    });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


app.get("/api/decks/:slug/script", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "script.md");
  let markdown = null;
  try {
    markdown = await readFile(file, "utf8");
  } catch { /* no script yet */ }

  if (markdown == null) return ok(res, { exists: false, slides: [] });

  let deck = {};
  try { deck = YAML.parse(await readFile(path.join(DECKS, req.params.slug, "deck.yaml"), "utf8")) ?? {}; } catch { /* legacy */ }
  const deckSlides = deck.slides ?? [];

  const blocks = parseScriptBlocks(markdown);
  const slides = deckSlides.map((s, i) => {
    const raw = blocks.get(i);
    return {
      index: i,
      presenter: s.presenter ?? null,
      type: s.type,
      headline: s.headline ?? s.quote ?? s.title ?? s.type,
      written: Boolean(raw),
      body: raw
        ? raw
            .replace(/^<!-- slide:\d+ -->\s*/, "")
            .replace(/\s*<!-- \/slide:\d+ -->$/, "")
            .replace(/^##[^\n]*\n+\s*_[^\n]*_\s*\n*/m, "") // drop the heading + presenter line; the card shows those from deck.yaml
            .trim()
        : "",
    };
  });
  ok(res, { exists: true, title: deck.title ?? "", slides });
}));

function parseScriptBlocks(markdown) {
  const blocks = new Map();
  const re = /<!-- slide:(\d+) -->([\s\S]*?)<!-- \/slide:\1 -->/g;
  let m;
  while ((m = re.exec(markdown))) blocks.set(Number(m[1]), m[0]);
  return blocks;
}


app.get("/api/decks/:slug/preview/report/thumbs/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", "report-preview", "thumbs", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));

app.get("/api/decks/:slug/preview/report/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", "report-preview", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));

app.get("/api/decks/:slug/preview/thumbs/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", "preview", "thumbs", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));



app.post("/api/decks/:slug/slides/:index/insert", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { type, purpose, model } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(req.user.email, 1, estimateTokens({ slides: 1 }));
    }
    const r = await insertDeckSlide({
      slug: req.params.slug,
      index: Number(req.params.index),
      type: type ?? null,
      purpose: purpose ?? null,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", r);
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message, limits: err.limits });
    sse.close();
  });
});

app.post("/api/decks/:slug/slides/:index/convert", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { type, model } = req.body ?? {};
  if (!type) {
    sse.send("error", { error: "body must include a target `type`" });
    return sse.close();
  }

  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({}));
    }
    const r = await convertSlideType({
      slug: req.params.slug,
      index: Number(req.params.index),
      type,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", {
      slug: r.slug,
      index: r.index,
      slide: r.slide,
      method: r.method,
      slides: r.slides,
      thumbs: r.thumbs,
      problems: r.problems,
    });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

app.get("/api/decks/:slug/preview/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", "preview", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));

app.get("/api/decks/:slug/download/:file", wrap(async (req, res) => {
  let file = path.join(DECKS, req.params.slug, "out", path.basename(req.params.file));
  try {
    await stat(file);
  } catch {
    file = path.join(DECKS, req.params.slug, path.basename(req.params.file));
  }
  try {
    await stat(file);
    let title = "";
    try {
      const meta = YAML.parse(await readFile(path.join(DECKS, req.params.slug, "meta.yaml"), "utf8"));
      title = String(meta.title ?? "").trim();
    } catch { /* no meta */ }
    if (!title) {
      try {
        const deck = YAML.parse(await readFile(path.join(DECKS, req.params.slug, "deck.yaml"), "utf8"));
        title = String(deck.title ?? "").trim();
      } catch { /* no deck */ }
    }
    const ext = path.extname(req.params.file);
    const base = path.basename(req.params.file, ext);
    const name = (title || base).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || base;
    res.setHeader("Content-Disposition", `attachment; filename="${name}${ext}"`);
    res.download(file, `${name}${ext}`);
  } catch {
    res.status(404).end();
  }
}));


app.post("/api/decks/:slug/export", wrap(async (req, res) => {
  const { format = "pdf", theme } = req.body ?? {};
  const { exportDeck } = await import("../../src/export.js");
  const deckFile = path.join(DECKS, req.params.slug, "deck.yaml");
  const r = await exportDeck({ deckFile, format, themeName: theme });
  ok(res, {
    format: r.format,
    file: `/api/decks/${req.params.slug}/download/${path.basename(r.outFile)}`,
  });
}));


app.post("/api/decks/:slug/clone", wrap(async (req, res) => {
  const { cloneDeck } = await import("../../src/ai/pipeline.js");
  const r = await cloneDeck({ slug: req.params.slug });
  ok(res, r);
}));


app.post("/api/decks/:slug/bundle", wrap(async (req, res) => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const dir = path.join(DECKS, req.params.slug);
  const include = ["deck.yaml", "meta.yaml", "plan.yaml", "report.yaml", "script.md", "research", "out"];
  for (const name of include) {
    const src = path.join(dir, name);
    let st;
    try {
      st = await stat(src);
    } catch { continue; }
    if (st.isDirectory()) {
      for (const f of await readdir(src, { recursive: true })) {
        try {
          zip.file(path.posix.join(req.params.slug, name, f), await readFile(path.join(src, f)));
        } catch { /* unreadable file — skip */ }
      }
    } else {
      zip.file(path.posix.join(req.params.slug, name), await readFile(src));
    }
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.slug}.zip"`);
  res.send(buf);
}));
app.get("/api/decks/:slug/research", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug, "research");
  let notes = null;
  try {
    notes = await readFile(path.join(dir, "notes.md"), "utf8");
  } catch { /* no research pass yet */ }

  let sources = [];
  try {
    sources = JSON.parse(await readFile(path.join(dir, "sources.json"), "utf8")) ?? [];
  } catch { /* malformed or missing — the notes may still be valid */ }

  let figures = [];
  try {
    const deck = YAML.parse(await readFile(path.join(DECKS, req.params.slug, "deck.yaml"), "utf8")) ?? {};
    figures = deckFigures(deck);
  } catch { /* no deck — a report-only folder has nothing to verify yet */ }
  const imageCredits = (await readCredits(path.join(DECKS, req.params.slug)))
    .map((c) => ({ ...c, citable: isCitable(c) }));

  ok(res, { exists: notes != null, notes, sources, summary: researchSummary(sources, notes), figures, imageCredits });
}));


app.put("/api/decks/:slug/research", wrap(async (req, res) => {
  const { notes, sources } = req.body ?? {};
  if (notes != null && typeof notes !== "string") {
    return fail(res, 400, "notes must be a string");
  }
  if (sources != null && !Array.isArray(sources)) {
    return fail(res, 400, "sources must be an array");
  }

  const dir = path.join(DECKS, req.params.slug, "research");
  await mkdir(dir, { recursive: true });
  if (notes != null) await writeFile(path.join(dir, "notes.md"), notes, "utf8");
  if (sources != null) await writeFile(path.join(dir, "sources.json"), JSON.stringify(sources, null, 2), "utf8");
  ok(res, { exists: true });
}));

app.get("/api/decks/:slug/report", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug);
  const file = path.join(dir, "report.yaml");
  let report;
  try {
    report = YAML.parse(await readFile(file, "utf8"));
  } catch {
    return fail(res, 404, "no report.yaml saved for this deck");
  }
  let identity = {};
  try {
    identity = await loadIdentity(dir);
  } catch { /* identity may be absent on a bare clone */ }
  let rendered = false;
  try { await access(path.join(dir, "out", "report.docx")); rendered = true; } catch { /* not yet */ }
  ok(res, { report, identity, rendered });
}));


app.put("/api/decks/:slug/report", wrap(async (req, res) => {
  const { report } = req.body ?? {};
  if (!report) return fail(res, 400, "body must include `report`");

  const { ok: valid, errors } = await validateReport(report);
  if (!valid) return res.status(422).json({ ok: false, error: "validation failed", errors });

  const dir = path.join(DECKS, req.params.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "report.yaml"), YAML.stringify(report), "utf8");
  ok(res, {});
}));


app.post("/api/decks/:slug/report/render", withRenderSlot(async (req, res) => {
  const reportFile = path.join(DECKS, req.params.slug, "report.yaml");
  let saved = true;
  try { await access(reportFile); } catch { saved = false; }
  if (!saved) {
    return fail(res, 404, "no report.yaml saved for this deck — save report content first");
  }
  const donor = await donorStatus(await donorDirForDeck(path.join(DECKS, req.params.slug)));
  if (!donor.ok) {
    return res.status(503).json({ ok: false, error: reportUnavailable(donor), code: "no_donor" });
  }
  const toc = req.body?.toc !== false;
  const r = await renderReport({ reportFile, toc });
  ok(res, {
    sections: r.sections,
    pages: r.pages,
    problems: r.problems,
    docx: `/api/decks/${req.params.slug}/download/report.docx`,
  });
}));


app.post("/api/decks/:slug/report/preview", withRenderSlot(async (req, res) => {
  const docx = path.join(DECKS, req.params.slug, "out", "report.docx");
  try { await access(docx); } catch {
    return fail(res, 404, "no rendered report — render it first");
  }
  const base = `/api/decks/${req.params.slug}/preview`;
  try {
    const p = await reportPreview(docx);
    ok(res, {
      previewPages: p.pages.map((f) => `${base}/report/${path.basename(f)}`),
      previewThumbs: p.thumbs.map((f) => `${base}/report/thumbs/${path.basename(f)}`),
    });
  } catch (err) {
    fail(res, 500, `report preview failed: ${err.message}`);
  }
}));


app.post("/api/decks/:slug/report/generate", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { depth, model } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(
        req.user.email, 0,
        estimateTokens({ slides: 8, depth: depth ?? "full" }),
      );
    }
    const r = await generateReport({
      slug: req.params.slug,
      depth,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", { sections: r.sections, skipped: r.skipped, depth: r.depth });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

}
