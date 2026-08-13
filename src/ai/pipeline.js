import { mkdir, readFile, writeFile, readdir, access, copyFile, cp } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { fetchPage } from "../search.js";
import { excerptResearch, deepResearch } from "./research.js";
import { planDeck, generateDeck } from "./generate.js";
import { critiqueDeck } from "./critic.js";
import { groundDeck } from "./grounding.js";
import { runChatTurn } from "./chat.js";
import { generateReport } from "./report.js";
import { loadIdentity, deepMerge } from "./identity.js";
import { loadTheme } from "../theme.js";
import { render } from "../render.js";
import { preview } from "../preview.js";
import { renderReport, REPORT_SECTIONS } from "../report.js";

/**
 * Orchestration shared by the CLI and the API: creating a deck from a brief and
 * generating it from an approved outline. The server is a transport over this,
 * so anything the UI can do the CLI can do headless.
 *
 * A deck has a lifecycle: `planning` (folder + meta + plan only) → `ready`
 * (deck.yaml exists). Only ready decks appear in the deck list; the outline
 * gate is the boundary between the two.
 */

export function slugify(text, max = 44) {
  const slug = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "deck";
}

export async function uniqueSlug(base) {
  const slug = slugify(base);
  const exists = new Set();
  try {
    for (const e of await readdir(DECKS, { withFileTypes: true })) {
      if (e.isDirectory()) exists.add(e.name);
    }
  } catch { /* no decks yet */ }
  if (!exists.has(slug)) return slug;
  let i = 2;
  while (exists.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}

/**
 * One research pass: explicit sources are fetched directly, otherwise the brief
 * drives a deep metasearch pass — several subtopic queries plus follow-ups on
 * the richest sources, so a deck and its report draw from more than one
 * search's top five. Returns text for the model plus a sources list.
 */
export async function runResearch(brief, sources = [], onProgress) {
  let out = [];
  if (sources.length) {
    const pages = await Promise.all(sources.map((url) => fetchPage(url)));
    out = pages.filter((p) => p.ok);
  } else if (brief?.trim()) {
    const r = await deepResearch(brief.trim(), { onProgress });
    out = r.pages;
  }
  return {
    text: out.map((s) => `## ${s.title}\n\n${s.text}`).join("\n\n"),
    sources: out.map(({ url, title, words }) => ({ url, title, words })),
  };
}

/**
 * Stage 1 — brief → outline. Saves meta.yaml and plan.yaml so a session can
 * come back to a planned deck, and the outline survives an interrupted browser.
 */
export async function createDeck({
  brief, sources = [], research = false, theme = null, maxSlides = 24,
  model, identity, owner, onProgress, signal,
}) {
  if (!brief?.trim()) throw new Error("brief is required");

  const slug = await uniqueSlug(brief);
  const dir = path.join(DECKS, slug);
  await mkdir(dir, { recursive: true });

  // The intake wizard's identity snapshot: what each deck used freezes into
  // meta.yaml (the renderer already merges meta over config/identity.yaml), and
  // planning sees the merged identity so the model knows the subject, guide and
  // team it is writing for.
  const snapshot = identity && typeof identity === "object"
    ? {
        academic: identity.academic ?? {},
        guide: identity.guide ?? {},
        team: identity.team ?? {},
        chrome: identity.chrome ?? {},
      }
    : {};

  const meta = {
    slug, brief, sources, research, theme, maxSlides,
    status: "planning",
    createdAt: new Date().toISOString(),
    // Per-user workspace: the owning account's email. Ownerless meta (legacy
    // decks, CLI runs) is a shared deck visible to every logged-in user.
    ...(owner ? { owner } : {}),
    ...snapshot,
  };
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  let researchText = "";
  // Supplied sources imply a research pass: a brief with sources but no
  // --research would otherwise silently skip research and later fail report
  // generation with "no research/notes.md" for a reason nothing explains.
  if (research || sources.length) {
    onProgress?.({ status: "researching" });
    const r = await runResearch(brief, sources, (p) => onProgress?.({ status: "researching", ...p }));
    if (r.text) {
      const rdir = path.join(dir, "research");
      await mkdir(rdir, { recursive: true });
      await writeFile(path.join(rdir, "notes.md"), r.text, "utf8");
      await writeFile(path.join(rdir, "sources.json"), JSON.stringify(r.sources, null, 2), "utf8");
      researchText = r.text;
    }
  }

  onProgress?.({ status: "planning" });
  const identityObj = deepMerge(await loadIdentity(), identity ?? {});
  const themeObj = theme ? await loadTheme(theme) : undefined;
  const { plan, stats } = await planDeck({
    brief: brief.trim(), theme: themeObj, identity: identityObj,
    research: excerptResearch(researchText), maxSlides, model, signal,
  });

  if (!plan.slides?.length) throw new Error("The model produced no outline.");

  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(plan), "utf8");
  meta.status = "planned";
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  return { slug, plan, stats };
}

