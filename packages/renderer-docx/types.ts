// @forge/renderer-docx — shared renderer input types. ReportSpec is the
// model-owned content contract; cover identity is explicit render
// context (never loaded from tenant/config here); credits arrive
// normalized (provenance policy stays outside).
import type { ReportSpec } from "../model/report.generated.ts";

export type { ReportSpec };

export interface ReportCoverContext {
  teamLabel?: string;
  members?: readonly {
    name: string;
    roll?: string;
  }[];
  subject?: string;
  examType?: string;
  year?: string;
  guideName?: string;
  guideDesignation?: string;
}

export interface ReportImageCredit {
  text: string;
  slide?: number;
}

export type TocPages = Readonly<Record<string, number | null>>;

export interface ReportRenderOptions {
  cover: ReportCoverContext;
  tocPages?: TocPages;
  includeToc?: boolean;
  imageCredits?: readonly ReportImageCredit[];
}
