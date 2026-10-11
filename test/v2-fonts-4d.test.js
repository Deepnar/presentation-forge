// V2-4D: browser font inventory, mapping, and shipped assets.
// Unit-level claims (coverage, package files, projection names)
// run here; actual loading claims run in real Chrome (smoke font
// gate + eval drivers, which throw on missing faces). The dist
// asset case fails on the accepted V2-4C baseline `95165b5`
// (no static faces shipped) and passes after.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { FONT_COVERAGE, FONT_FILES, ensureDeckFonts } from "../app/web/src/fonts.js";
import { sceneToSvg } from "../packages/editor/scene-svg.js";

const ROOT = new URL("..", import.meta.url).pathname;

function themeFamilies() {
  // Role lines come in two shapes (`family: X, weight: N` and
  // `family: X` / `weight: N` pairs); collect family->weights.
  const out = new Map();
  return readdir(path.join(ROOT, "themes")).then(async (files) => {
    for (const f of files.filter((x) => x.endsWith(".yaml"))) {
      const text = await readFile(path.join(ROOT, "themes", f), "utf8");
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        let m = lines[i].match(/family:\s*"?([A-Za-z0-9 ]+?)"?\s*,?\s*weight:\s*(\d+)/);
        if (!m && /family:/.test(lines[i]) && i + 1 < lines.length) {
          const f2 = lines[i].match(/family:\s*"?([A-Za-z0-9 ]+?)"?\s*$/);
          const w2 = lines[i + 1].match(/weight:\s*(\d+)/);
          if (f2 && w2) m = [null, f2[1].trim(), w2[1]];
        }
        if (m) {
          const fam = m[1].trim();
          if (!/^[A-Z]/.test(fam)) continue;
          if (!out.has(fam)) out.set(fam, new Set());
          out.get(fam).add(Number(m[2]));
        }
      }
    }
    return out;
  });
}

describe("v2-4d font inventory", () => {
  it("every V2 theme family is covered", async () => {
    const themes = await themeFamilies();
    assert.ok(themes.size > 10, `themes parsed (${themes.size})`);
    for (const [fam, weights] of themes) {
      assert.ok(fam in FONT_COVERAGE, `${fam} covered`);
      const cov = FONT_COVERAGE[fam];
      for (const w of weights) {
        if (cov === "variable") continue;
        assert.ok(cov.includes(w), `${fam} weight ${w} shipped`);
      }
    }
  });

  it("every weight in committed scenes is covered", async () => {
    const files = (await readdir(path.join(ROOT, "app", "web", "src", "scenes"))).filter((f) => f.endsWith(".json"));
    const need = new Map();
    const walk = (els) => {
      for (const el of els ?? []) {
        for (const p of el.paragraphs ?? []) {
          for (const r of p.runs ?? []) {
            if (!r.family) continue;
            if (!need.has(r.family)) need.set(r.family, new Set());
            need.get(r.family).add(r.weight ?? 400);
          }
        }
        walk(el.group?.children);
      }
    };
    for (const f of files) {
      const d = JSON.parse(await readFile(path.join(ROOT, "app", "web", "src", "scenes", f), "utf8"));
      for (const s of d.scenes) walk(s.elements);
    }
    for (const [fam, weights] of need) {
      assert.ok(fam in FONT_COVERAGE, `scene family ${fam} covered`);
      const cov = FONT_COVERAGE[fam];
      for (const w of weights) {
        if (cov === "variable") continue;
        const nearest = cov.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), cov[0]);
        assert.ok(Math.abs(nearest - w) <= 200, `${fam} weight ${w} near shipped ${nearest}`);
      }
    }
  });

  it("every manifest entry resolves to a real package file", () => {
    assert.equal(FONT_FILES.length, 42, "manifest size pinned (update deliberately)");
    for (const f of FONT_FILES) {
      const pkg = f.load.toString().match(/@fontsource\/([^/]+)\/files\/([^"]+)/);
      assert.ok(pkg, `${f.family} loader shape`);
      const file = path.join(ROOT, "node_modules", "@fontsource", pkg[1], "files", pkg[2]);
      assert.ok(existsSync(file), `ships: ${pkg[1]}/files/${pkg[2]}`);
    }
  });

  it("production build ships every static face", { timeout: 300000 }, async () => {
    execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
    const assets = await readdir(path.join(ROOT, "app", "web", "dist", "assets"));
    const woff2 = assets.filter((a) => a.endsWith(".woff2"));
    assert.ok(woff2.length >= 40, `hashed woff2 assets present (got ${woff2.length})`);
    for (const f of FONT_FILES) {
      const pkg = f.load.toString().match(/\/files\/([^"]+)\.woff2/)[1];
      const stem = pkg.replace(/-/g, "[-_]");
      assert.ok(woff2.some((a) => new RegExp(`^${stem}-[A-Za-z0-9_-]+\\.woff2$`).test(a)), `dist ships ${pkg}`);
    }
  });
});

describe("v2-4d projection uses scene families", () => {
  function svgFor(family, weight = 700, extra = {}) {
    return sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:t", kind: "text", x: 1, y: 1, w: 6, h: 2, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "Ag", role: "heading", family, weight, size: 30, color: "111111", ...extra }] }],
      }],
    }, { wrapText: true });
  }

  it("display faces project verbatim", () => {
    for (const fam of ["Merriweather", "Space Grotesk", "Playfair Display", "Anton", "Syne", "Manrope", "IBM Plex Mono"]) {
      assert.match(svgFor(fam), new RegExp(`font-family="${fam}"`), `${fam} survives projection`);
    }
  });

  it("weights and italics project without CSS knowledge", () => {
    assert.match(svgFor("Inter", 700), /font-weight="bold"/);
    assert.match(svgFor("Inter", 400, { italic: true }), /font-style="italic"/);
  });

  it("readiness degrades honestly without a font API", async () => {
    const r = await ensureDeckFonts([]);
    assert.equal(r.ready, false);
    assert.deepEqual(r.missing, ["no-font-api"]);
  });
});
