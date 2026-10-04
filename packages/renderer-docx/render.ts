// @forge/renderer-docx — canonical ReportSpec + donor bytes to DOCX
// bytes. Deterministic: same inputs, same document. No filesystem, no
// identity loading, no credits reading, no LibreOffice/Poppler. Those
// are caller/adapter responsibilities; this module only builds bytes.
import type { ReportSpec } from "../model/report.generated.ts";
import { presentReportSections, REPORT_IMAGE_CREDITS_SECTION } from "../model/report.ts";
import { buildBody } from "./body.ts";
import { assembleDonorBytes, donorSectionsFromBytes, parseDonorSections } from "./donor.ts";
import { locatePages } from "./pagination.ts";
import type {
  ReportCoverContext,
  ReportImageCredit,
  ReportRenderOptions,
  TocPages,
} from "./types.ts";

export type {
  ReportCoverContext,
  ReportImageCredit,
  ReportRenderOptions,
  TocPages,
};
export type { ReportSpec };
export { parseDonorSections, donorSectionsFromBytes, locatePages };

// The single authority for which numbered sections a render contains:
// model section policy plus the reserved appendix whenever normalized
// image credits are non-empty. Both renderDocx() and external pagination
// orchestration use this helper, so numbering cannot diverge.
export function renderedReportSections(
  report: ReportSpec,
  imageCredits: readonly ReportImageCredit[] = [],
): string[] {
  // Mirrors legacy renderReport exactly, including the unconditional push:
  // planner/test guards keep authored content from claiming the reserved
  // name, so no deduplication logic belongs here.
  const present = presentReportSections(report);
  if (imageCredits.length) present.push(REPORT_IMAGE_CREDITS_SECTION);
  return present;
}

export async function renderDocx(
  report: ReportSpec,
  donorBytes: Uint8Array,
  options: ReportRenderOptions,
): Promise<Uint8Array> {
  const {
    cover,
    tocPages = {},
    includeToc = true,
    imageCredits = [],
  } = options;
  const present = renderedReportSections(report, imageCredits);
  if (!present.length) throw new Error("report has no section content — nothing to render");
  const body = buildBody(report, cover, present, tocPages, { includeToc, imageCredits });
  return assembleDonorBytes(donorBytes, body);
}
