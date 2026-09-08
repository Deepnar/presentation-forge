import { mkdir, readFile, writeFile, readdir, access, copyFile, cp, rm } from "node:fs/promises";
import path from "node:path";
import { randomInt } from "node:crypto";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { fetchPage } from "../search.js";
import { excerptResearch, deepResearch } from "./research.js";
import { ingestUpload, readStagedUpload } from "./upload.js";
import { planDeck, generateDeck, sweepDeck, convertSlide, insertSlide } from "./generate.js";
import { generateScript } from "./script.js";
import { trimDeckToFit } from "./trim.js";
import { fieldLengthPass } from "./fieldlength.js";
import { critiqueDeck } from "./critic.js";
import { coherencePass } from "./coherence.js";
import { groundDeck } from "./grounding.js";
import { runChatTurn } from "./chat.js";
import { assignPresenters } from "./team.js";
import { generateReport } from "./report.js";
import { scoreDeck } from "../deckscore.js";
import { recordScore } from "../scorelog.js";
import { loadIdentity, deepMerge } from "./identity.js";
import { chatJSON, researchProfile, researchExcerptCap, authorTransport } from "./ollama.js";
import { loadTheme } from "../theme.js";
import { render } from "../render.js";
import { preview } from "../preview.js";
import { renderReport, donorStatus, donorDirFor, presentSections } from "../report.js";
import { analyzeQuality, qualityProblems } from "./quality.js";
import { supplyDeckImages } from "./images.js";
import { creditsSlide } from "../credits.js";

export const RUN_FILE = ".run.json";

export function slugify(text, max = 44) {
  const slug = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "deck";
}

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function slugToken(length) {
  let out = "";
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return out;
}

export async function uniqueSlug(base, owner = null) {
  const slug = slugify(base);
  const exists = new Set();
  try {
    for (const e of await readdir(DECKS, { withFileTypes: true })) {
      if (e.isDirectory()) exists.add(e.name);
    }
  } catch { /* no decks yet */ }

  if (!owner) {
    if (!exists.has(slug)) return slug;
    let i = 2;
    while (exists.has(`${slug}-${i}`)) i++;
    return `${slug}-${i}`;
  }

  for (let width = 4; ; width++) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate = `${slug}-${slugToken(width)}`;
      if (!exists.has(candidate)) return candidate;
    }
  }
}

export async function runResearch(brief, sources = [], onProgress, { papers = false, briefing = "" } = {}) {
  const profile = await researchProfile();
  let out = [];
  const allSources = [];
  if (sources.length) {
    const pages = await Promise.all(sources.map((url) => fetchPage(url)));
    out = pages.filter((p) => p.ok);
  } else if (brief?.trim()) {
    const r = await deepResearch(brief.trim(), { onProgress, profile, briefing });
    out = r.pages;
  }
  allSources.push(...out.map(({ url, title, words }) => ({ url, title, words })));

  if (papers && brief?.trim()) {
    onProgress?.({ status: "papers" });
    const { searchPapers, paperFullTexts, mergePapers } = await import("../papers.js");
    const { papers: found } = await searchPapers(brief.trim(), { limit: profile.papers_limit });
    allSources.push(...mergePapers([], found));
    const full = await paperFullTexts(found, { top: profile.papers_fulltext });
    for (const f of full) {
      out.push(f);
      allSources.push({ url: f.url, title: f.title, words: f.words, kind: "paper" });
    }
  }

  return {
    text: out.map((s) => `## ${s.title}\n\n${s.text}`).join("\n\n"),
    sources: allSources,
  };
}

export async function resolveResearchSource({ researchSource, research, papers, sources, upload }) {
  if (researchSource === "upload") {
    let text = "";
    let name = "upload";
    if (upload && typeof upload === "object") {
      if (upload.token) {
        const staged = await readStagedUpload(upload.token);
        if (!staged) {
          throw new Error("the uploaded file is missing — re-upload it from the briefing before planning");
        }
        text = staged.text;
        name = staged.name || name;
      } else if (typeof upload.text === "string") {
        text = upload.text;
        name = upload.name || name;
      }
    }
    if (!text?.trim()) throw new Error("no uploaded file content — re-upload the document in the briefing");
    return {
      mode: "upload",
      text: text.trim(),
      name,
      words: text.trim().split(/\s+/).filter(Boolean).length,
    };
  }
  if (researchSource === "none") return { mode: "none" };
  if (researchSource === "web") return { mode: "web" };
  return { mode: research || papers || (sources?.length ?? 0) > 0 ? "web" : "none" };
}

async function writeResearch(dir, { text, sources }) {
  const rdir = path.join(dir, "research");
  await mkdir(rdir, { recursive: true });
  await writeFile(path.join(rdir, "notes.md"), text, "utf8");
  await writeFile(path.join(rdir, "sources.json"), JSON.stringify(sources, null, 2), "utf8");
}

async function groundNotesLabel(dir) {
  try {
    const meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
    return meta.researchSource === "upload" ? "your uploaded file" : "research/notes.md";
  } catch {
    return "research/notes.md";
  }
}

