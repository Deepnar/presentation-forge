import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { ingestUpload } from "./upload.js";
import { runChatTurn } from "./chat.js";
import { generateReport } from "./report.js";
import { generateScript } from "./script.js";
import { renderReport } from "../report.js";
import {
  createDeck,
  createReport,
  createDeckFromReport,
  finalizeDeck,
  formatProgress,
  generateFromPlan,
  resumeGeneration,
} from "./pipeline.js";

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

export async function runCli(argv = process.argv.slice(2)) {
  const { cmd, opts } = parseArgs(argv);
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
