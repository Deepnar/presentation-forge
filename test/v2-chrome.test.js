// V2-2F: renderer-neutral chrome geometry/policy. Legacy drawing keeps
// working through the src/chrome.js facade (pinned by crest tests,
// themematrix, and branded raster parity); these tests pin the core plan.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  effectiveBranding,
  planTitleBanner,
  planContentMark,
  reservationForTopRight,
  planFooter,
  planContentChrome,
  backgroundDark,
} from "../packages/core/chrome.ts";
import { SCENE_W, SCENE_H } from "../packages/model/scene-constants.ts";
import { CANVAS } from "../src/chrome.js";

describe("v2 chrome modes", () => {
  it("absent mode means full; garbage stays minimal-like, never a failure", () => {
    assert.equal(effectiveBranding(undefined), "full");
    assert.equal(effectiveBranding("full"), "full");
    assert.equal(effectiveBranding("minimal"), "minimal");
    assert.equal(effectiveBranding("none"), "none");
    assert.equal(effectiveBranding("bespoke"), "minimal");
  });

  it("none permits slide numbers but nothing institutional", () => {
    const plan = planContentChrome({
      branding: "none", selectedCrestRatio: 1.2, index: 2, total: 5,
      background: "FFFFFF", mutedInk: "5C5C59", presenterText: "Asha",
    });
    assert.equal(plan.mark.place, false);
    assert.equal(plan.presenter, null);
    assert.ok(plan.slideNumber && plan.slideNumber.text === "2 / 5");
  });

  it("slide numbers are independently disableable", () => {
    const plan = planContentChrome({
      branding: "full", index: 1, total: 3, background: "FFFFFF",
      mutedInk: "5C5C59", slideNumbers: false,
    });
    assert.equal(plan.slideNumber, null);
  });
});

describe("v2 chrome geometry", () => {
  it("CANVAS derives from the canonical scene constants", () => {
    assert.equal(CANVAS.w, SCENE_W);
    assert.equal(CANVAS.h, SCENE_H);
  });

  it("title banner centers at max width with ratio height", () => {
    const plan = planTitleBanner("full", 4);
    assert.equal(plan.place, true);
    assert.equal(plan.box.w, Math.min(6.4, SCENE_W - 2));
    assert.equal(plan.box.x, (SCENE_W - plan.box.w) / 2);
    assert.equal(plan.box.y, 0.3);
    assert.equal(plan.box.h, plan.box.w / 4);
    assert.equal(planTitleBanner("minimal", 4).place, false);
    assert.equal(planTitleBanner("full", null).place, false);
  });

  it("content crest pins height, right offset, y, and ratio width", () => {
    const plan = planContentMark("full", true, 0.75);
    assert.equal(plan.place, true);
    assert.equal(plan.box.h, 0.82);
    assert.equal(plan.box.y, 0.26);
    assert.equal(plan.box.w, 0.82 * 0.75);
    assert.equal(plan.box.x, SCENE_W - 0.55 - 0.82 * 0.75);
    assert.equal(planContentMark("none", true, 0.75).place, false);
    assert.equal(planContentMark("full", false, 0.75).place, false);
    assert.equal(planContentMark("full", true, null).place, false);
  });

  it("reservation follows only the primary crest ratio", () => {
    assert.equal(reservationForTopRight(1.2), 0.82 * 1.2 + 0.55 + 0.25);
    assert.equal(reservationForTopRight(null), 0);
    assert.equal(reservationForTopRight(undefined), 0);
  });
});

describe("v2 chrome footer", () => {
  it("dark grounds get white at 0.45, light grounds muted ink at 1", () => {
    assert.equal(backgroundDark("141110"), true);
    assert.equal(backgroundDark("EBEBE6"), false);
    const dark = planFooter("141110", "5C5C59", "Inter");
    assert.deepEqual([dark.foreground, dark.opacity, dark.fontFamily], ["FFFFFF", 0.45, "Inter"]);
    const light = planFooter("EBEBE6", "5C5C59");
    assert.deepEqual([light.foreground, light.opacity, light.fontFamily], ["5C5C59", 1, "Inter"]);
  });

  it("presenter and number geometry match legacy constants", () => {
    const plan = planContentChrome({
      branding: "full", index: 2, total: 3, background: "FFFFFF",
      mutedInk: "5C5C59", presenterText: "Asha Rao",
    });
    assert.deepEqual(plan.presenter.box, { x: 0.7, y: 6.92, w: 6.5, h: 0.3 });
    assert.equal(plan.presenter.style.fontSize, 9);
    assert.equal(plan.presenter.style.align, "left");
    assert.equal(plan.presenter.text, "Asha Rao");
    assert.deepEqual(plan.slideNumber.box, { x: SCENE_W - 1.9, y: 6.92, w: 1.2, h: 0.3 });
    assert.equal(plan.slideNumber.style.align, "right");
  });

  it("presenter suppression is a semantic boolean", () => {
    const base = {
      branding: "full", index: 1, total: 2, background: "FFFFFF",
      mutedInk: "5C5C59", presenterText: "Asha",
    };
    assert.ok(planContentChrome(base).presenter);
    assert.equal(planContentChrome({ ...base, suppressPresenter: true }).presenter, null);
    assert.equal(planContentChrome({ ...base, presenterText: "  " }).presenter, null);
  });

  it("no brand draws nothing and errors nothing", () => {
    const plan = planContentChrome({
      branding: "full", index: 1, total: 1, background: "FFFFFF", mutedInk: "5C5C59",
    });
    assert.equal(plan.mark.place, false);
    assert.equal(plan.presenter, null);
  });
});

describe("v2 chrome legacy asymmetry", () => {
  // Preserved quirk: a fallback-only mark draws without earning the
  // primary-crest heading reservation. Pinned, not fixed.
  it("fallback crest draws while reservation stays zero", async () => {
    const { applyContentChrome, reservedTopRight } = await import("../src/chrome.js");
    const calls = [];
    const slide = { addImage: (o) => calls.push(["image", o]), addText: (t, o) => calls.push(["text", t, o]) };
    const brand = { crestLight: { path: "/x/light.png", ratio: 0.8 } };
    const identity = { chrome: { branding: "full" } };
    const theme = { palette: { ink_muted: "5C5C59" }, type: { caption: { family: "Inter" } } };
    applyContentChrome(slide, { brand, theme, identity, data: { type: "bullets" }, index: 1, total: 1, bg: "FFFFFF" });
    assert.ok(calls.some(([k, o]) => k === "image" && o.path === "/x/light.png"), "fallback mark drawn");
    assert.equal(reservedTopRight(brand, identity), 0);
  });
});

describe("v2 chrome purity", () => {  it("core chrome names no legacy ontology, brand paths, or binaries", async () => {
    const text = await readFile(new URL("../packages/core/chrome.ts", import.meta.url), "utf8");
    for (const name of ["DIVIDER_TYPES", "REFERENCE_TYPES", "bibliography", "chapter", "sharp", "child_process", "node:fs", "pptxgenjs", "resolveBrandPath", "loadIdentity", "addImage", "addText"]) {
      assert.ok(!text.includes(name), `core/chrome.ts mentions ${name}`);
    }
  });
});