export async function createDeck({
  brief, briefing = "", sources = [], research = false, papers = false, researchSource = null,
  upload = null, theme = null, maxSlides = 24, imageSupply = "none",
  slidesPerMember = null, density = "balanced", model, identity, owner, onProgress, signal,
}) {
  if (!brief?.trim()) throw new Error("brief is required");

  const slug = await uniqueSlug(brief, owner);
  const dir = path.join(DECKS, slug);
  await mkdir(dir, { recursive: true });

  const snapshot = identity && typeof identity === "object"
    ? {
        academic: identity.academic ?? {},
        guide: identity.guide ?? {},
        team: identity.team ?? {},
        chrome: identity.chrome ?? {},
      }
    : {};

  const meta = {
    slug, brief, sources, research, papers, theme, maxSlides, density,
    ...(researchSource ? { researchSource } : {}),
    ...(imageSupply && imageSupply !== "none" ? { imageSupply } : {}),
    ...(slidesPerMember != null ? { slidesPerMember } : {}),
    status: "planning",
    createdAt: new Date().toISOString(),
    ...(owner ? { owner } : {}),
    ...snapshot,
  };
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  const src = await resolveResearchSource({ researchSource, research, papers, sources, upload });
  let researchText = "";

  if (src.mode === "upload") {
    onProgress?.({ status: "researching", source: "upload" });
    await writeResearch(dir, {
      text: src.text,
      sources: [{ kind: "user-provided", name: src.name, title: src.name, words: src.words }],
    });
    researchText = src.text;
  } else if (src.mode === "web") {
    onProgress?.({ status: "researching" });
    const r = await runResearch(brief, sources, (p) => onProgress?.({ status: "researching", ...p }), { papers, briefing });
    if (r.text) {
      await writeResearch(dir, { text: r.text, sources: r.sources });
      researchText = r.text;
    }
  }

  onProgress?.({ status: "planning" });
  const identityObj = deepMerge(await loadIdentity(), identity ?? {});
  const themeObj = theme ? await loadTheme(theme) : undefined;
  const { plan, stats } = await planDeck({
    brief: brief.trim(), briefing, theme: themeObj, identity: identityObj,
    research: excerptResearch(researchText, await researchExcerptCap({ model })),
    maxSlides, slidesPerMember, model, signal,
  });

  if (!plan.slides?.length) throw new Error("The model produced no outline.");

  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(plan), "utf8");
  meta.status = "planned";
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  return { slug, plan, stats };
}

export function reportUnavailable(donor) {
  return donor.reason === "ambiguous"
    ? `this server has ${donor.donors.length} report templates and cannot choose between them — an admin should leave exactly one`
    : "this server has no report template installed — reports cannot be produced until an admin uploads one";
}

export async function createReport({
  brief, briefing = "", sources = [], research = false, papers = false, researchSource = null,
  upload = null, depth = "full", density = "balanced",
  model, identity, owner, onProgress, signal,
}) {
  if (!brief?.trim()) throw new Error("brief is required");

  const donor = await donorStatus(await donorDirFor(owner));
  if (!donor.ok) throw new Error(reportUnavailable(donor));

  const slug = await uniqueSlug(brief, owner);
  const dir = path.join(DECKS, slug);
  await mkdir(dir, { recursive: true });

  const snapshot = identity && typeof identity === "object"
    ? { academic: identity.academic ?? {}, guide: identity.guide ?? {}, team: identity.team ?? {}, chrome: identity.chrome ?? {} }
    : {};

  const meta = {
    slug, brief, sources, research, papers, depth, density,
    ...(researchSource ? { researchSource } : {}),
    status: "report",
    createdAt: new Date().toISOString(),
    ...(owner ? { owner } : {}),
    ...snapshot,
  };
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  const src = await resolveResearchSource({ researchSource, research, papers, sources, upload });
  if (src.mode === "upload") {
    onProgress?.({ status: "researching", source: "upload" });
    await writeResearch(dir, {
      text: src.text,
      sources: [{ kind: "user-provided", name: src.name, title: src.name, words: src.words }],
    });
  } else {
    onProgress?.({ status: "researching" });
    const r = await runResearch(brief, sources, (p) => onProgress?.({ status: "researching", ...p }), { papers, briefing });
    if (!r.text) throw new Error("Research produced nothing to write the report from.");
    await writeResearch(dir, { text: r.text, sources: r.sources });
  }

  const g = await generateReport({
    slug, depth, density, model, signal, onProgress, requirePlan: false,
  });

  onProgress?.({ status: "rendering" });
  const doc = await renderReport({ reportFile: g.reportFile });

  meta.status = "ready";
  meta.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  return {
    slug,
    title: g.report.title,
    sections: g.sections,
    skipped: g.skipped,
    reportFile: g.reportFile,
    docx: doc.outFile,
  };
}

export async function createDeckFromReport({
  slug, theme = null, model, identity, onProgress, signal,
}) {
  const dir = path.join(DECKS, slug);
  const reportFile = path.join(dir, "report.yaml");
  let report;
  try {
    report = YAML.parse(await readFile(reportFile, "utf8"));
  } catch {
    throw new Error(`no decks/${slug}/report.yaml — generate report content first`);
  }

  let researchText = "";
  try {
    researchText = await readFile(path.join(dir, "research", "notes.md"), "utf8");
  } catch { /* report may have no research pass */ }

  const identityObj = identity ?? (await loadIdentity(dir));
  const themeObj = theme ? await loadTheme(theme) : undefined;

  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* no meta yet */ }

  const brief = reportBrief(report);

  onProgress?.({ status: "planning" });
  const { plan, stats } = await planDeck({
    brief, briefing: meta.briefing ?? "", theme: themeObj, identity: identityObj,
    research: excerptResearch(researchText, await researchExcerptCap({ model })),
    maxSlides: meta.maxSlides ?? 24,
    slidesPerMember: meta.slidesPerMember ?? null,
    model, signal,
  });

  if (!plan.slides?.length) throw new Error("The model produced no outline.");

  meta.status = "planned";
  meta.brief = report.title ?? meta.brief ?? "";
  meta.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");
  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(plan), "utf8");

  return { slug, plan, stats };
}

export function formatProgress(p) {
  const at = p?.done != null ? p.done + 1 : (p?.index != null ? p.index + 1 : null);
  const count = at != null && p?.total != null ? ` ${at}/${p.total}` : "";
  return `${p?.status ?? ""}${count}`;
}

function reportBrief(report) {
  const content = report?.content ?? {};
  const lines = [report?.title ?? ""];
  if (report?.subtitle) lines.push(report.subtitle);
  for (const name of presentSections(report)) {
    const sec = content[name];
    if (!sec || typeof sec !== "object") continue;
    const text = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])]
      .map((p) => String(p).trim()).filter(Boolean).join(" ");
    const excerpt = text.slice(0, 600);
    if (excerpt) lines.push(`\n${name}: ${excerpt}${text.length > 600 ? "…" : ""}`);
  }
  return lines.join("\n");
}

