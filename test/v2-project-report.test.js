// F7: a project's report — written from the project's own slides, notes
// and files (a source-of-truth file first), kept with the project, and
// rendered to .docx on the account's donor. The model is a stand-in that
// obeys the grammar it is handed; what it would write is not under test.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { buildDonor } from "./donor-fixture.js";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-project-report-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_REFERENCE_DIR = path.join(scratch, "reference");
const store = await import("../src/projects/store.js");
const { projectReportInputs, generateProjectReport, renderProjectReport, slideText } = await import("../src/projects/report.js");
const { extractFile } = await import("../src/projects/file-extract.js");
const { closeDb } = await import("../src/db.js");
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

const owner = "owner@example.test";
const run = (text, size = 18) => ({ runs: [{ text, size, color: "111111" }] });
const text = (id, y, t, size) => ({ id, kind: "text", x: 1, y, w: 10, h: 0.8, z: y * 10, provenance: "compiler", paragraphs: [run(t, size)] });
const scene = (id, title, body, notes) => ({
  id, width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
  elements: [text(`${id}:title:heading`, 0.5, title, 32), text(`${id}:b1:content`, 2, body), text(`${id}:chrome:slide-number`, 7, "1 / 2", 10)],
  ...(notes ? { notes } : {}),
});

function fakeChat(log) {
  return async ({ schema, messages }) => {
    if (schema.properties?.sections) {
      log.push(messages.at(-1).content);
      return { data: { title: "Solid-State Batteries: A Study", sections: [
        { name: "Abstract", focus: "Summarise." }, { name: "Introduction", focus: "Motivate." },
        { name: "Conclusion", focus: "Close." }, { name: "References", focus: "Sources." },
      ] } };
    }
    if (schema.required?.includes("entries")) return { data: { entries: ["1. A. (2024). One.", "2. B. (2023). Two.", "3. C. (2022). Three.", "4. D. (2021). Four."] } };
    return { data: { paragraphs: ["The interface is where cells fail.", "A second paragraph.", "A third paragraph.", "A fourth paragraph."] } };
  };
}

async function project() {
  const { doc } = await store.createProject({ owner, title: "Solid-State Batteries", scenes: [
    scene("s1", "Why the interface matters", "Dendrites grow where solid meets solid.", "Open with the failure mode."),
    scene("s2", "What fixes it", "Pressure and coatings keep contact."),
  ] });
  for (const [name, body, role] of [["truth.md", "Retention after 1000 cycles is 91 percent.", "source-of-truth"], ["background.md", "Lithium metal anodes store ten times more.", "source"], ["logo.md", "brand only", "brand"]]) {
    const file = await extractFile(new TextEncoder().encode(body), name);
    await store.putProjectFile({ owner, id: doc.id, file: { ...file, role } });
  }
  return doc;
}

test("a slide reads as its heading and its words, without the theme's marks", () => {
  const out = slideText(scene("s", "Heading", "Body line"));
  assert.deepEqual(out, { title: "Heading", body: "Body line" });
});

test("the report's inputs come from the project: truth first, then the slides and notes, then sources", async () => {
  const doc = await project();
  const { inputs, revision } = await projectReportInputs({ owner, id: doc.id });
  assert.equal(revision, doc.revision);
  assert.deepEqual(inputs.plan.sections, ["Why the interface matters", "What fixes it"]);
  const r = inputs.research;
  const at = (s) => r.indexOf(s);
  assert.ok(at("91 percent") >= 0 && at("91 percent") < at("Dendrites grow") && at("Dendrites grow") < at("ten times more"), r);
  assert.ok(r.includes("Speaker notes: Open with the failure mode."));
  assert.equal(r.includes("1 / 2"), false, "the slide number is not content");
  assert.equal(r.includes("brand only"), false, "a brand file is not evidence");
  await assert.rejects(projectReportInputs({ owner: "other@example.test", id: doc.id }), { code: "not-found" });
});

test("a generated report is kept with the project and renders to .docx on the donor", async () => {
  await mkdir(process.env.FORGE_REFERENCE_DIR, { recursive: true });
  await writeFile(path.join(process.env.FORGE_REFERENCE_DIR, "donor.docx"), await buildDonor());
  const doc = await project();
  const log = [];
  const out = await generateProjectReport({ owner, id: doc.id, chat: fakeChat(log) });
  assert.ok(log[0].includes("91 percent"), "the planner saw the source of truth");
  assert.equal(out.document.kind, "report");
  assert.equal(out.document.basisRevision, doc.revision);
  const { documents } = await store.listProjectDocuments({ owner, id: doc.id });
  assert.deepEqual(documents.map((d) => d.id), [out.document.id]);
  assert.equal("body" in documents[0], false, "the list never carries the body");
  const rendered = await renderProjectReport({ owner, id: doc.id, documentId: out.document.id, toc: false });
  const xml = await (await JSZip.loadAsync(rendered.bytes)).file("word/document.xml").async("string");
  assert.ok(xml.includes("The interface is where cells fail."));
  await assert.rejects(renderProjectReport({ owner: "other@example.test", id: doc.id, documentId: out.document.id }), { code: "not-found" });
  assert.equal((await store.deleteProjectDocument({ owner, id: doc.id, documentId: out.document.id })).removed, true);
  await store.deleteProject({ owner, id: doc.id });
  assert.equal((await store.listProjectDocuments({ owner, id: doc.id })).documents, null);
});
