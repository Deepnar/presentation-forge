import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import YAML from "yaml";
import { render } from "../src/render.js";
import { numericFactCount, dataAffinityNote, CHART_KINDS } from "../src/ai/catalog.js";
import { planDeck } from "../src/ai/generate.js";
import { validateDeck } from "../src/validate.js";

test("numericFactCount counts distinct numeric facts, not repetitions", () => {
  assert.equal(numericFactCount(""), 0);
  assert.equal(numericFactCount("no figures here at all"), 0);
  // 180 GW repeated three times counts once; 4.2% and 1.23 are separate facts.
  const notes =
    "Capacity grows 180 GW by 2030. 180 GW is the ceiling. At 4.2% the return beats inflation. The voltage is 1.23 V.";
  assert.equal(numericFactCount(notes), 4);
});

test("dataAffinityNote forbids charts below two numeric facts and names the kinds above", () => {
  const thin = dataAffinityNote("a brief with no numbers in it");
  assert.ok(thin, "a no-numbers brief still gets the steering note");
  assert.match(thin, /Do NOT choose chart/i, "below the threshold charts are forbidden, not merely unmentioned");
  assert.match(thin, /qualitative|framework|cards/, "a qualitative alternative is named");
  assert.match(dataAffinityNote("only one fact: 42% uptake"), /Do NOT choose chart/i, "one fact is also below the threshold");
  const note = dataAffinityNote("Two facts: 180 GW by 2030 and 4.2% annual growth.");
  assert.ok(note, "two facts must trigger the note");
  assert.match(note, /CHART/);
  for (const kind of CHART_KINDS) assert.ok(note.includes(kind), `note names the ${kind} kind`);
});

test("the schema refuses a chart with empty series values", async () => {
  const empty = {
    title: "t",
    slides: [{
      type: "chart",
      headline: "Evidence",
      chart: { kind: "bar", categories: ["MPI", "Hybrid"], series: [{ name: "Speedup", values: [] }] },
    }],
  };
  const { ok, errors } = await validateDeck(empty);
  assert.equal(ok, false, "an empty-values chart must not validate");
  assert.ok(errors.some((e) => e.includes("values")), "the error names the values array");
});

test("the schema refuses a chart with no categories", async () => {
  const { ok } = await validateDeck({
    title: "t",
    slides: [{
      type: "chart",
      headline: "Evidence",
      chart: { kind: "bar", categories: [], series: [{ name: "Speedup", values: [1.2] }] },
    }],
  });
  assert.equal(ok, false);
});

test("planDeck coerces a proposed chart to a qualitative type when the research has no numbers", async () => {
  const chat = async () => ({
    data: {
      title: "Trends",
      sections: ["Evidence"],
      slides: [
        { type: "chart", section: 0, purpose: "The evidence from papers." },
        { type: "bullets", section: 0, purpose: "The key claims." },
      ],
    },
  });
  const { plan } = await planDeck({ brief: "b", research: "qualitative notes, no figures", model: "mock", chat });
  const chart = plan.slides.find((s) => s.type === "chart");
  assert.equal(chart, undefined, "no chart survives the coercion");
  assert.ok(plan.slides.some((s) => s.type === "cards"), "the chart beat became a cards slide");
  assert.equal(plan.slides.filter((s) => s.type === "bullets").length, 1, "other types untouched");
});

test("planDeck keeps a proposed chart when the research carries real numbers", async () => {
  const chat = async () => ({
    data: {
      title: "Trends",
      sections: ["Data"],
      slides: [
        { type: "chart", section: 0, purpose: "180 GW vs 220 GW by source." },
      ],
    },
  });
  const { plan } = await planDeck({ brief: "b", research: "Capacity is 180 GW today, rising to 220 GW by 2030.", model: "mock", chat });
  assert.ok(plan.slides.some((s) => s.type === "chart"), "a numeric research keeps the chart");
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