export async function writeDeckContent({
  slug, plan, theme = null, model, identity, onProgress, signal, resume = false,
}) {
  const dir = path.join(DECKS, slug);
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* planned deck written before meta existed — carry on */ }

  const identityObj = identity ?? (await loadIdentity(dir));
  const themeObj = theme ? await loadTheme(theme) : undefined;

  let researchText = "";
  try {
    researchText = await readFile(path.join(dir, "research", "notes.md"), "utf8");
  } catch { /* no research pass */ }

  let baseDeck = null;
  let fromIndex = 0;
  if (resume) {
    try {
      baseDeck = YAML.parse(await readFile(path.join(dir, "deck.yaml"), "utf8"));
    } catch { /* no partial deck yet — start fresh */ }
    fromIndex = baseDeck?.slides?.length ?? 0;
    let stored = null;
    try {
      stored = YAML.parse(await readFile(path.join(dir, "plan.yaml"), "utf8"));
    } catch { /* fall through to .run.json */ }
    if (!stored?.slides?.length) {
      try {
        stored = JSON.parse(await readFile(path.join(dir, RUN_FILE), "utf8"))?.plan ?? null;
      } catch { /* no checkpoint either */ }
    }
    if (stored?.slides?.length) plan = stored;
  }

  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(plan), "utf8");

  const run = {
    kind: "deck-generation",
    status: "writing",
    plan: {
      title: plan.title ?? "",
      subtitle: plan.subtitle ?? "",
      sections: plan.sections ?? [],
      slides: plan.slides ?? [],
    },
    total: plan.slides?.length ?? 0,
    written: fromIndex,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(dir, RUN_FILE), JSON.stringify(run, null, 2), "utf8");

  meta.status = "writing";
  meta.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  onProgress?.({ status: "writing", phase: "planned", slides: plan.slides?.length ?? 0 });
  const res = await generateDeck({
    brief: meta.brief ?? plan.title ?? "",
    plan,
    theme: themeObj,
    identity: identityObj,
    research: excerptResearch(researchText, await researchExcerptCap({ model })),
    maxSlides: meta.maxSlides ?? 24,
    slidesPerMember: meta.slidesPerMember ?? null,
    model,
    signal,
    baseDeck,
    fromIndex,
    onProgress: (p) => onProgress?.({ status: "writing", ...p }),
    onSlide: async (deck, written, total) => {
      await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(deck), "utf8");
      const cp = JSON.parse(await readFile(path.join(dir, RUN_FILE), "utf8"));
      cp.written = written;
      cp.updatedAt = new Date().toISOString();
      await writeFile(path.join(dir, RUN_FILE), JSON.stringify(cp, null, 2), "utf8");
    },
  });

  if (!res.ok || !res.deck) {
    throw new Error(res.errors?.join("; ") || "Generation failed");
  }
  return { deck: res.deck, plan, skipped: res.skipped ?? [], stats: res.stats, problems: res.problems ?? [] };
}