/**
 * Standalone report — brief → research → report.yaml → .docx with NO deck.
 * The reverse of the deck pipeline: a report is the graded artefact, and there
 * is no outline gate because the fixed section order (the graded constant) is
 * the structure. Research is still shared: decks/<slug>/research/ holds the
 * notes, so a companion deck can later be generated from the same material.
 * Writes meta.yaml marked status "report" (no plan.yaml, no deck.yaml).
 */
export async function createReport({
  brief, sources = [], research = false, depth = "full",
  model, identity, owner, onProgress, signal,
}) {
  if (!brief?.trim()) throw new Error("brief is required");

  const slug = await uniqueSlug(brief);
  const dir = path.join(DECKS, slug);
  await mkdir(dir, { recursive: true });

  const snapshot = identity && typeof identity === "object"
    ? { academic: identity.academic ?? {}, guide: identity.guide ?? {}, team: identity.team ?? {}, chrome: identity.chrome ?? {} }
    : {};

  const meta = {
    slug, brief, sources, research, depth,
    status: "report",
    createdAt: new Date().toISOString(),
    ...(owner ? { owner } : {}),
    ...snapshot,
  };
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  // A standalone report always runs a research pass: the report generator
  // writes from research/notes.md, so a report with nothing to write from is a
  // contradiction. Sources ground the pass when given, otherwise the brief
  // drives a metasearch.
  onProgress?.({ status: "researching" });
  const r = await runResearch(brief, sources, (p) => onProgress?.({ status: "researching", ...p }));
  if (!r.text) throw new Error("Research produced nothing to write the report from.");
  const rdir = path.join(dir, "research");
  await mkdir(rdir, { recursive: true });
  await writeFile(path.join(rdir, "notes.md"), r.text, "utf8");
  await writeFile(path.join(rdir, "sources.json"), JSON.stringify(r.sources, null, 2), "utf8");

  // No plan.yaml for a standalone report — requirePlan: false lets the report
  // generator derive its structure from the brief and the fixed section order.
  const g = await generateReport({
    slug, depth, model, signal, onProgress, requirePlan: false,
  });

  // Render straight through so the .docx exists the moment the brief resolves.
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

/**
 * Deck-from-report — the reverse of deck → report. Given an existing
 * decks/<slug>/report.yaml (and its shared research), plan a companion deck
 * outline from the report's own sections, so the deck and report agree by
 * construction. The outline gate still applies: nothing renders until a human
 * approves, then generateFromPlan writes deck.yaml.
 */
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

  // The report IS the brief: its title and the section content describe the
  // deck's structure better than the original one-liner, so feed it wholesale.
  const brief = reportBrief(report);

  onProgress?.({ status: "planning" });
  const { plan, stats } = await planDeck({
    brief, theme: themeObj, identity: identityObj,
    research: excerptResearch(researchText), model, signal,
  });

  if (!plan.slides?.length) throw new Error("The model produced no outline.");

  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* no meta yet */ }
  meta.status = "planned";
  meta.brief = report.title ?? meta.brief ?? "";
  meta.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");
  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(plan), "utf8");

  return { slug, plan, stats };
}

/** The report's sections as a planning brief — title plus each section's prose. */
/** The report's sections as a planning brief — title plus each section's prose. */
function reportBrief(report) {
  const content = report?.content ?? {};
  const lines = [report?.title ?? ""];
  if (report?.subtitle) lines.push(report.subtitle);
  for (const name of REPORT_SECTIONS) {
    const sec = content[name];
    if (!sec || typeof sec !== "object") continue;
    const text = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])]
      .map((p) => String(p).trim()).filter(Boolean).join(" ");
    const excerpt = text.slice(0, 600);
    if (excerpt) lines.push(`\n${name}: ${excerpt}${text.length > 600 ? "…" : ""}`);
  }
  return lines.join("\n");
}

/**
 * Stage 2 — approved outline → deck. Writes deck.yaml, then renders and
 * rasterises so the result is inspectable immediately, not after a human opens
 * PowerPoint. With `critic`, the rendered slides are run through the vision
 * critic loop and the deck is re-rendered from whatever it fixes.
 */
