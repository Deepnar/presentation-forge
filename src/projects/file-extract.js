// The text a project needs from a file the person adds. Each kind is read
// by what it is, not by its name: a PDF through Poppler's pdftotext (already
// a runtime dependency), Word and PowerPoint from their XML, and text,
// Markdown and CSV as UTF-8 — anything else is refused plainly.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { DOMParser } from "linkedom";
import { FILE_LIMITS } from "./file-schema.js";

const fail = (code, message) => Object.assign(new Error(message), { code });
const TEXT_KINDS = { ".txt": "text", ".md": "markdown", ".markdown": "markdown", ".csv": "csv" };

function pdfText(bytes) {
  return new Promise((resolve, reject) => {
    const child = execFile("pdftotext", ["-layout", "-enc", "UTF-8", "-", "-"], { maxBuffer: 16 * 1024 * 1024, timeout: 30000 }, (err, stdout) => {
      if (err) return reject(fail("file-unreadable", "this PDF could not be read"));
      resolve(stdout);
    });
    child.stdin.on("error", () => { /* the exit code says what happened */ });
    child.stdin.end(Buffer.from(bytes));
  });
}

// A paragraph's text in document order: runs, tabs and breaks, text boxes
// included. A plain walk — linkedom's getElementsByTagName("*") finds
// nothing in XML, which silently emptied every paragraph.
function paragraphText(el) {
  let out = "";
  for (const n of [...(el.children ?? [])]) {
    if (n.tagName === "w:t") out += n.textContent;
    else if (n.tagName === "w:tab") out += "\t";
    else if (n.tagName === "w:br" || n.tagName === "w:cr") out += "\n";
    else out += paragraphText(n);
  }
  return out;
}

async function docxText(zip) {
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw fail("file-unreadable", "this Word file has no document body");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const lines = [];
  // Paragraphs in order; a table's cells joined by tabs, a row per line.
  const walk = (el) => {
    for (const node of [...(el?.children ?? [])]) {
      if (node.tagName === "w:p") {
        lines.push(paragraphText(node));
      } else if (node.tagName === "w:tbl") {
        for (const tr of [...node.getElementsByTagName("w:tr")]) {
          lines.push([...tr.getElementsByTagName("w:tc")].map((tc) => [...tc.getElementsByTagName("w:t")].map((t) => t.textContent).join(" ")).join("\t"));
        }
      } else walk(node);
    }
  };
  walk(doc.getElementsByTagName("w:body")[0]);
  return lines.join("\n");
}

async function pptxText(bytes) {
  const { pptxToScenes } = await import("./pptx-import.js");
  const { scenes } = await pptxToScenes(bytes);
  return scenes.map((s, i) => {
    const text = s.elements.flatMap((e) => (e.paragraphs ?? []).map((p) => p.runs.map((r) => r.text).join(""))).filter(Boolean).join("\n");
    return `--- Slide ${i + 1} ---\n${text}${s.notes ? `\n[Notes] ${s.notes}` : ""}`;
  }).join("\n\n");
}

// { id, name, kind, size, text } for a file's bytes, or a plain refusal.
export async function extractFile(bytes, filename = "file") {
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw fail("file-invalid", "the file is empty");
  if (bytes.length > FILE_LIMITS.bytes) throw fail("file-too-large", `files up to ${FILE_LIMITS.bytes / 1024 / 1024} MB can be added`);
  const name = String(filename).slice(0, 200) || "file";
  const ext = path.extname(name).toLowerCase();
  let kind, text;
  const head = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  if (head === "%PDF-") { kind = "pdf"; text = await pdfText(bytes); }
  else if (head.startsWith("PK")) {
    let zip;
    try { zip = await JSZip.loadAsync(bytes); } catch { throw fail("file-unreadable", "this file could not be opened"); }
    if (zip.file("word/document.xml")) { kind = "docx"; text = await docxText(zip); }
    else if (zip.file("ppt/presentation.xml")) { kind = "pptx"; text = await pptxText(bytes); }
    else throw fail("file-unsupported", "add a PDF, Word, PowerPoint, Markdown, text or CSV file");
  } else if (TEXT_KINDS[ext]) {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw fail("file-unreadable", "this text file is not UTF-8"); }
    kind = TEXT_KINDS[ext];
  } else throw fail("file-unsupported", "add a PDF, Word, PowerPoint, Markdown, text or CSV file");
  text = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/\n{4,}/g, "\n\n\n").trim();
  if (!text) throw fail("file-empty", kind === "pdf" ? "this PDF has no text layer (a scan?) — nothing to read" : "this file has no text to read");
  const truncated = text.length > FILE_LIMITS.chars;
  return {
    id: `file_${randomBytes(8).toString("hex")}`, name, kind, size: bytes.length,
    text: truncated ? text.slice(0, FILE_LIMITS.chars) : text, truncated,
  };
}
