import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import YAML from "yaml";
import { render } from "../src/render.js";
import { numericFactCount, dataAffinityNote, CHART_KINDS } from "../src/ai/catalog.js";

test("numericFactCount counts distinct numeric facts, not repetitions", () => {
  assert.equal(numericFactCount(""), 0);
  assert.equal(numericFactCount("no figures here at all"), 0);
  // 180 GW repeated three times counts once; 4.2% and 1.23 are separate facts.
  const notes =
    "Capacity grows 180 GW by 2030. 180 GW is the ceiling. At 4.2% the return beats inflation. The voltage is 1.23 V.";
  assert.equal(numericFactCount(notes), 4);
});

test("dataAffinityNote is silent below two numeric facts and names the kinds above", () => {
  assert.equal(dataAffinityNote("a brief with no numbers in it"), null);
  assert.equal(dataAffinityNote("only one fact: 42% uptake"), null);
  const note = dataAffinityNote("Two facts: 180 GW by 2030 and 4.2% annual growth.");
  assert.ok(note, "two facts must trigger the note");
  assert.match(note, /CHART/);
  for (const kind of CHART_KINDS) assert.ok(note.includes(kind), `note names the ${kind} kind`);
});

/** Render a one-slide chart deck and return the raw chart XML from the pptx. */
async function chartXml({ kind, series = 2 }) {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-chart-"));
  const deck = {
    title: "Chart regression",
    theme: "warm-humanist",
    sections: ["Data"],
    slides: [
      {
        type: "chart",
        headline: "Contribution by source",
        chart: {
          kind,
          categories: ["2024", "2025", "2026"],
          series: Array.from({ length: series }, (_, i) => ({
            name: `Series ${i}`,
            values: [10 + i, 20 + i, 15 + i],
          })),
        },
      },
    ],
  };
  const deckFile = path.join(dir, "deck.yaml");
  await writeFile(deckFile, YAML.stringify(deck), "utf8");
  try {
    const r = await render({ deckFile, themeName: "warm-humanist", deckDir: dir });
    assert.equal(r.problems.length, 0, "chart must render without problems");
    const zip = await JSZip.loadAsync(await readFile(r.outFile));
    const chartEntries = Object.keys(zip.files).filter((f) => f.startsWith("ppt/charts/") && f.endsWith(".xml"));
    assert.ok(chartEntries.length, "the pptx must contain a chart part");
    const xml = await zip.file(chartEntries[0]).async("string");
    return xml;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a stacked-bar chart writes OOXML grouping stacked, not clustered", async () => {
  const xml = await chartXml({ kind: "stacked-bar" });
  assert.match(xml, /<c:grouping val="stacked"\/>/, "stacked-bar must group as stacked");
});

test("a plain bar chart keeps the default clustered grouping", async () => {
  const xml = await chartXml({ kind: "bar" });
  assert.match(xml, /<c:grouping val="clustered"\/>/, "bar stays clustered by default");
});
