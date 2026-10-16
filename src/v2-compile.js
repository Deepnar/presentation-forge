// IO and asset resolution stay outside the deterministic compiler so HTTP and
// headless creation compile the same validated scene document.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { THEMES } from "./paths.js";
import { listStyleNames, loadStyleDocument, loadThemeDocument } from "./theme-loader.js";
import { validateDeckIntent, normalizeIntent } from "../packages/model/intent.ts";
import { validateScene } from "../packages/model/scene.ts";
import { normalizeDesign } from "../packages/core/design.ts";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { resolvePlateBackgrounds, slideBackgrounds } from "./v2-plates.js";

export async function compileSceneDeck({ intent, theme = "warm-humanist", style = null, mode = "light", chromeForDeck = null }) {
  const themes = (await readdir(THEMES)).filter(f => f.endsWith(".yaml")).map(f => path.basename(f, ".yaml"));
  const error = (code, message, details = []) => Object.assign(new Error(message), { code, details });
  if (!themes.includes(theme)) throw error("bad-theme", `unsupported theme "${theme}"`);
  if (style !== null && !(await listStyleNames()).includes(style)) throw error("bad-style", "unsupported style");
  if (!["light", "dark"].includes(mode)) throw error("bad-mode", "unsupported appearance mode");
  const verdict = await validateDeckIntent(intent);
  if (!verdict.ok) throw error("bad-intent", "deck intent invalid", verdict.errors);
  const clean = normalizeIntent(intent);
  const design = normalizeDesign({ theme: await loadThemeDocument(theme), ...(style ? { style: await loadStyleDocument(style) } : {}), mode });
  const backgrounds = await resolvePlateBackgrounds({ themeName: theme, style, mode, design });
  const { plan } = planDeckComposition(clean, design);
  const chrome = chromeForDeck ? chromeForDeck(clean, design, { backgrounds, plan }) : null;
  const detailed = compileDeckDetailed(clean, design, chrome, slideBackgrounds(backgrounds));
  for (const scene of detailed.scenes) {
    const result = await validateScene(scene);
    if (!result.ok) throw error("compile-failed", "compiler produced an invalid scene", result.errors);
  }
  return { ...detailed, design, intent: clean, chrome };
}
