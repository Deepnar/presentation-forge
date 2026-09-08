import { mkdir } from "node:fs/promises";
import path from "node:path";
import { render } from "./render.js";
import { libreofficeToPdf } from "./preview.js";

function flatten(slide) {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string") out.push({ kind: "item", text: v });
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  const { notes, cites, presenter, type, section, headline, standfirst, ...rest } = slide;
  if (headline) out.push({ kind: "headline", text: headline });
  if (standfirst) out.push({ kind: "standfirst", text: standfirst });
  walk(rest);
  return out;
}

export function deckToMarkdown(deck) {
  const lines = [`# ${deck.title ?? "Untitled deck"}`];
  if (deck.subtitle) lines.push(`\n*${deck.subtitle}*`);
  if (deck.sections?.length) {
    lines.push("", "**Sections:** " + deck.sections.join(" · "));
  }
  deck.slides?.forEach((slide, i) => {
    const t = slide.type ?? "slide";
    const headline = slide.headline ?? slide.quote ?? slide.title ?? "";
    lines.push("", `---`, `## ${i + 1}. ${t}${headline ? ` — ${headline}` : ""}`);
    if (slide.standfirst) lines.push(`*${slide.standfirst}*`);
    if (slide.speaker_note) lines.push(`> ${slide.speaker_note}`);
    const content = flatten(slide).filter((x) => x.kind !== "headline" && x.kind !== "standfirst");
    if (content.length) lines.push("", content.map((c) => `- ${c.text}`).join("\n"));
  });
  return lines.join("\n") + "\n";
}

export async function exportDeck({ deckFile, format = "pdf", themeName }) {
  const dir = path.dirname(deckFile);
  const outDir = path.join(dir, "out");
  await mkdir(outDir, { recursive: true });

  if (format === "markdown") {
    const { loadDeck } = await import("./validate.js");
    const deck = await loadDeck(deckFile);
    const md = deckToMarkdown(deck);
    const outFile = path.join(outDir, "deck.md");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outFile, md, "utf8");
    return { outFile, format };
  }

  if (format !== "pdf") throw new Error(`Unknown export format "${format}" — use pdf or markdown`);

  const r = await render({ deckFile, themeName });
  const pdfOut = path.join(outDir, "pdf");
  const converted = await libreofficeToPdf(r.outFile, { outDir: pdfOut });
  const outFile = path.join(outDir, "deck.pdf");
  const { rename } = await import("node:fs/promises");
  await rename(converted, outFile);
  return { outFile, format, pptx: r.outFile };
}
