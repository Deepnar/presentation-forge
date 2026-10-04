// E3/E5: canonical DOCX renderer proves bytes, structure, and parity
// against the legacy implementation (donor-fixture donor, same inputs).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  renderDocx,
  renderedReportSections,
  parseDonorSections,
  donorSectionsFromBytes,
  locatePages,
} from "../packages/renderer-docx/render.ts";
import { buildDonor } from "./donor-fixture.js";
import { assembleDocx } from "../src/report.js";

const REPORT = {
  title: "Cells",
  content: {
    Abstract: { paragraphs: ["Cells matter."] },
    Introduction: {
      paragraphs: ["Context."],
      table: { caption: "Data.", header: ["A", "B"], rows: [["1", "2"]] },
    },
    References: { entries: ["Doe (2026). Cells."] },
  },
  order: ["Abstract", "Introduction", "References"],
};

const COVER = {
  teamLabel: "T1",
  members: [{ name: "Asha", roll: "21" }],
  subject: "Physics",
  examType: "ISE",
  year: "2026-27",
  guideName: "Dr. Rao",
  guideDesignation: "Professor",
};

async function parts(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const out = {};
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir) out[n] = await zip.files[n].async("nodebuffer");
  }
  return out;
}

describe("v2 renderer docx bytes", () => {
  it("returns a Uint8Array with a ZIP signature", async () => {
    const bytes = await renderDocx(REPORT, new Uint8Array(await buildDonor()), { cover: COVER });
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });

  it("derives the rendered section list identically for renderer and pagination", async () => {
    const present = renderedReportSections(REPORT, [{ text: "Pic.", slide: 3 }]);
    assert.deepEqual(present, ["Abstract", "Introduction", "References", "Image Credits"]);
    assert.deepEqual(renderedReportSections(REPORT, []), ["Abstract", "Introduction", "References"]);
  });

  it("preserves every untouched donor part byte-for-byte", async () => {
    const donor = await buildDonor();
    const before = await parts(donor);
    const after = await parts(await renderDocx(REPORT, new Uint8Array(donor), { cover: COVER }));
    for (const name of [
      "word/header1.xml", "word/footer1.xml", "word/styles.xml", "word/settings.xml",
      "word/_rels/document.xml.rels", "word/_rels/header1.xml.rels",
      "word/media/image1.png", "word/media/image2.png",
    ]) {
      assert.ok(after[name], `${name} survives`);
      assert.deepEqual(after[name], before[name], `${name} byte-identical`);
    }
  });

  it("replaces the donor body with the report document", async () => {
    const bytes = await renderDocx(REPORT, new Uint8Array(await buildDonor()), {
      cover: COVER,
      tocPages: { Abstract: 3, Introduction: 4, References: 9 },
      imageCredits: [{ text: "Array by Doe.", slide: 3 }],
    });
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml").async("string");
    assert.match(xml, /Cells/);
    assert.match(xml, /Asha/);
    assert.match(xml, /TABLE OF CONTENT/);
    assert.match(xml, /1\. Abstract/);
    assert.match(xml, /Image Credits/);
    assert.match(xml, /<w:sectPr/);
  });

  it("uses the em-dash fallback without page numbers", async () => {
    const bytes = await renderDocx(REPORT, new Uint8Array(await buildDonor()), { cover: COVER });
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml").async("string");
    assert.match(xml, /—/);
  });

  it("fails loudly on a donor without body-level sectPr", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document><w:body><w:p/></w:body></w:document>");
    const bad = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
    await assert.rejects(renderDocx(REPORT, bad, { cover: COVER }), /no body-level <w:sectPr>/);
  });

  it("fails loudly on an empty report", async () => {
    await assert.rejects(
      renderDocx({ title: "T", content: {} }, new Uint8Array(await buildDonor()), { cover: COVER }),
      /no section content/,
    );
  });
});

describe("v2 renderer docx parity", () => {
  it("canonical bytes match legacy assembly structurally", async (t) => {
    const donor = await buildDonor();
    const tocPages = { Abstract: 3, Introduction: 4, References: 9 };
    const canonical = await renderDocx(REPORT, new Uint8Array(donor), { cover: COVER, tocPages });
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { default: path } = await import("node:path");
    const dir = await mkdtemp(path.join(tmpdir(), "forge-legacy-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const donorPath = path.join(dir, "donor.docx");
    await writeFile(donorPath, donor);
    const legacyZip = await assembleDocx(
      donorPath,
      REPORT,
      { academic: { subject: "Physics", exam_type: "ISE", year: "2026-27" }, guide: { name: "Dr. Rao", designation: "Professor" }, team: { label: "T1", members: [{ name: "Asha", roll: "21" }] } },
      ["Abstract", "Introduction", "References"],
      tocPages,
      {},
    );
    const a = await parts(canonical);
    const b = {};
    for (const n of Object.keys(legacyZip.files)) {
      if (!legacyZip.files[n].dir) b[n] = await legacyZip.files[n].async("nodebuffer");
    }
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    assert.equal(
      (await (await JSZip.loadAsync(canonical)).file("word/document.xml").async("string")),
      (await legacyZip.file("word/document.xml").async("string")),
    );
  });

  it("parses donor sections from bytes", async () => {
    const sections = await donorSectionsFromBytes(new Uint8Array(await buildDonor()));
    assert.ok(Array.isArray(sections) || sections === null);
    assert.deepEqual(parseDonorSections("<w:document><w:body></w:body></w:document>"), null);
  });

  it("locates pages from pagination text", async () => {
    assert.deepEqual(locatePages("x\n1. Abstract\ny\f2. Introduction\nz", ["Abstract", "Introduction"]), {
      Abstract: 1,
      Introduction: 2,
    });
  });
});
