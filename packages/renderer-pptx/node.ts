// Node-only filesystem adapter for the canonical PPTX renderer. There
// is exactly one generation path (renderPptx -> bytes); this module
// merely persists those bytes. Hosted blob upload, HTTP responses, and
// plugin artifacts consume renderPptx() directly and never touch this.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { renderPptx, type PptxRenderOptions } from "./render.ts";
import type { SlideScene } from "../model/scene.generated.ts";

export type { PptxRenderOptions };

export async function renderPptxToFile(
  scenes: readonly SlideScene[],
  outPath: string,
  options: PptxRenderOptions = {},
): Promise<string> {
  const bytes = await renderPptx(scenes, options);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);
  return outPath;
}