export async function finalizeDeck({
  slug, theme = null, model, identity, onProgress, signal, critic = false, write = null, chat = null,
  imageSupply = null,
  critique = critiqueDeck,
}) {
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* optional */ }

  const deck = YAML.parse(await readFile(deckFile, "utf8"));
  let plan = {};
  try {
    plan = YAML.parse(await readFile(path.join(dir, "plan.yaml"), "utf8")) ?? {};
  } catch { /* optional */ }
  const themeName = theme ?? deck.theme ?? "warm-humanist";

  let researchText = "";
  try {
    researchText = await readFile(path.join(dir, "research", "notes.md"), "utf8");
  } catch { /* no research pass */ }

  const label = await groundNotesLabel(dir);
  const groundOnce = (d) => {
    const g = groundDeck(d, researchText, { label });
    return { deck: g.notes, problems: g.problems };
  };

  let grounded = groundOnce(deck);
  await writeFile(deckFile, YAML.stringify(grounded.deck), "utf8");

  let repaired = grounded;
  const passSkips = [];
  const optionalPass = async (label, run) => {
    try {
      return await run();
    } catch (err) {
      if (err.name === "AbortError") throw err;
      passSkips.push(`${label} skipped: ${String(err.message).slice(0, 140)}`);
      return null;
    }
  };

  if (!signal?.aborted) {
    onProgress?.({ status: "field_length_checking" });
    const fix = await optionalPass("field-length pass", async () => fieldLengthPass({
      deck: grounded.deck,
      deckDir: dir,
      research: excerptResearch(researchText, await researchExcerptCap({ model })),
      model,
      signal,
      chat,
      onProgress: (p) => onProgress?.({ status: "field_length", ...p }),
    }));
    if (fix?.repaired?.length) {
      repaired = { deck: fix.deck, problems: groundOnce(fix.deck).problems };
      await writeFile(deckFile, YAML.stringify(repaired.deck), "utf8");
    }
    for (const p of (fix?.problems ?? []).slice(0, 6)) passSkips.push(p);
  }

  const trimOnce = async (candidate) => {
    const trimRes = await trimDeckToFit({
      deck: candidate,
      themeName,
      deckDir: dir,
      signal,
    });
    const g = groundOnce(trimRes.deck);
    await writeFile(deckFile, YAML.stringify(g.deck), "utf8");
    return { ...trimRes, grounded: g };
  };

  let tr = await trimOnce(repaired.deck);

  let coherence = null;
  {
    onProgress?.({ status: "coherence_checking" });
    const pass = await optionalPass("coherence pass", async () => coherencePass({
      deck: tr.grounded.deck,
      sections: plan.sections ?? [],
      model,
      signal,
      chat,
      onProgress: (e) => onProgress?.({ status: "coherence", ...e }),
    }));
    coherence = pass;
    if (pass?.findings?.length) {
      const g = groundOnce(pass.deck);
      tr = await trimOnce(g.deck);
    }
  }

  let imageResult = null;
  if ((imageSupply ?? meta.imageSupply) === "auto") {
    try {
      const r = await supplyDeckImages(tr.grounded.deck, dir, {
        signal,
        onProgress: (e) => onProgress?.({ status: "images", ...e }),
        describeSeat: async (slide) => {
          const said = [slide.headline, ...(slide.points ?? [])].filter(Boolean).join(" — ").slice(0, 400);
          const res = await optionalPass("image description", async () => (chat ?? chatJSON)({
            role: "utility",
            model,
            signal,
            schema: {
              type: "object",
              required: ["subject"],
              properties: { subject: { type: "string", minLength: 18, maxLength: 60 } },
            },
            messages: [
              {
                role: "system",
                content: [
                  "Name the PHOTOGRAPH that would illustrate this slide.",
                  "Three to six words, every one literal and concrete. Name the physical",
                  "OBJECT and the SETTING it is in — a bare category is not a photograph.",
                  "No metaphors and no abstractions: \"the anatomy of a depot\" is a figure",
                  "of speech, \"bus\" is a category, and neither is a picture.",
                  "Good: \"electric buses charging at a depot\".",
                  "Good: \"rooftop solar panels on a warehouse\".",
                  "Bad: \"bus\". Bad: \"energy\". Bad: \"infrastructure transformation\".",
                  "Never name a brand, a product or a model number — no photograph in a",
                  "public archive is labelled with one, so it can only narrow the search to",
                  "nothing. Say what the thing IS.",
                ].join("\n"),
              },
              { role: "user", content: said },
            ],
          }));
          return res?.data?.subject ?? null;
        },
      });
      imageResult = r;
      if (r.supplied.length) {
        tr = { ...tr, grounded: { ...tr.grounded, deck: r.deck } };
        await writeFile(deckFile, YAML.stringify(r.deck), "utf8");
      }
      onProgress?.({ status: "images_done", supplied: r.supplied.length, skipped: r.skipped.length });
    } catch (err) {
      imageResult = { supplied: [], skipped: [], credits: [], notes: [String(err?.message ?? err)] };
    }
  }

  const qualityFindings = analyzeQuality(tr.grounded.deck, researchText);
  const qualityProbs = qualityProblems(qualityFindings);

  const imageProbs = (imageResult?.skipped ?? [])
    .filter((s) => !s.optional)
    .map((s) => `slide ${s.index + 1}: no image supplied for "${s.description}" — ${s.reason}`);

  const identityObj = identity ?? (await loadIdentity(dir));
  const assignAndPersist = async (d) => {
    assignPresenters(d, identityObj, meta.slidesPerMember ?? null);
    await writeFile(deckFile, YAML.stringify(d), "utf8");
    return d;
  };

  tr.grounded.deck = await assignAndPersist(tr.grounded.deck);

  const creditSlide = creditsSlide(imageResult?.credits ?? []);
  if (creditSlide) {
    tr.grounded.deck.slides.push(creditSlide);
    await writeFile(deckFile, YAML.stringify(tr.grounded.deck), "utf8");
  }

  meta.status = "ready";
  meta.updatedAt = new Date().toISOString();

  try {
    const scored = await scoreDeck(tr.grounded.deck, { research: researchText, deckDir: dir });
    meta.score = scored.score;
    meta.scoredAt = meta.updatedAt;
    await recordScore({
      ...scored,
      slug,
      kind: "generate",
      model: model ?? null,
      transport: await authorTransport({ model }).catch(() => null),
    });
  } catch { /* a scoring failure is not a generation failure */ }

  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  onProgress?.({ status: "rendering" });
  let rendered;
  try {
    rendered = await render({ deckFile, themeName });
  } catch (err) {
    if (/PLACEHOLDER|render refused/i.test(err.message)) {
      return {
        slug,
        deck: tr.grounded.deck,
        plan,
        slides: [],
        thumbs: [],
        problems: [...(tr.grounded.problems ?? []), ...qualityProbs, ...imageProbs, ...passSkips, err.message],
        skipped: [],
        stats: {},
        trimmed: tr.trimmed,
        coherence: coherence ? coherence.findings.length : 0,
        blocked: err.message,
      };
    }
    throw err;
  }
  const p = await preview(rendered.outFile, { dpi: 110 });

  let criticReport = null;
  let recut = null;
  if (critic) {
    criticReport = await critique({
      slug,
      deck: tr.grounded.deck,
      model,
      signal,
      onProgress: (e) => onProgress?.({ status: "critiquing", ...e }),
    });
    if (criticReport.deck) {
      const critiqued = YAML.stringify(criticReport.deck);
      tr = await trimOnce(criticReport.deck);
      tr.grounded.deck = await assignAndPersist(tr.grounded.deck);
      meta.status = "ready";
      await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

      if (YAML.stringify(tr.grounded.deck) !== critiqued) {
        const drawn = await optionalPass("post-critic render", async () => {
          const r = await render({ deckFile, themeName });
          return preview(r.outFile, { dpi: 110 });
        });
        if (drawn) {
          recut = {
            slides: drawn.pages.map((f) => path.basename(f)),
            thumbs: drawn.thumbs.map((f) => path.basename(f)),
          };
        }
      }
    }
  }

  await rm(path.join(dir, RUN_FILE), { force: true });

  return {
    slug,
    deck: tr.grounded.deck,
    plan,
    slides: recut?.slides ?? criticReport?.slides ?? p.pages.map((f) => path.basename(f)),
    thumbs: recut?.thumbs ?? criticReport?.thumbs ?? p.thumbs.map((f) => path.basename(f)),
    problems: [
      ...tr.grounded.problems,
      ...(write?.problems ?? []),
      ...(coherence?.problems ?? []),
      ...qualityProbs,
      ...imageProbs,
      ...passSkips,
    ],
    skipped: write?.skipped ?? [],
    stats: write?.stats ?? {},
    images: imageResult
      ? { supplied: imageResult.supplied, skipped: imageResult.skipped, credits: imageResult.credits }
      : null,
    critic: criticReport,
    trimmed: tr.trimmed,
    coherence: coherence ? { findings: coherence.findings.length, fixed: coherence.findings.length > 0 } : { findings: 0, fixed: false },
    quality: { findings: qualityFindings.length },
  };
}

