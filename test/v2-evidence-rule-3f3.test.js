// V2-3F-3 correction: the prose-list/evidence accent rule follows the
// primary carrier's actual geometry. Previously it used the full
// allocated region, leaving a full-height rule beside centered short
// evidence text. The tone rail already follows the carrier; the
// evidence rule now does the same, keeping its established array
// position, z sequence, x, width, color, provenance, and ID.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { checkSceneGeometry, checkElementIds } from "../packages/core/scene-quality.ts";
import { warmDesign } from "./v2-fixture.js";

function evidenceDeck(blocks) {
  return {
    id: "d", title: "D",
    slides: [{ id: "s1", purpose: "show evidence", title: "Evidence", rhetoricalRole: "evidence", blocks }],
  };
}

function ruleAndCarrier(scene) {
  const rule = scene.elements.find((e) => e.id === "s1:b1:rule");
  const carrier = scene.elements.find((e) => e.id === "s1:b1:content");
  assert.ok(rule && carrier, "rule and carrier both emitted");
  return { rule, carrier };
}

describe("v2-3f-3 evidence rule follows carrier", () => {
  it("sparse evidence centers carrier and rule together", async () => {
    const design = await warmDesign();
    const { scenes, fitDiagnostics } = compileDeckDetailed(
      evidenceDeck([{ id: "b1", kind: "list", items: ["Alpha", "Beta"] }]), design);
    const [scene] = scenes;
    const { rule, carrier } = ruleAndCarrier(scene);
    assert.equal(rule.kind, "shape");
    assert.equal(rule.shape.form, "rect");
    assert.equal(rule.shape.fill, design.palette.accent.hex);
    assert.equal(rule.provenance, "compiler");
    assert.equal(rule.semanticRef, "b1");
    assert.equal(rule.x, 0.7, "rule x-position preserved");
    assert.equal(rule.w, 0.06, "rule width preserved");
    assert.ok(carrier.y > 1.77, `carrier centered, y=${carrier.y}`);
    assert.equal(rule.y, carrier.y, "rule y tracks carrier y");
    assert.equal(rule.h, carrier.h, "rule height tracks carrier height");
    assert.ok(rule.x + rule.w <= carrier.x, "rule stays outside the carrier");
    assert.ok(carrier.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join(" ").includes("Alpha Beta".split(" ")[0]), "authored text survives");
    assert.deepEqual(checkElementIds(scene), [], "no duplicate IDs");
    assert.deepEqual(checkSceneGeometry(scene), [], "in canvas");
    assert.deepEqual(fitDiagnostics, [], "no new fit diagnostics");
    const order = scene.elements.map((e) => e.id);
    assert.ok(order.indexOf("s1:b1:rule") < order.indexOf("s1:b1:content"), "rule keeps array position before carrier");
    assert.ok(rule.z < carrier.z, "z sequence stable");
  });

  it("dense evidence retains full-region rule and carrier", async () => {
    const design = await warmDesign();
    const { scenes, fitDiagnostics } = compileDeckDetailed(
      evidenceDeck([{ id: "b1", kind: "list", items: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"] }]), design);
    const [scene] = scenes;
    const { rule, carrier } = ruleAndCarrier(scene);
    assert.ok(Math.abs(rule.y - 1.77) < 0.01 && Math.abs(rule.h - 4.41) < 0.01, `rule keeps region geometry, y=${rule.y} h=${rule.h}`);
    assert.equal(carrier.y, rule.y, "carrier shares region origin");
    assert.equal(carrier.h, rule.h, "carrier shares region height");
    assert.deepEqual(checkElementIds(scene), []);
    assert.deepEqual(checkSceneGeometry(scene), []);
    assert.deepEqual(fitDiagnostics, []);
  });

  it("cautionary evidence keeps tone rail aligned with carrier", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(
      evidenceDeck([{ id: "b1", kind: "text", label: "F", text: "Bad news", emphasis: "primary", outcome: "unfavorable" }]), design);
    const [scene] = scenes;
    const carrier = scene.elements.find((e) => e.id === "s1:b1:content");
    const tone = scene.elements.find((e) => e.id === "s1:b1:tone");
    const rule = scene.elements.find((e) => e.id === "s1:b1:rule");
    assert.ok(carrier && tone && rule, "carrier, tone rail, and evidence rule all present");
    assert.equal(tone.y, carrier.y, "tone rail tracks carrier y");
    assert.equal(tone.h, carrier.h, "tone rail tracks carrier height");
    assert.equal(rule.y, carrier.y, "evidence rule tracks carrier y");
    assert.equal(rule.h, carrier.h, "evidence rule tracks carrier height");
    assert.deepEqual(checkElementIds(scene), []);
    assert.deepEqual(checkSceneGeometry(scene), []);
  });
});
