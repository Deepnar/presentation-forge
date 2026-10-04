// V2-2C: canonical layout vocabulary, frame geometry, and orthogonal
// footprint math. Legacy drawing behavior stays pinned by the untouched
// composition/geometry suites; these tests prove the new core API.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  resolveLayout,
  listColumns,
  hasDropcap,
  sectionStyle,
  titlePlacement,
  frameGeometry,
} from "../packages/core/layout.ts";
import { orthogonalFootprint } from "../packages/core/geometry2d.ts";
import { normalizeDesign } from "../packages/core/design.ts";
import { frameBox, layoutOf } from "../src/composition.js";
import { listThemeNames, loadThemeDocument } from "../src/theme-loader.js";
import { loadTheme } from "../src/theme.js";

describe("v2 resolveLayout", () => {
  it("empty preferences equal the legacy defaults", () => {
    assert.deepEqual(resolveLayout(undefined), {
      title: { composition: "flush-bottom" },
      section: { composition: "flush" },
      heading: { align: "left", opening: "pill", rule: "none" },
      content: { frame: "full" },
      list: { marker: "dot", columns: 1 },
      text: { dropcap: false },
    });
    assert.deepEqual(resolveLayout({}), resolveLayout(undefined));
  });

  it("a single-axis override changes only that axis", () => {
    const l = resolveLayout({ content: { frame: "sidebar" } });
    assert.equal(l.content.frame, "sidebar");
    assert.equal(l.heading.opening, "pill");
  });

  it("unknown group, key, and value fail with legacy wording", () => {
    assert.throws(() => resolveLayout({ nope: { a: 1 } }, "t"), /unknown layout group "nope"/);
    assert.throws(() => resolveLayout({ heading: { nope: 1 } }, "t"), /unknown layout key "heading.nope"/);
    assert.throws(() => resolveLayout({ heading: { opening: "chip" } }, "t"), /layout\.heading\.opening/);
  });

  it("preserves numeric, boolean, and string preference types", () => {
    const l = resolveLayout({ list: { columns: 2, marker: "square" }, text: { dropcap: true } });
    assert.equal(l.list.columns, 2);
    assert.equal(l.list.marker, "square");
    assert.equal(l.text.dropcap, true);
  });

  it("policy projections read the resolved layout", () => {
    const l = resolveLayout({ list: { columns: 2 }, section: { composition: "numeral" }, title: { composition: "split" } });
    assert.equal(listColumns(l), 2);
    assert.equal(hasDropcap(l), false);
    assert.deepEqual(sectionStyle(l), { place: "numeral", field: "none" });
    assert.equal(titlePlacement(l), "split");
    assert.deepEqual(sectionStyle(resolveLayout({ section: { composition: "band" } })), { place: "centred", field: "band" });
  });
});

describe("v2 layout integration", () => {
  // Layout preferences are mode-independent (they come from tokens.layout,
  // which dark-mode resolution never touches), so light mode suffices here;
  // the design sweep already validates both modes.
  it("every theme's normalized preferences resolve", async () => {
    for (const name of await listThemeNames()) {
      const theme = await loadThemeDocument(name);
      const { layoutPreferences } = normalizeDesign({ theme, mode: "light" });
      assert.doesNotThrow(() => resolveLayout(layoutPreferences, name), `${name} preferences`);
    }
  });
});

const BASE = {
  x: 0.7, y: 0.62, w: 11.933, right: 12.633, bottom: 6.8, titleW: 10.333,
};
const BAND = { eyebrowY: 0.62, titleY: 1.3, bodyY: 2.55 };

describe("v2 frameGeometry", () => {
  it("full frame keeps the base column", () => {
    const box = frameGeometry({ base: BASE, frame: "full", band: BAND });
    assert.equal(box.frame, "full");
    assert.equal(box.x, BASE.x);
    assert.equal(box.w, BASE.w);
    assert.ok(box.w > 5 && box.x + box.w <= BASE.right + 0.001);
    assert.ok(box.titleW <= box.w);
    assert.deepEqual(box.mark, { x: BASE.x, y: 0.62, w: box.titleW });
  });

  it("inset, offset, and sidebar reshape honestly", () => {
    const inset = frameGeometry({ base: BASE, frame: "inset", band: BAND });
    assert.ok(inset.x > BASE.x && inset.w < BASE.w);
    const offset = frameGeometry({ base: BASE, frame: "offset", band: BAND });
    assert.ok(offset.x > BASE.x && offset.mark.w < 1.1);
    const side = frameGeometry({ base: BASE, frame: "sidebar", band: BAND });
    assert.ok(side.bodyY < BAND.bodyY && side.bodyY >= 1.1);
    assert.equal(side.head.budget, 2.2);
    assert.ok(side.head.w > 2.5);
  });

  it("legacy sidebar plus wide type equals historical full geometry", async () => {
    const theme = await loadTheme("swiss-international");
    const m = theme.grid.margin;
    const base = {
      x: m.left, y: m.top, w: 13.333 - m.left - m.right,
      right: 13.333 - m.right, bottom: 7.5 - m.bottom,
      titleW: 13.333 - m.left - m.right - 1.6,
    };
    // Facade applies the WIDE_TYPES rule before core geometry ever runs.
    assert.deepEqual(frameBox(theme, base, "sidebar", "cards"), frameBox(theme, base, "full", null));
    assert.equal(frameBox(theme, base, "sidebar", "bullets").frame, "sidebar");
  });

  it("facade layoutOf still memoizes per theme object", async () => {
    const theme = await loadTheme("swiss-international");
    assert.equal(layoutOf(theme), layoutOf(theme));
  });
});

describe("v2 orthogonalFootprint", () => {
  // Intentional compatibility semantics (not general rotation math):
  // only exact quarter turns swap extents; anything else is identity.
  it("swaps extents at 90 and 270 degrees", () => {
    assert.deepEqual(orthogonalFootprint({ x: 1, y: 2, w: 4, h: 2, rotate: 90 }), { x: 2, y: 1, w: 2, h: 4 });
    assert.deepEqual(orthogonalFootprint({ x: 1, y: 2, w: 4, h: 2, rotate: 270 }), { x: 2, y: 1, w: 2, h: 4 });
  });

  it("keeps the declared box at 0, 180, missing, and arbitrary angles", () => {
    for (const rotate of [undefined, 0, 180, 45, 30]) {
      assert.deepEqual(
        orthogonalFootprint({ x: 1, y: 2, w: 4, h: 2, rotate }),
        { x: 1, y: 2, w: 4, h: 2 },
        `rotate=${rotate}`,
      );
    }
  });
});

describe("v2 core purity", () => {
  it("core layout and geometry sources name no legacy slide types", async () => {
    const legacyTypes = ["stacked-list", "kpi-dashboard", "data-cards", "team-grid", "equation", "before-after", "WIDE_TYPES"];
    for (const file of ["packages/core/layout.ts", "packages/core/geometry2d.ts"]) {
      const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
      for (const name of [...legacyTypes, "\"cards\""]) {
        assert.ok(!text.includes(name), `${file} mentions ${name}`);
      }
    }
  });
});