export async function generateFromPlan({
  slug, plan, theme = null, model, identity, onProgress, signal, critic = false,
}) {
  const write = await writeDeckContent({ slug, plan, theme, model, identity, onProgress, signal, resume: false });
  return finalizeDeck({ slug, theme, model, identity, onProgress, signal, critic, write });
}

export async function resumeGeneration({
  slug, theme = null, model, identity, onProgress, signal, critic = false,
}) {
  const dir = path.join(DECKS, slug);
  let deck = null;
  try {
    deck = YAML.parse(await readFile(path.join(dir, "deck.yaml"), "utf8"));
  } catch { /* nothing written yet */ }
  let plan = null;
  try {
    plan = YAML.parse(await readFile(path.join(dir, "plan.yaml"), "utf8"));
  } catch { /* no approved outline */ }
  if (!plan?.slides?.length) {
    try {
      plan = JSON.parse(await readFile(path.join(dir, RUN_FILE), "utf8"))?.plan ?? null;
    } catch { /* no checkpoint either */ }
  }
  if (!plan?.slides?.length) throw new Error("no approved outline (plan.yaml) to resume from");

  const written = deck?.slides?.length ?? 0;
  if (written >= plan.slides.length) {
    onProgress?.({ status: "writing", phase: "done", slides: written });
    return finalizeDeck({ slug, theme, model, identity, onProgress, signal, critic });
  }

  const write = await writeDeckContent({ slug, plan, theme, model, identity, onProgress, signal, resume: true });
  return finalizeDeck({ slug, theme, model, identity, onProgress, signal, critic, write });
}

export async function generationStatus(slug) {
  const dir = path.join(DECKS, slug);
  let deck = null;
  let plan = null;
  let run = null;
  let meta = null;
  try {
    deck = YAML.parse(await readFile(path.join(dir, "deck.yaml"), "utf8"));
  } catch { /* no deck yet */ }
  try {
    plan = YAML.parse(await readFile(path.join(dir, "plan.yaml"), "utf8"));
  } catch { /* no outline */ }
  try {
    run = JSON.parse(await readFile(path.join(dir, RUN_FILE), "utf8"));
  } catch { /* no checkpoint */ }
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8"));
  } catch { /* no meta — treated as unfinalised below */ }
  const written = deck?.slides?.length ?? 0;
  const total = run?.total ?? plan?.slides?.length ?? 0;
  const complete = total > 0 && written >= total;
  const finalized = meta?.status === "ready";
  return {
    written,
    total,
    complete,
    finalized,
    unfinalised: complete && !finalized,
    partial: written > 0 && total > 0 && written < total,
    status: run?.status ?? null,
  };
}

export async function sweepDensity({
  slug, density = "balanced", theme = null, model, onProgress, signal,
}) {
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");
  const deck = YAML.parse(await readFile(deckFile, "utf8"));

  const themeName = theme ?? deck.theme ?? "warm-humanist";
  const themeObj = await loadTheme(themeName);
  let researchText = "";
  try {
    researchText = await readFile(path.join(dir, "research", "notes.md"), "utf8");
  } catch { /* no research pass */ }

  onProgress?.({ status: "sweeping", density });
  const label = await groundNotesLabel(dir);
  const r = await sweepDeck({
    deck,
    density,
    theme: themeObj,
    research: excerptResearch(researchText, await researchExcerptCap({ model })),
    model,
    signal,
    onProgress: (p) => onProgress?.({ status: "sweeping", ...p }),
  });

  const grounded = groundDeck(r.deck, researchText, { label });
  await writeFile(deckFile, YAML.stringify(grounded.notes), "utf8");

  let repaired = grounded.notes;
  {
    onProgress?.({ status: "field_length_checking" });
    const fix = await fieldLengthPass({
      deck: grounded.notes,
      deckDir: dir,
      research: excerptResearch(researchText, await researchExcerptCap({ model })),
      model,
      signal,
      onProgress: (p) => onProgress?.({ status: "field_length", ...p }),
    });
    if (fix.repaired.length) {
      repaired = fix.deck;
      await writeFile(deckFile, YAML.stringify(repaired), "utf8");
    }
  }
  const trimRes = await trimDeckToFit({
    deck: repaired,
    themeName,
    deckDir: dir,
    signal,
  });
  let finalGrounded = groundDeck(trimRes.deck, researchText, { label });

  let coherence = null;
  {
    onProgress?.({ status: "coherence_checking" });
    const pass = await coherencePass({
      deck: finalGrounded.notes,
      sections: deck.sections ?? [],
      model,
      signal,
      onProgress: (e) => onProgress?.({ status: "coherence", ...e }),
    });
    coherence = pass;
    if (pass.findings.length) {
      finalGrounded = groundDeck(pass.deck, researchText, { label });
      const retrim = await trimDeckToFit({ deck: finalGrounded.notes, themeName, deckDir: dir, signal });
      finalGrounded = groundDeck(retrim.deck, researchText, { label });
    }
  }
  await writeFile(deckFile, YAML.stringify(finalGrounded.notes), "utf8");

  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* no meta */ }
  meta.status = "ready";
  meta.density = density;
  meta.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  onProgress?.({ status: "rendering" });
  const rendered = await render({ deckFile, themeName });
  const p = await preview(rendered.outFile, { dpi: 110 });
  const base = `/api/decks/${slug}/preview`;

  return {
    slug,
    deck: finalGrounded.notes,
    density,
    slides: p.pages.map((f) => `${base}/${path.basename(f)}`),
    thumbs: p.thumbs.map((f) => `${base}/thumbs/${path.basename(f)}`),
    problems: [...(r.problems ?? []), ...(rendered.problems ?? []), ...finalGrounded.problems, ...(coherence?.problems ?? [])],
    swept: r.swept ?? [],
    trimmed: trimRes.trimmed,
    coherence: coherence ? { findings: coherence.findings.length, fixed: coherence.findings.length > 0 } : { findings: 0, fixed: false },
  };
}

