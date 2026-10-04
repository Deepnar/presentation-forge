// Shared V2 slice fixture: one DeckIntent exercising all six recipes.
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";

export function sampleDeckIntent() {
  return {
    id: "slice-deck",
    title: "Solid-state batteries",
    audience: "Third-year materials class",
    objective: "Explain why solid-state cells matter",
    slides: [
      {
        id: "s1", purpose: "Open the talk", title: "Solid-state batteries",
        blocks: [{ id: "s1b1", kind: "text", text: "Why the next cell has no liquid inside" }],
        layoutHint: { recipe: "title" },
      },
      {
        id: "s2", purpose: "State the problem", title: "Liquid electrolytes leak",
        blocks: [{ id: "s2b1", kind: "list", items: ["Flammable organic solvents", "Dendrites pierce separators", "Narrow thermal window", "Aging steals capacity"] }],
        layoutHint: { recipe: "content" },
      },
      {
        id: "s3", purpose: "Compare chemistries", title: "Liquid vs solid",
        blocks: [
          { id: "s3left", kind: "text", label: "Liquid", text: "Mature and cheap" },
          { id: "s3right", kind: "text", label: "Solid", text: "Safe and dense" },
          { id: "s3v", kind: "callout", text: "Solid wins on safety" },
        ],
        layoutHint: { recipe: "comparison" },
      },
      {
        id: "s4", purpose: "Show the cell", title: "Inside the stack",
        blocks: [
          { id: "s4img", kind: "image", src: "", alt: "cell stack", caption: "Stack diagram" },
          { id: "s4body", kind: "list", items: ["Cathode composite layer", "Ceramic separator", "Lithium metal anode"] },
        ],
        layoutHint: { recipe: "media", mediaSide: "left" },
      },
      {
        id: "s5", purpose: "Report conductivity", title: "Conductivity by chemistry",
        blocks: [{
          id: "s5c", kind: "chart", chartKind: "bar",
          categories: ["Oxide", "Sulfide", "Polymer"],
          series: [{ name: "mS/cm", values: [1.2, 12.5, 0.4] }],
          caption: "Room temperature",
        }],
        layoutHint: { recipe: "chart" },
      },
      {
        id: "s6", purpose: "Explain the build", title: "How a cell is made",
        blocks: [
          { id: "s6a", kind: "text", label: "Mix", text: "Blend cathode powders" },
          { id: "s6b", kind: "text", label: "Press", text: "Cold-press the stack" },
          { id: "s6c", kind: "text", label: "Seal", text: "Hermetic packaging" },
        ],
        layoutHint: { recipe: "process" },
      },
    ],
  };
}

export function warmDesign() {
  return loadThemeDocument("warm-humanist").then((theme) => normalizeDesign({ theme, mode: "light" }));
}