export async function generateFromPlan({
  slug, plan, theme = null, model, identity, onProgress, signal, critic = false,
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

  onProgress?.({ status: "writing", phase: "planned", slides: plan.slides?.length ?? 0 });
  const res = await generateDeck({
    brief: meta.brief ?? plan.title ?? "",
    plan,
    theme: themeObj,
    identity: identityObj,
    research: excerptResearch(researchText),
    maxSlides: meta.maxSlides ?? 24,
    model,
    signal,
    onProgress: (p) => onProgress?.({ status: "writing", ...p }),
  });

  if (!res.ok || !res.deck) {
    throw new Error(res.errors?.join("; ") || "Generation failed");
  }

  // Ground the deck against its research before persisting. The writer was told
  // to derive stats from notes.md, and the writer is a model: anything it emits
  // that the research does not support is flagged into the slide's notes and
  // the problems list rather than silently shipped. The critic below may
  // rewrite deck.yaml, so grounding runs once more on its output.
  const groundOnce = (d) => {
    const g = groundDeck(d, researchText);
    return { deck: g.notes, problems: g.problems };
  };

  let grounded = groundOnce(res.deck);
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(grounded.deck), "utf8");
  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(res.plan), "utf8");

  meta.status = "ready";
  meta.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  onProgress?.({ status: "rendering" });
  const r = await render({ deckFile: path.join(dir, "deck.yaml"), themeName: res.deck.theme });
  const p = await preview(r.outFile, { dpi: 110 });

  let criticReport = null;
  if (critic) {
    criticReport = await critiqueDeck({
      slug,
      deck: grounded.deck,
      model,
      signal,
      onProgress: (e) => onProgress?.({ status: "critiquing", ...e }),
    });
    if (criticReport.deck) {
      grounded = groundOnce(criticReport.deck);
      await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(grounded.deck), "utf8");
      meta.status = "ready";
      await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");
    }
  }

  return {
    slug,
    deck: criticReport?.deck ?? grounded.deck,
    plan: res.plan,
    slides: criticReport?.slides ?? p.pages.map((f) => path.basename(f)),
    thumbs: criticReport?.thumbs ?? p.thumbs.map((f) => path.basename(f)),
    problems: [...(r.problems ?? []), ...grounded.problems],
    skipped: res.skipped ?? [],
    stats: res.stats,
    critic: criticReport,
  };
}

/**
 * Clone a deck under a new slug — the "iterate without fear" affordance. Every
 * content file (deck, plan, meta, report, research) copies across so the clone
 * is a fully independent deck; the meta's slug and timestamp are re-stamped so
 * the copy shows as its own entry.
 */
export async function cloneDeck({ slug }) {
  const src = path.join(DECKS, slug);
  const dest = await uniqueSlug(`${slug}-copy`);
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

/* --------------------------------------------------------------------- CLI */

const USAGE = `Usage:
  node src/ai/pipeline.js new "<brief>" [--theme <name>] [--sources <url> ...]
                        [--research] [--max-slides <n>] [--model <id>]
  node src/ai/pipeline.js generate <slug> [--theme <name>] [--model <id>]
                        [--plan <plan.yaml>] [--no-render] [--critic]
  node src/ai/pipeline.js chat <slug> "<instruction>" [--model <id>] [--no-render]
  node src/ai/pipeline.js report <slug> [--generate [--depth full|brief]]
                        [--donor <path>] [--no-toc] [--no-render]
  node src/ai/pipeline.js report-new "<brief>" [--depth full|brief]
                        [--sources <url> ...] [--model <id>]
  node src/ai/pipeline.js deck-from-report <slug> [--theme <name>] [--model <id>]

  new       brief → outline, saved to decks/<slug>/plan.yaml
  generate  approved outline → deck.yaml, rendered and rasterised
            --critic  also run the vision critic loop: detect visual defects in
                      the rendered slides and fix them via a content turn
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
  deck-from-report  plan a companion deck from an existing decks/<slug>/report.yaml
              (and its shared research) → decks/<slug>/plan.yaml for the outline gate

Examples:
  node src/ai/pipeline.js new "Ray tracing in 2026" --research --theme warm-humanist
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
    else if (a === "--model") opts.model = argv[++i];
    else if (a === "--plan") opts.plan = argv[++i];
    else if (a === "--donor") opts.donor = argv[++i];
    else if (a === "--sources") {
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.sources.push(argv[++i]);
    }     else if (a === "--research") opts.research = true;
    else if (a === "--generate") opts.generate = true;
    else if (a === "--depth") opts.depth = argv[++i];
    else if (a === "--no-render") opts.render = false;
    else if (a === "--no-toc") opts.toc = false;
    else if (a === "--critic") opts.critic = true;
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
  const progress = (p) => process.stderr.write(`  ${p.status}${p.index != null ? ` ${p.index + 1}/${p.total}` : ""}\n`);

  try {
    if (cmd === "new") {
      const r = await createDeck({ ...opts, onProgress: progress });
      process.stdout.write(`planned decks/${r.slug}/plan.yaml — ${r.plan.slides.length} slides\n`);
      process.stdout.write(YAML.stringify(r.plan));
    } else if (cmd === "generate") {
      if (!opts.slug) { console.error(USAGE); process.exit(2); }
      const planFile = opts.plan ?? path.join(DECKS, opts.slug, "plan.yaml");
      const plan = YAML.parse(await readFile(planFile, "utf8"));
      const r = await generateFromPlan({
        slug: opts.slug, plan, theme: opts.theme, model: opts.model,
        onProgress: progress, critic: opts.critic,
      });
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
      const r = await createReport({
        brief: opts.brief, sources: opts.sources, research: true,
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
    } else {
      console.error(USAGE);
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}