export async function insertDeckSlide({
  slug, index, type = null, purpose = null, model, onProgress, signal,
}) {
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");
  const planFile = path.join(dir, "plan.yaml");
  const deck = YAML.parse(await readFile(deckFile, "utf8"));
  const themeName = deck.theme ?? "warm-humanist";
  const themeObj = await loadTheme(themeName);

  let plan = null;
  try { plan = YAML.parse(await readFile(planFile, "utf8")); } catch { /* deck without a stored plan */ }

  let researchText = "";
  try {
    researchText = await readFile(path.join(dir, "research", "notes.md"), "utf8");
  } catch { /* no research pass */ }

  onProgress?.({ status: "writing", index: Number(index) + 1, total: (deck.slides?.length ?? 0) + 1 });
  const r = await insertSlide({
    deck,
    plan,
    after: Number(index),
    theme: themeObj,
    research: excerptResearch(researchText, await researchExcerptCap({ model })),
    type,
    purpose,
    model,
    signal,
  });

  const grounded = groundDeck(r.deck, researchText, { label: await groundNotesLabel(dir) });
  await writeFile(deckFile, YAML.stringify(grounded.notes), "utf8");

  if (plan?.slides?.length) {
    const entry = { type: r.slide.type, purpose: r.spec.purpose };
    if (r.spec.section != null) entry.section = r.spec.section;
    plan.slides = [...plan.slides.slice(0, r.index), entry, ...plan.slides.slice(r.index)];
    await writeFile(planFile, YAML.stringify(plan), "utf8");
  }

  onProgress?.({ status: "rendering" });
  const rendered = await render({ deckFile, themeName });
  const p = await preview(rendered.outFile, { dpi: 110 });
  const base = `/api/decks/${slug}/preview`;

  return {
    slug,
    index: r.index,
    slide: r.slide,
    slides: p.pages.map((f) => `${base}/${path.basename(f)}`),
    thumbs: p.thumbs.map((f) => `${base}/thumbs/${path.basename(f)}`),
    problems: [...(rendered.problems ?? []), ...grounded.problems],
  };
}

export async function convertSlideType({
  slug, index, type, model, onProgress, signal,
}) {
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");
  const deck = YAML.parse(await readFile(deckFile, "utf8"));
  const themeName = deck.theme ?? "warm-humanist";
  const themeObj = await loadTheme(themeName);

  let researchText = "";
  try {
    researchText = await readFile(path.join(dir, "research", "notes.md"), "utf8");
  } catch { /* no research pass */ }

  onProgress?.({ status: "converting" });
  const r = await convertSlide({
    deck,
    index: Number(index),
    targetType: type,
    theme: themeObj,
    research: excerptResearch(researchText, await researchExcerptCap({ model })),
    model,
    signal,
  });

  if (!r.slide) {
    throw new Error(`Could not convert slide ${index + 1} to "${type}" — kept the original.`);
  }

  const nextDeck = { ...deck, slides: deck.slides.map((s, i) => (i === Number(index) ? r.slide : s)) };
  const grounded = groundDeck(nextDeck, researchText, { label: await groundNotesLabel(dir) });
  await writeFile(deckFile, YAML.stringify(grounded.notes), "utf8");

  onProgress?.({ status: "rendering" });
  const rendered = await render({ deckFile, themeName });
  const p = await preview(rendered.outFile, { dpi: 110 });
  const base = `/api/decks/${slug}/preview`;

  return {
    slug,
    index: Number(index),
    slide: r.slide,
    method: r.method,
    slides: p.pages.map((f) => `${base}/${path.basename(f)}`),
    thumbs: p.thumbs.map((f) => `${base}/thumbs/${path.basename(f)}`),
    problems: [...(rendered.problems ?? []), ...grounded.problems],
  };
}
export async function cloneDeck({ slug }) {
  const src = path.join(DECKS, slug);
  let source = {};
  try {
    source = YAML.parse(await readFile(path.join(src, "meta.yaml"), "utf8")) ?? {};
  } catch { /* folder predates meta */ }
  const dest = await uniqueSlug(`${slug}-copy`, source.owner ?? null);
  const ddir = path.join(DECKS, dest);
  await mkdir(ddir, { recursive: true });
  for (const f of ["deck.yaml", "plan.yaml", "meta.yaml", "report.yaml"]) {
    try {
      await copyFile(path.join(src, f), path.join(ddir, f));
    } catch { /* optional file */ }
  }
  try {
    await cp(path.join(src, "research"), path.join(ddir, "research"), { recursive: true });
  } catch { /* no research pass */ }
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(ddir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* copy may predate meta */ }
  meta.slug = dest;
  meta.updatedAt = new Date().toISOString();
  await writeFile(path.join(ddir, "meta.yaml"), YAML.stringify(meta), "utf8");
  return { slug: dest };
}

