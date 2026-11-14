// F8: files a person adds to a project — their text read out, kept with a
// role, owner-checked like the project, removed with it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } from "docx";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-files-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
const { extractFile } = await import("../src/projects/file-extract.js");
const { renderPptx } = await import("../packages/renderer-pptx/render.ts");
const store = await import("../src/projects/store.js");
const { blankSlide } = await import("../packages/editor/scene-text.js");
const { closeDb } = await import("../src/db.js");
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

// A one-page PDF with a text layer, xref offsets computed so pdftotext
// reads it as a well-formed file.
function minimalPdf(text) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

test("text comes out of PDF, Word, PowerPoint, Markdown and CSV files", async () => {
  const pdf = await extractFile(minimalPdf("Battery cells degrade at the interface"), "report.pdf");
  assert.equal(pdf.kind, "pdf");
  assert.match(pdf.text, /Battery cells degrade at the interface/);

  const doc = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun("Findings"), new TextRun({ text: " in bold", bold: true })] }),
    new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("Cell")] }), new TableCell({ children: [new Paragraph("Score")] })] })] }),
    new Paragraph("Last paragraph."),
  ] }] });
  const docx = await extractFile(new Uint8Array(await Packer.toBuffer(doc)), "report.docx");
  assert.equal(docx.kind, "docx");
  assert.equal(docx.text, "Findings in bold\nCell\tScore\nLast paragraph.", "every paragraph, runs joined, a table row per line");

  const slide = { ...blankSlide(), elements: [{ id: "h-000000000001", kind: "text", x: 1, y: 1, w: 6, h: 1, z: 0, provenance: "human", paragraphs: [{ runs: [{ text: "Slide claim", size: 24, color: "111111" }] }] }], notes: "Say why." };
  const pptx = await extractFile(new Uint8Array(await renderPptx([slide])), "deck.pptx");
  assert.equal(pptx.kind, "pptx");
  assert.match(pptx.text, /--- Slide 1 ---\nSlide claim\n\[Notes\] Say why\./);

  assert.equal((await extractFile(new TextEncoder().encode("# Title\r\nBody"), "notes.md")).text, "# Title\nBody");
  assert.equal((await extractFile(new TextEncoder().encode("a,b\n1,2\n"), "data.csv")).kind, "csv");
});

test("files that cannot be read are refused plainly", async () => {
  await assert.rejects(extractFile(new Uint8Array([1, 2, 3]), "photo.jpg"), { code: "file-unsupported" });
  await assert.rejects(extractFile(new Uint8Array(), "x.txt"), { code: "file-invalid" });
  await assert.rejects(extractFile(new Uint8Array([0xff, 0xfe, 0xfd]), "bad.txt"), { code: "file-unreadable" });
  await assert.rejects(extractFile(new TextEncoder().encode("   \n "), "blank.md"), { code: "file-empty" });
});

test("a project keeps its files with roles, owner-checked, pages long text, and drops them with the project", async () => {
  const owner = "owner@example.test";
  const { doc } = await store.createProject({ owner, title: "Files", scenes: [blankSlide()] });
  const file = await extractFile(new TextEncoder().encode("x".repeat(45000)), "long.txt");
  const put = await store.putProjectFile({ owner, id: doc.id, file: { ...file, role: "source-of-truth" } });
  assert.equal(put.stored, true);
  assert.equal(put.file.role, "source-of-truth");
  assert.equal(put.file.chars, 45000);
  assert.equal((await store.putProjectFile({ owner: "other@example.test", id: doc.id, file: { ...file, id: "file_other", role: "source" } })).stored, false);
  const { files } = await store.listProjectFiles({ owner, id: doc.id });
  assert.deepEqual(files.map((f) => [f.name, f.kind, f.role]), [["long.txt", "text", "source-of-truth"]]);
  assert.equal("text" in files[0], false, "listing never carries the text");
  const page = await store.readProjectFile({ owner, id: doc.id, fileId: file.id, offset: 0, limit: 20000 });
  assert.equal(page.file.text.length, 20000);
  assert.equal(page.file.nextOffset, 20000);
  const last = await store.readProjectFile({ owner, id: doc.id, fileId: file.id, offset: 40000, limit: 20000 });
  assert.equal(last.file.text.length, 5000);
  assert.equal(last.file.nextOffset, null);
  assert.equal((await store.setProjectFileRole({ owner, id: doc.id, fileId: file.id, role: "dataset" })).file.role, "dataset");
  await assert.rejects(store.setProjectFileRole({ owner, id: doc.id, fileId: file.id, role: "boss" }), { code: "invalid-document" });
  await store.deleteProject({ owner, id: doc.id });
  assert.equal((await store.listProjectFiles({ owner, id: doc.id })).files, null);
});
