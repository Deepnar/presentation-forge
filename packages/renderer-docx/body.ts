// @forge/renderer-docx — deterministic OOXML body construction. Verbatim
// port of the legacy report body builders: same runs, spacing, tables,
// captions, cover lines, and appendix wording. Quirks preserved, not
// cleaned (duplicate By-lines, TNR faces, TABLE OF CONTENT wording).
import type { ReportSpec } from "../model/report.generated.ts";
import { REPORT_IMAGE_CREDITS_SECTION } from "../model/report.ts";
import type { ReportCoverContext, ReportImageCredit, TocPages } from "./types.ts";

export const esc = (s: unknown): string => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

export const unesc = (s: unknown): string => String(s ?? "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, "&");

const FONT = '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
const CELL_FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>';
const SZ = (v: number): string => `<w:sz w:val="${v}"/><w:szCs w:val="${v}"/>`;

const HEAD_RPR = `${FONT}<w:b/><w:sz w:val="32"/><w:lang w:val="en-IN"/>`;
const BODY_RPR = `${FONT}<w:sz w:val="24"/><w:lang w:val="en-IN"/>`;
const CAPTION_RPR = `${FONT}<w:i/><w:sz w:val="20"/>`;
const TOC_HEAD_RPR = `${FONT}<w:b/><w:bCs/>${SZ(44)}<w:u w:val="single"/>`;
const TOC_CELL_RPR = `${FONT}<w:b/><w:bCs/>${SZ(24)}`;
const CELL_RPR = `${CELL_FONT}<w:b w:val="0"/><w:sz w:val="24"/>`;

const CELL_BORDERS =
  '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '<w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '<w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/></w:tcBorders>';
const CELL_MARGIN =
  '<w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
  '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tcMar>';

function t(text: unknown, rpr: string): string {
  const rp = rpr ? `<w:rPr>${rpr}</w:rPr>` : "";
  return `<w:r>${rp}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

export const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

function centerBold(text: unknown, sz: number): string {
  const rpr = `${FONT}<w:b/><w:bCs/>${SZ(sz)}`;
  return `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${rpr}</w:rPr></w:pPr>${t(text, rpr)}</w:p>`;
}

const spacer = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>';

function bodyPara(text: unknown): string {
  return `<w:p><w:pPr><w:spacing w:line="259" w:lineRule="auto"/><w:rPr>${BODY_RPR}</w:rPr></w:pPr>${t(text, BODY_RPR)}</w:p>`;
}

function sectionHeading(text: unknown): string {
  return `<w:p><w:pPr><w:spacing w:line="259" w:lineRule="auto"/><w:rPr>${HEAD_RPR}</w:rPr></w:pPr>${t(text, HEAD_RPR)}</w:p>`;
}

function caption(text: unknown): string {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${CAPTION_RPR}</w:rPr></w:pPr>${t(text, CAPTION_RPR)}</w:p>`;
}

function cover(title: string, coverCtx: ReportCoverContext): string {
  const members = Array.isArray(coverCtx.members) ? coverCtx.members : [];
  const out: string[] = [];
  out.push(centerBold(title, 44));
  if (coverCtx.teamLabel) {
    out.push(centerBold(`By ${coverCtx.teamLabel}`, 44));
    out.push(centerBold(`By ${coverCtx.teamLabel}`, 32));
  }
  out.push(spacer);
  if (members.length) out.push(namesTable(members));
  out.push(spacer);
  if (coverCtx.examType) out.push(centerBold(`A ${coverCtx.examType} Report`, 36));
  if (coverCtx.subject) {
    out.push(centerBold("Submitted for the Subject of", 36));
    out.push(centerBold(coverCtx.subject, 36));
  }
  out.push(spacer);
  if (coverCtx.guideName) {
    out.push(centerBold("Under the Guidance of", 36));
    out.push(centerBold(coverCtx.guideName, 36));
    if (coverCtx.guideDesignation) out.push(centerBold(coverCtx.guideDesignation, 36));
  }
  if (coverCtx.year) out.push(centerBold(`A.Y. ${coverCtx.year}`, 28));
  return out.join("\n");
}

function namesTable(members: readonly { name: string; roll?: string }[]): string {
  const widths = [3274, 3274, 3275];
  const rows = [["Names", "Roll No.", "Signature"]].concat(
    members.map((m) => [m.name ?? "", m.roll ?? "", ""]),
  );
  const trs = rows.map((cells, ri) => {
    const isHdr = ri === 0;
    const rpr = isHdr ? `${FONT}<w:b/><w:bCs/>` : CELL_RPR;
    const cellsXml = cells.map((c, ci) =>
      `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${rpr}</w:rPr></w:pPr>${t(c ?? "", rpr)}</w:p></w:tc>`,
    ).join("");
    return `<w:tr><w:trPr><w:trHeight w:val="349"/></w:trPr>${cellsXml}</w:tr>`;
  }).join("");
  const total = widths.reduce((a, b) => a + b, 0);
  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="a"/><w:tblW w:w="${total}" w:type="dxa"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>` +
    `<w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/></w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" ` +
    `w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${trs}</w:tbl>`
  );
}

