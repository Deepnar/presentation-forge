import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildBody, presentSections, tocTable, locatePages, IMAGE_CREDITS, REPORT_SECTIONS } from "../src/report.js";
import { readCredits, isCitable, creditText, sourceLabel, providerOf } from "../src/credits.js";

const report = {
  title: "A Report",
  content: {
    Introduction: { paragraphs: ["It begins."] },
    Conclusion: { paragraphs: ["It ends."] },
  },
};
const identity = { institution: {}, team: { members: [] }, academic: {} };

const credit = (over = {}) => ({
  file: "assets/auto/abc.png", query: "solar array", title: "Rooftop array",
  creator: "A. Photographer", licence: "CC BY 4.0", licence_code: "cc-by-4.0",
  licence_url: "https://creativecommons.org/licenses/by/4.0/",
  attribution_required: true, source: "wikimedia-commons",
  landing: "https://commons.wikimedia.org/wiki/File:X", slide: 3, ...over,
});

/* ------------------------------------------------------------ classifying */

test("a report cites institutions, not stock platforms", () => {
  for (const s of ["wikimedia-commons", "openverse/nasa", "openverse/met", "openverse/smithsonian_gardens", "openverse/europeana"]) {
    assert.equal(isCitable({ source: s }), true, `${s} should be citable`);
  }
  for (const s of ["openverse/flickr", "openverse/stocksnap", "openverse/rawpixel", "openverse/sketchfab"]) {
    assert.equal(isCitable({ source: s }), false, `${s} should not be citable`);
  }
  assert.equal(isCitable({ source: "" }), false, "an unnamed source is not citable");
  assert.equal(isCitable({}), false);
});

test("the denylist fails open, so a provider added upstream still gets credited", () => {
  // The alternative — an allowlist of the 42 institutions Openverse carries —
  // would drop a legitimate museum silently the day it is added.
  assert.equal(isCitable({ source: "openverse/some_new_national_archive" }), true);
});

test("a source reads as its name, not its slug", () => {
  assert.equal(sourceLabel("wikimedia-commons"), "Wikimedia Commons");
  assert.equal(sourceLabel("openverse/nasa"), "NASA");
  assert.equal(sourceLabel("openverse/clevelandmuseum"), "Cleveland Museum of Art");
  assert.match(sourceLabel("openverse/smithsonian_postal_museum"), /^Smithsonian Institution — /);
  assert.equal(providerOf("openverse/flickr"), "flickr");
  assert.equal(providerOf("wikimedia-commons"), "wikimedia-commons");
});

test("a credit reads as a sentence with what, who, licence and where", () => {
  const text = creditText(credit());
  assert.match(text, /Rooftop array/);
  assert.match(text, /by A\. Photographer/);
  assert.match(text, /CC BY 4\.0/);
  assert.match(text, /Via Wikimedia Commons/);
});

test("a credit with no title falls back to the query, never to nothing", () => {
  assert.match(creditText(credit({ title: null })), /solar array/);
  assert.match(creditText({}), /Untitled image/);
});

/* ---------------------------------------------------------------- the body */

test("the credits appendix is not a section a model can write into", () => {
  // It must not be in REPORT_SECTIONS: that list is the graded structure the
  // planner picks from, and provenance is a record, not prose.
  assert.ok(!REPORT_SECTIONS.includes(IMAGE_CREDITS));
  assert.ok(!presentSections(report).includes(IMAGE_CREDITS));
});

test("the appendix renders one numbered entry per picture, with its slide", () => {
  const present = [...presentSections(report), IMAGE_CREDITS];
  const xml = buildBody(report, identity, present, {}, {
    includeToc: false,
    imageCredits: [credit(), credit({ title: "Cell diagram", slide: 7, source: "openverse/nasa" })],
  });
  assert.match(xml, /3\. Image Credits/, "it is numbered after the authored sections");
  assert.match(xml, /1\. Slide 3\. Rooftop array/);
  assert.match(xml, /2\. Slide 7\. Cell diagram/);
  assert.match(xml, /Via NASA/);
});

test("without credits the appendix leaves no trace in the document", () => {
  const xml = buildBody(report, identity, presentSections(report), {}, { includeToc: false });
  assert.ok(!xml.includes("Image Credits"));
  assert.match(xml, /1\. Introduction/);
  assert.match(xml, /2\. Conclusion/);
});

test("the appendix takes a numbered TOC row like any other section", () => {
  const present = [...presentSections(report), IMAGE_CREDITS];
  const xml = tocTable(present, { Introduction: 1, Conclusion: 4, [IMAGE_CREDITS]: 5 });
  // Read the cells back rather than matching raw XML: the gap between a title
  // and its page cell is a few hundred bytes of table properties.
  const cells = [...xml.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((m) => m[1]);
  const at = cells.indexOf("IMAGE CREDITS");
  assert.ok(at > 0, `expected an IMAGE CREDITS row, got ${JSON.stringify(cells)}`);
  assert.equal(cells[at - 1], "3", "numbered after the two authored sections");
  assert.equal(cells[at + 1], "5", "and carrying its page, which is the point of riding `present`");
});

test("the page locator finds the appendix by the same heading buildBody wrote", () => {
  const present = [...presentSections(report), IMAGE_CREDITS];
  // Two pages; the appendix heading sits on the second.
  const pdfText = "1. Introduction\nIt begins.\n\f2. Conclusion\nIt ends.\n3. Image Credits\n";
  const pages = locatePages(pdfText, present);
  assert.equal(pages[IMAGE_CREDITS], 2, "the heading text the locator hunts is the one the body emits");
});

/* ---------------------------------------------------------------- on disk */

test("reading credits from a deck with none is empty, never a throw", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-credits-"));
  try {
    assert.deepEqual(await readCredits(dir), []);
    await mkdir(path.join(dir, "assets", "auto"), { recursive: true });
    await writeFile(path.join(dir, "assets", "auto", "credits.json"), "{ not json", "utf8");
    assert.deepEqual(await readCredits(dir), [], "a corrupt record is not a crash");
    await writeFile(path.join(dir, "assets", "auto", "credits.json"), JSON.stringify([credit()]), "utf8");
    const got = await readCredits(dir);
    assert.equal(got.length, 1);
    assert.equal(got[0].title, "Rooftop array");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