const USAGE = `Usage:
  node src/ai/pipeline.js new "<brief>" [--theme <name>] [--sources <url> ...]
                        [--research] [--papers] [--upload <file.md|docx|pdf|txt>]
                        [--max-slides <n>] [--slides-per-member <n>]
                        [--density sparse|balanced|dense] [--model <id>]
                        [--images]
  node src/ai/pipeline.js generate <slug> [--theme <name>] [--model <id>]
                        [--plan <plan.yaml>] [--no-render] [--critic] [--resume]
  node src/ai/pipeline.js finalize <slug> [--theme <name>] [--model <id>] [--images]
  node src/ai/pipeline.js chat <slug> "<instruction>" [--model <id>] [--no-render]
  node src/ai/pipeline.js report <slug> [--generate [--depth full|brief]]
                        [--donor <path>] [--no-toc] [--no-render]
  node src/ai/pipeline.js report-new "<brief>" [--depth full|brief]
                        [--sources <url> ...] [--upload <file.md|docx|pdf|txt>] [--model <id>]
  node src/ai/pipeline.js deck-from-report <slug> [--theme <name>] [--model <id>]
  node src/ai/pipeline.js script <slug> [--slide <n>] [--model <id>]

  new       brief → outline, saved to decks/<slug>/plan.yaml
            --upload  upload-only mode: the given document becomes research/
                      notes.md and is the ONLY content source — no web search
  generate  approved outline → deck.yaml, rendered and rasterised
            --critic  also run the vision critic loop: detect visual defects in
                      the rendered slides and fix them via a content turn
            --resume  continue a dropped generation from its checkpoint
                      (deck.yaml written so far; finalizes when complete)
  finalize  run the post-write pass on a complete-but-unfinalised deck:
            grounding + field-length rewrite + trim + coherence + render, then
            flip meta.status to ready
  chat      one conversational turn against an existing deck: edits deck.yaml,
            maintains the deck's thread (chat.jsonl, decisions.md) and renders
  report    draw decks/<slug>/report.yaml on the institutional .docx donor
            (gitignored reference/) → decks/<slug>/out/report.docx
            --generate  first generate report.yaml from the deck's shared
                        research/ and approved plan.yaml (the report's half of
                        the submission workflow: one brief → deck + report)
            --depth     full or brief report prose (default full; remembered
                        in meta.yaml for later runs without --depth)
            --no-render  generate report.yaml only, skip drawing the .docx
            --no-toc  skip the table of contents (and the LibreOffice pass)
  report-new  standalone report — brief → research → report.yaml → .docx,
              with NO deck. The reverse flow's other door.
              --upload  upload-only mode, as above
  deck-from-report  plan a companion deck from an existing decks/<slug>/report.yaml
              (and its shared research) → decks/<slug>/plan.yaml for the outline gate
  script    generate decks/<slug>/script.md — the words each presenter says aloud
              for every slide, grounded in the deck's research (one model call
              per slide). --slide <n> regenerates only that slide's words,
              counting from 1.

Examples:
  node src/ai/pipeline.js new "Ray tracing in 2026" --research --theme warm-humanist
  node src/ai/pipeline.js new "Solar water pumping" --upload notes.docx --theme warm-humanist
  node src/ai/pipeline.js generate raytracing-ai --critic
  node src/ai/pipeline.js chat raytracing-ai "Keep every slide under 12 words per line."
  node src/ai/pipeline.js report-new "Green hydrogen in 2026" --depth full
  node src/ai/pipeline.js deck-from-report green-hydrogen-production-how-electrolysis-t-2
`;

