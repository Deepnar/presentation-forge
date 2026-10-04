// @forge/model — semantic report policy. Renderer-neutral: the graded
// default vocabulary, the reserved appendix name, and section ordering
// exist independently of DOCX rendering. The renderer owns generation
// and formatting of the appendix; the AI planner reads these constants
// so the model never authors the reserved section.

import type { ReportSpec } from "./report.generated.ts";

export type { ReportSpec } from "./report.generated.ts";

export const DEFAULT_REPORT_SECTIONS = [
  "Abstract",
  "Acknowledgement",
  "Introduction",
  "Theoretical Background",
  "Application",
  "Future Scope",
  "Conclusion",
  "References",
] as const;

export const REPORT_IMAGE_CREDITS_SECTION = "Image Credits";

function sectionHasContent(sec: ReportSpec["content"][string]): boolean {
  if (!sec || typeof sec !== "object") return false;
  const paras = [...(sec.paragraphs ?? []), ...(sec.entries ?? [])].filter((s) => String(s).trim());
  const hasTable = Array.isArray(sec.table?.header) && sec.table.header.length > 0;
  return paras.length > 0 || hasTable;
}

export function presentReportSections(report: ReportSpec): string[] {
  const content = report.content ?? {};
  const declared = Array.isArray(report.order) && report.order.length ? report.order : DEFAULT_REPORT_SECTIONS;
  const seen = new Set<string>();
  const order: string[] = [];
  for (const name of declared) {
    if (typeof name !== "string" || seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }
  for (const name of [...DEFAULT_REPORT_SECTIONS, ...Object.keys(content)]) {
    if (!seen.has(name) && sectionHasContent(content[name])) {
      seen.add(name);
      order.push(name);
    }
  }
  return order.filter((name) => sectionHasContent(content[name]));
}
