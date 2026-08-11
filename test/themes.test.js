import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { listThemes, loadTheme } from "../src/theme.js";

/**
 * The theme contract as a permanent guard. Every theme must honour the token
 * shape the renderer and the model both assume; a theme that validates but
 * breaks the contract would surface here rather than as a subtle render bug.
 */
test("every theme honours the token contract", async () => {
  const names = await listThemes();
  assert.ok(names.length >= 5, `expected at least the reference themes, got ${names.length}`);

  for (const name of names) {
    const t = await loadTheme(name);
    const raw = YAML.parse(await readFile(path.join(process.cwd(), "themes", `${name}.yaml`), "utf8"));
    const at = (cond, msg) => assert.ok(cond, `${name}: ${msg}`);

    at(raw.name === name, "raw name matches filename");
    at(raw.label, "label present");
    at(raw.voice, "voice present (the model reads it)");

    for (const k of ["bg", "surface", "ink", "ink_muted", "accent", "on_accent"]) {
      at(t.palette?.[k], `palette.${k}`);
    }
    for (const s of ["title", "section"]) {
      at(t.surfaces?.[s], `surfaces.${s} explicit`);
      for (const k of ["bg", "ink", "muted"]) at(t.surfaces[s][k], `surfaces.${s}.${k}`);
    }
    for (const k of ["display", "heading", "subhead", "body", "caption", "eyebrow", "stat"]) {
      at(t.type?.[k], `type.${k}`);
      at(t.type[k].family && t.type[k].size, `type.${k}.family/size`);
    }
    at(t.grid?.margin && t.grid?.band, "grid.margin and grid.band");
    at(t.shape?.radius?.card != null, "shape.radius.card");
    at(typeof t.plate?.enabled, "boolean", "plate.enabled is a boolean");

    // The three-layer rule, machine-checked: the model's voice must never see
    // a colour, a font name or geometry.
    const voice = JSON.stringify(raw.voice ?? {});
    at(!/\#[0-9a-fA-F]{3,8}\b/.test(voice), "voice contains no hex colours");
    at(!/\b(family|font|px|pt|margin|spacing)\b/i.test(voice), "voice contains no font/geometry vocabulary");
  }
});