function parseArgs(argv) {
  const cmd = argv[0];
  const opts = { _: [], sources: [], render: true };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--theme") opts.theme = argv[++i];
    else if (a === "--max-slides") opts.maxSlides = Number(argv[++i]);
    else if (a === "--slides-per-member") opts.slidesPerMember = Number(argv[++i]);
    else if (a === "--density") opts.density = argv[++i];
    else if (a === "--model") opts.model = argv[++i];
    else if (a === "--plan") opts.plan = argv[++i];
    else if (a === "--donor") opts.donor = argv[++i];
    else if (a === "--sources") {
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.sources.push(argv[++i]);
    }
    else if (a === "--upload") opts.upload = argv[++i];
    else if (a === "--research") opts.research = true;
    else if (a === "--images") opts.imageSupply = "auto";
    else if (a === "--papers") opts.papers = true;
    else if (a === "--upload") opts.upload = argv[++i];
    else if (a === "--generate") opts.generate = true;
    else if (a === "--slide") opts.slide = argv[++i];
    else if (a === "--depth") opts.depth = argv[++i];
    else if (a === "--no-render") opts.render = false;
    else if (a === "--no-toc") opts.toc = false;
    else if (a === "--critic") opts.critic = true;
    else if (a === "--resume") opts.resume = true;
    else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
    else opts._.push(a);
  }
  opts.brief = opts._[0];
  opts.slug = opts._[0];
  opts.instruction = opts._[1];
  return { cmd, opts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  const progress = (p) => process.stderr.write(`  ${formatProgress(p)}\n`);

  const uploadFromFile = async (p) => {
    const buf = await readFile(p);
    const { text, name, ext, words } = await ingestUpload(buf, { name: path.basename(p) });
    return { name, text, ext, words };
  };

  try {
    if (cmd === "new") {
      const upload = opts.upload ? await uploadFromFile(opts.upload) : null;
      const r = await createDeck({
        ...opts,
        researchSource: upload ? "upload" : null,
        upload,
        onProgress: progress,
      });
      process.stdout.write(`planned decks/${r.slug}/plan.yaml — ${r.plan.slides.length} slides\n`);
      process.stdout.write(YAML.stringify(r.plan));
    } else if (cmd === "generate") {
      if (!opts.slug) { console.error(USAGE); process.exit(2); }
      let r;
      if (opts.resume) {
        r = await resumeGeneration({
          slug: opts.slug, theme: opts.theme, model: opts.model,
          onProgress: progress, critic: opts.critic,
        });
      } else {
        const planFile = opts.plan ?? path.join(DECKS, opts.slug, "plan.yaml");
        const plan = YAML.parse(await readFile(planFile, "utf8"));
        r = await generateFromPlan({
          slug: opts.slug, plan, theme: opts.theme, model: opts.model,
          onProgress: progress, critic: opts.critic,
        });
      }
      process.stdout.write(`ready decks/${opts.slug}/deck.yaml — ${r.deck.slides.length} slides`);
      if (r.skipped.length) process.stdout.write(`, ${r.skipped.length} skipped`);
      process.stdout.write("\n");
      for (const s of r.skipped) process.stdout.write(`  skipped [${s.index}] ${s.type}: ${s.reason}\n`);
      for (const p of r.problems ?? []) process.stdout.write(`  ! ${p}\n`);
      if (r.critic) {
        process.stdout.write("critic:\n");
        for (const rd of r.critic.rounds) {
          if (rd.clean) { process.stdout.write(`  round ${rd.round + 1}: clean\n`); continue; }
          process.stdout.write(`  round ${rd.round + 1}: ${rd.findings.length} finding(s)\n`);
          for (const f of rd.findings) {
            process.stdout.write(`    slide ${f.slide} ${f.kind}: ${f.detail}\n`);
          }
          if (rd.fixFailed) process.stdout.write(`    fix failed: ${rd.fixFailed.join("; ")}\n`);
          else if (rd.fixed) process.stdout.write(`    fixed: ${(rd.changes ?? []).join("; ")}\n`);
          if (rd.unfixed) process.stdout.write(`    NOT fixed: ${rd.unfixed.map((f) => `slide ${f.slide} ${f.kind}`).join(", ")}\n`);
        }
      }
    } else if (cmd === "finalize") {
      if (!opts.slug) { console.error(USAGE); process.exit(2); }
      const r = await finalizeDeck({
        slug: opts.slug, theme: opts.theme, model: opts.model,
        onProgress: progress, critic: opts.critic, imageSupply: opts.imageSupply ?? null,
      });
      process.stdout.write(`finalised decks/${opts.slug}/deck.yaml — ${r.deck.slides.length} slides\n`);
      if (r.images?.supplied.length) {
        process.stdout.write(`  ${r.images.supplied.length} image(s) supplied — see decks/${opts.slug}/CREDITS.md\n`);
        for (const im of r.images.supplied) {
          process.stdout.write(`    slide ${im.index + 1} ${im.from} -> ${im.type}: ${im.rel}\n`);
        }
      }
      for (const p of r.problems ?? []) process.stdout.write(`  ! ${p}\n`);
    } else if (cmd === "chat") {
      if (!opts.slug || !opts.instruction) { console.error(USAGE); process.exit(2); }
      const r = await runChatTurn({
        slug: opts.slug,
        instruction: opts.instruction,
        model: opts.model,
        render: opts.render,
        onProgress: progress,
      });
      if (!r.ok) {
        process.stderr.write(`turn failed: ${r.errors?.join("; ") ?? "unknown"}\n`);
        process.exit(1);
      }
      process.stdout.write(`applied ${r.changes.length} change(s) to decks/${opts.slug}/deck.yaml\n`);
      for (const c of r.changes) process.stdout.write(`  ${c}\n`);
      if (r.decisions?.length) process.stdout.write(`promoted: ${r.decisions.join("; ")}\n`);
      if (r.summary) process.stdout.write(`summary: ${r.summary}\n`);
    } else if (cmd === "report") {
      if (!opts.slug) { console.error(USAGE); process.exit(2); }
      const deckDir = path.join(DECKS, opts.slug);
      const reportFile = path.join(deckDir, "report.yaml");

      if (opts.generate) {
        let meta = {};
        try { meta = YAML.parse(await readFile(path.join(deckDir, "meta.yaml"), "utf8")) ?? {}; } catch { /* optional */ }
        const depth = opts.depth ?? meta.reportDepth ?? "full";
        const g = await generateReport({ slug: opts.slug, depth, model: opts.model, onProgress: progress });
        process.stdout.write(`report content decks/${opts.slug}/report.yaml — ${g.sections.join(" → ")} (${g.depth} depth)\n`);
        for (const s of g.skipped) process.stdout.write(`  skipped [${s.section}]: ${s.reason}\n`);
        if (depth !== meta.reportDepth) {
          meta.reportDepth = depth;
          await writeFile(path.join(deckDir, "meta.yaml"), YAML.stringify(meta), "utf8");
        }
        if (opts.render === false) { process.exit(0); }
      } else {
        try { await access(reportFile); }
        catch {
          process.stderr.write(`no decks/${opts.slug}/report.yaml — generate the report content first: forge report <slug> --generate\n`);
          process.exit(2);
        }
      }
      const r = await renderReport({ reportFile, donor: opts.donor, toc: opts.toc !== false });
      process.stdout.write(`report decks/${opts.slug}/out/report.docx — ${r.sections.join(" → ")}\n`);
      for (const p of r.problems) process.stderr.write(`  ! ${p}\n`);
    } else if (cmd === "report-new") {
      if (!opts.brief) { console.error(USAGE); process.exit(2); }
      const upload = opts.upload ? await uploadFromFile(opts.upload) : null;
      const r = await createReport({
        brief: opts.brief, sources: opts.sources, research: true,
        researchSource: upload ? "upload" : null, upload,
        depth: opts.depth ?? "full", model: opts.model, onProgress: progress,
      });
      process.stdout.write(`report decks/${r.slug}/out/report.docx — ${r.sections.join(" → ")} (standalone)\n`);
      for (const s of r.skipped) process.stdout.write(`  skipped [${s.section}]: ${s.reason}\n`);
    } else if (cmd === "deck-from-report") {
      if (!opts.slug) { console.error(USAGE); process.exit(2); }
      const r = await createDeckFromReport({
        slug: opts.slug, theme: opts.theme, model: opts.model, onProgress: progress,
      });
      process.stdout.write(`planned decks/${opts.slug}/plan.yaml — ${r.plan.slides.length} slides (from report)\n`);
      process.stdout.write(YAML.stringify(r.plan));
    } else if (cmd === "script") {
      if (!opts.slug) { console.error(USAGE); process.exit(2); }
      const slideArg = opts.slide != null ? Number(opts.slide) : null;
      if (slideArg != null && (!Number.isInteger(slideArg) || slideArg < 1)) {
        console.error("--slide takes a slide NUMBER, counting from 1.");
        process.exit(2);
      }
      const r = await generateScript({
        slug: opts.slug, model: opts.model, onProgress: progress,
        index: slideArg != null ? slideArg - 1 : null,
      });
      process.stdout.write(`script decks/${opts.slug}/script.md — ${r.slides} slides, ${r.regenerated.length} written\n`);
      for (const p of r.problems) process.stdout.write(`  ! ${p}\n`);
    } else {
      console.error(USAGE);
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}
