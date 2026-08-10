import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS, CONFIG } from "../paths.js";
import { researchQuery, fetchPage } from "../search.js";
import { planDeck, generateDeck } from "./generate.js";
import { loadTheme } from "../theme.js";
import { render } from "../render.js";
import { preview } from "../preview.js";

/**
 * Orchestration shared by the CLI and the API: creating a deck from a brief and
 * generating it from an approved outline. The server is a transport over this,
 * so anything the UI can do the CLI can do headless.
 *
 * A deck has a lifecycle: `planning` (folder + meta + plan only) → `ready`
 * (deck.yaml exists). Only ready decks appear in the deck list; the outline
 * gate is the boundary between the two.
 */

export async function loadIdentity() {
  try {
    return YAML.parse(await readFile(path.join(CONFIG, "identity.yaml"), "utf8")) ?? {};
  } catch {
    return YAML.parse(await readFile(path.join(CONFIG, "identity.example.yaml"), "utf8")) ?? {};
  }
}

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
 * drives a metasearch query. Returns text for the model plus a sources list.
 */
export async function runResearch(brief, sources = []) {
  let out = [];
  if (sources.length) {
    const pages = await Promise.all(sources.map((url) => fetchPage(url)));
    out = pages.filter((p) => p.ok);
  } else if (brief?.trim()) {
    const r = await researchQuery(brief.trim());
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
  model, identity, onProgress, signal,
}) {
  if (!brief?.trim()) throw new Error("brief is required");

  const slug = await uniqueSlug(brief);
  const dir = path.join(DECKS, slug);
  await mkdir(dir, { recursive: true });

  const meta = {
    slug, brief, sources, research, theme, maxSlides,
    status: "planning",
    createdAt: new Date().toISOString(),
  };
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  let researchText = "";
  if (research) {
    onProgress?.({ status: "researching" });
    const r = await runResearch(brief, sources);
    if (r.text) {
      const rdir = path.join(dir, "research");
      await mkdir(rdir, { recursive: true });
      await writeFile(path.join(rdir, "notes.md"), r.text, "utf8");
      await writeFile(path.join(rdir, "sources.json"), JSON.stringify(r.sources, null, 2), "utf8");
      researchText = r.text;
    }
  }

  onProgress?.({ status: "planning" });
  const identityObj = identity ?? (await loadIdentity());
  const themeObj = theme ? await loadTheme(theme) : undefined;
  const { plan, stats } = await planDeck({
    brief: brief.trim(), theme: themeObj, identity: identityObj,
    research: researchText, maxSlides, model, signal,
  });

  if (!plan.slides?.length) throw new Error("The model produced no outline.");

  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(plan), "utf8");
  meta.status = "planned";
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  return { slug, plan, stats };
}

/**
 * Stage 2 — approved outline → deck. Writes deck.yaml, then renders and
 * rasterises so the result is inspectable immediately, not after a human opens
 * PowerPoint.
 */
export async function generateFromPlan({
  slug, plan, theme = null, model, identity, onProgress, signal,
}) {
  const dir = path.join(DECKS, slug);
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* planned deck written before meta existed — carry on */ }

  const identityObj = identity ?? (await loadIdentity());
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
    research: researchText,
    maxSlides: meta.maxSlides ?? 24,
    model,
    signal,
    onProgress: (p) => onProgress?.({ status: "writing", ...p }),
  });

  if (!res.ok || !res.deck) {
    throw new Error(res.errors?.join("; ") || "Generation failed");
  }

  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(res.deck), "utf8");
  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(res.plan), "utf8");

  meta.status = "ready";
  meta.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");

  onProgress?.({ status: "rendering" });
  const r = await render({ deckFile: path.join(dir, "deck.yaml"), themeName: res.deck.theme });
  const p = await preview(r.outFile, { dpi: 110 });

  return {
    slug,
    deck: res.deck,
    plan: res.plan,
    slides: p.pages.map((f) => path.basename(f)),
    thumbs: p.thumbs.map((f) => path.basename(f)),
    problems: r.problems ?? [],
    skipped: res.skipped ?? [],
    stats: res.stats,
  };
}

/* --------------------------------------------------------------------- CLI */

const USAGE = `
Usage:
  node src/ai/pipeline.js new "<brief>" [--theme <name>] [--sources <url> ...]
                        [--research] [--max-slides <n>] [--model <id>]
  node src/ai/pipeline.js generate <slug> [--theme <name>] [--model <id>]
                        [--plan <plan.yaml>] [--no-render]

  new       brief → outline, saved to decks/<slug>/plan.yaml
  generate  approved outline → deck.yaml, rendered and rasterised

Examples:
  node src/ai/pipeline.js new "Ray tracing in 2026" --research --theme warm-humanist
  node src/ai/pipeline.js generate raytracing-ai
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
    else if (a === "--sources") {
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.sources.push(argv[++i]);
    } else if (a === "--research") opts.research = true;
    else if (a === "--no-render") opts.render = false;
    else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
    else opts._.push(a);
  }
  opts.brief = opts._[0];
  opts.slug = opts._[0];
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
        slug: opts.slug, plan, theme: opts.theme, model: opts.model, onProgress: progress,
      });
      process.stdout.write(`ready decks/${opts.slug}/deck.yaml — ${r.deck.slides.length} slides`);
      if (r.skipped.length) process.stdout.write(`, ${r.skipped.length} skipped`);
      process.stdout.write("\n");
      for (const s of r.skipped) process.stdout.write(`  skipped [${s.index}] ${s.type}: ${s.reason}\n`);
    } else {
      console.error(USAGE);
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}