export function tocTable(present: readonly string[], tocPages: TocPages = {}): string {
  const widths = [2883, 2910, 2884];
  const rows = [["SR. NO.", "TITLE", "PAGE NO."]].concat(
    present.map((s, i) => [String(i + 1), s.toUpperCase(), String(tocPages[s] ?? "—")]),
  );
  const trs = rows.map((cells, ri) => {
    const isHdr = ri === 0;
    const trPr = `<w:trPr><w:trHeight w:val="${isHdr ? 942 : 845}"/><w:jc w:val="center"/></w:trPr>`;
    const cellsXml = cells.map((c, ci) => {
      const jc = ci === 1 && !isHdr ? "" : '<w:jc w:val="center"/>';
      const vAlign = ci === 2 ? '<w:vAlign w:val="center"/>' : "";
      const ppr = `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${jc}<w:rPr>${TOC_CELL_RPR}</w:rPr></w:pPr>`;
      return (
        `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/>${CELL_BORDERS}${CELL_MARGIN}${vAlign}</w:tcPr>` +
        `<w:p>${ppr}${t(c ?? "", TOC_CELL_RPR)}</w:p></w:tc>`
      );
    }).join("");
    return `<w:tr>${trPr}${cellsXml}</w:tr>`;
  }).join("");
  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="a0"/><w:tblW w:w="8677" w:type="dxa"/>` +
    '<w:jc w:val="center"/><w:tblLayout w:type="fixed"/>' +
    `<w:tblLook w:val="0400" w:firstRow="0" w:lastRow="0" w:firstColumn="0" ` +
    `w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${trs}</w:tbl>`
  );
}

function contentTable({ header, rows }: { header: string[]; rows: string[][] }): string {
  const n = header.length;
  const total = 9026;
  const widths = Array.from({ length: n }, () => Math.floor(total / n));
  widths[n - 1] = total - widths.slice(0, n - 1).reduce((a, b) => a + b, 0);
  const cellsXml = (cells: string[], isHdr: boolean): string => cells.map((c, ci) => {
    const rpr = `${CELL_FONT}${isHdr ? "<w:b/>" : '<w:b w:val="0"/>'}<w:sz w:val="24"/>`;
    return `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/></w:tcPr><w:p>${t(c ?? "", rpr)}</w:p></w:tc>`;
  }).join("");
  const trs = [header, ...rows].map((cells, ri) => `<w:tr>${cellsXml(cells, ri === 0)}</w:tr>`).join("");
  return (
    '<w:tbl><w:tblPr><w:tblW w:type="auto" w:w="0"/>' +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:firstColumn="1" w:lastRow="0" ` +
    `w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${trs}</w:tbl>`
  );
}

export interface BodyOptions {
  includeToc?: boolean;
  imageCredits?: readonly ReportImageCredit[];
}

export function buildBody(
  report: ReportSpec,
  coverCtx: ReportCoverContext,
  present: readonly string[],
  tocPages: TocPages = {},
  { includeToc = true, imageCredits = [] }: BodyOptions = {},
): string {
  const out = [cover(report.title, coverCtx)];
  if (includeToc) {
    out.push(pageBreak);
    out.push(
      `<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${TOC_HEAD_RPR}</w:rPr></w:pPr>${t("TABLE OF CONTENT", TOC_HEAD_RPR)}</w:p>`,
      tocTable(present, tocPages),
    );
  }
  out.push(pageBreak);
  present.forEach((name, i) => {
    out.push(sectionHeading(`${i + 1}. ${name}`));
    if (name === REPORT_IMAGE_CREDITS_SECTION) {
      out.push(caption("Images reproduced under the licences named below. Slide numbers refer to the presentation."));
      imageCredits.forEach((c, n) => {
        const where = c.slide ? `Slide ${c.slide}. ` : "";
        out.push(bodyPara(`${n + 1}. ${where}${c.text}`));
      });
      return;
    }
    const sec = report.content[name] ?? {};
    for (const para of [...(sec.paragraphs ?? []), ...(sec.entries ?? [])]) {
      if (String(para).trim()) out.push(bodyPara(para));
    }
    if (Array.isArray(sec.table?.header) && sec.table.header.length) {
      if (sec.table.caption) out.push(caption(sec.table.caption));
      out.push(contentTable(sec.table));
    }
  });
  return out.join("\n");
}
