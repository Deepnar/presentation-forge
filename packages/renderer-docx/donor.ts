// @forge/renderer-docx — donor package surgery. Reads donor bytes,
// replaces only the body content between <w:body> and the body-level
// <w:sectPr>, and preserves every other part byte-for-byte (headers,
// footers, styles, media, relationships). Filesystem discovery, tenant
// resolution, and mtime caching stay in the caller/adapter layer.
import JSZip from "jszip";
import { unesc } from "./body.ts";

export function parseDonorSections(documentXml: string): string[] | null {
  const headings: { n: number; title: string }[] = [];
  let depth = 0;
  const re = /<w:tbl[ >]|<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  for (const m of documentXml.matchAll(re)) {
    const chunk = m[0];
    if (chunk.startsWith("<w:tbl")) { depth++; continue; }
    if (chunk.startsWith("</w:tbl")) { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (!/<w:b\/>/.test(chunk)) continue;
    const text = unesc([...chunk.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join("")).trim();
    const numbered = /^(\d+)[.)]\s+(\S.*)$/.exec(text);
    if (!numbered) continue;
    headings.push({ n: Number(numbered[1]), title: numbered[2].trim() });
  }

  let best: { n: number; title: string }[] = [];
  let run: { n: number; title: string }[] = [];
  for (const h of headings) {
    if (h.n === (run.length ? run.at(-1)!.n + 1 : 1)) run.push(h);
    else run = h.n === 1 ? [h] : [];
    if (run.length > best.length) best = [...run];
  }
  if (best.length < 3) return null;
  return best.map((h) => h.title).filter((t) => t.length <= 60);
}

export async function donorSectionsFromBytes(donorBytes: Uint8Array): Promise<string[] | null> {
  try {
    const zip = await JSZip.loadAsync(donorBytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return null;
    return parseDonorSections(xml);
  } catch {
    return null; // an unreadable donor is not a structure
  }
}

export function replaceDonorBody(donorXml: string, bodyXml: string): string {
  const bodyIdx = donorXml.indexOf("<w:body>");
  if (bodyIdx < 0) throw new Error("donor document.xml has no <w:body>");
  const sectStart = donorXml.lastIndexOf("<w:sectPr");
  const sectEnd = donorXml.indexOf("</w:sectPr>", sectStart);
  if (sectStart < 0 || sectEnd < 0) {
    throw new Error("donor document.xml has no body-level <w:sectPr> — cannot preserve its chrome");
  }
  const docStart = donorXml.slice(0, bodyIdx + "<w:body>".length);
  const sectPr = donorXml.slice(sectStart, sectEnd + "</w:sectPr>".length);
  const docEnd = donorXml.slice(sectEnd + "</w:sectPr>".length);
  return docStart + bodyXml + sectPr + docEnd;
}

export async function assembleDonorBytes(donorBytes: Uint8Array, bodyXml: string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(donorBytes);
  const doc = await zip.file("word/document.xml")?.async("string");
  if (doc == null) throw new Error("donor package has no word/document.xml");
  zip.file("word/document.xml", replaceDonorBody(doc, bodyXml));
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  if (!(out instanceof Uint8Array)) {
    throw new Error(`assembleDonorBytes expected uint8array output, received ${typeof out}`);
  }
  return out;
}
