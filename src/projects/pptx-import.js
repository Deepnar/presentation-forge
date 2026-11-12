// A PowerPoint file read into editable scenes (F8). Supported OOXML becomes
// native scene elements — text boxes with their runs, shapes, pictures,
// lines, tables, charts, groups, slide grounds and speaker notes — and
// everything else is named in a warning, never silently dropped. Positions
// come from the slide, else its layout, else its master; slides of any size
// are scaled into the 13.333 x 7.5 scene. Imported slides are the person's
// own (detached, human-made): there is no generated structure behind them.
import path from "node:path";
import JSZip from "jszip";
import { DOMParser } from "linkedom";
import { prepareAsset, assetRef } from "./assets.js";
import { SCENE_W, SCENE_H } from "../../packages/model/scene-constants.ts";

const EMU = 914400;
const LIMITS = Object.freeze({ fileBytes: 60 * 1024 * 1024, entries: 4000, entryBytes: 40 * 1024 * 1024, slides: 120 });
const r3 = (n) => Math.round(n * 1000) / 1000;
const fail = (code, message) => Object.assign(new Error(message), { code });

// Elements by tag among direct children, and the first descendant by tag.
const kids = (el, tag) => [...(el?.children ?? [])].filter((c) => c.tagName === tag);
const kid = (el, tag) => kids(el, tag)[0] ?? null;
const find = (el, tag) => el?.getElementsByTagName?.(tag)?.[0] ?? null;
const all = (el, tag) => [...(el?.getElementsByTagName?.(tag) ?? [])];
const num = (v, d = 0) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));

async function readEntry(zip, name, kind = "string") {
  const file = zip.file(name);
  if (!file) return null;
  const size = file._data?.uncompressedSize;
  if (Number.isFinite(size) && size > LIMITS.entryBytes) throw fail("pptx-too-large", `${name} is larger than an import allows`);
  const data = await file.async(kind);
  if ((kind === "string" ? data.length : data.byteLength) > LIMITS.entryBytes) throw fail("pptx-too-large", `${name} is larger than an import allows`);
  return data;
}
async function xml(zip, name) {
  const text = await readEntry(zip, name);
  return text === null ? null : new DOMParser().parseFromString(text, "text/xml");
}
// A part's relationships, targets resolved to zip paths.
async function rels(zip, part) {
  const relsPath = path.posix.join(path.posix.dirname(part), "_rels", `${path.posix.basename(part)}.rels`);
  const doc = await xml(zip, relsPath);
  const out = new Map();
  for (const r of all(doc, "Relationship")) {
    const target = r.getAttribute("Target") ?? "";
    out.set(r.getAttribute("Id"), {
      type: (r.getAttribute("Type") ?? "").split("/").pop(),
      // Targets are relative to the part, or absolute from the package root.
      target: r.getAttribute("TargetMode") === "External" ? null
        : target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(part), target)),
    });
  }
  return out;
}

// Theme colours, so schemeClr resolves to a real hex.
async function themeColors(zip, masterPath) {
  const masterRels = await rels(zip, masterPath);
  const theme = [...masterRels.values()].find((r) => r.type === "theme");
  const doc = theme?.target ? await xml(zip, theme.target) : null;
  const scheme = find(doc, "a:clrScheme");
  const map = {};
  for (const c of [...(scheme?.children ?? [])]) {
    const name = c.tagName.replace(/^a:/, "");
    const v = find(c, "a:srgbClr")?.getAttribute("val") ?? find(c, "a:sysClr")?.getAttribute("lastClr");
    if (v) map[name] = v.toUpperCase();
  }
  return { ...map, tx1: map.dk1, bg1: map.lt1, tx2: map.dk2, bg2: map.lt2 };
}
function color(el, theme) {
  if (!el) return null;
  const srgb = find(el, "a:srgbClr")?.getAttribute("val");
  if (srgb && /^[0-9A-Fa-f]{6}$/.test(srgb)) return srgb.toUpperCase();
  const scheme = find(el, "a:schemeClr")?.getAttribute("val");
  const v = scheme ? theme[scheme] : null;
  return v && /^[0-9A-Fa-f]{6}$/.test(v) ? v : null;
}
const solidFill = (spPr, theme) => (kid(spPr, "a:noFill") ? null : color(kid(spPr, "a:solidFill"), theme));

function xfrmOf(spPr) {
  const x = kid(spPr, "a:xfrm");
  const off = kid(x, "a:off"), ext = kid(x, "a:ext");
  if (!off || !ext) return null;
  return {
    x: num(off.getAttribute("x")), y: num(off.getAttribute("y")), w: num(ext.getAttribute("cx")), h: num(ext.getAttribute("cy")),
    rot: num(x.getAttribute("rot")) / 60000, flipH: x.getAttribute("flipH") === "1", flipV: x.getAttribute("flipV") === "1",
  };
}

// Placeholder geometry and default size from a layout or master, by idx
// first and type second.
async function placeholders(zip, part) {
  const doc = part ? await xml(zip, part) : null;
  const out = [];
  for (const sp of all(doc, "p:sp")) {
    const ph = find(find(sp, "p:nvPr"), "p:ph");
    if (!ph) continue;
    out.push({ type: ph.getAttribute("type") ?? "body", idx: ph.getAttribute("idx"), xfrm: xfrmOf(kid(sp, "p:spPr")), size: num(find(sp, "a:defRPr")?.getAttribute("sz"), 0) / 100 || null });
  }
  return out;
}
function inherited(ph, sets) {
  if (!ph) return {};
  const type = ph.getAttribute("type") ?? "body", idx = ph.getAttribute("idx");
  for (const set of sets) {
    const hit = (idx !== null && set.find((p) => p.idx === idx && p.xfrm)) || set.find((p) => p.type === type && p.xfrm)
      || (type === "ctrTitle" && set.find((p) => p.type === "title" && p.xfrm)) || (type === "subTitle" && set.find((p) => p.type === "body" && p.xfrm));
    if (hit) return hit;
  }
  return {};
}
const DEFAULT_SIZE = { title: 36, ctrTitle: 40, subTitle: 22, body: 20 };

function paragraphs(txBody, { scale, theme, fallbackSize, placeholderType }) {
  const out = [];
  for (const p of kids(txBody, "a:p")) {
    const pPr = kid(p, "a:pPr");
    const runs = [];
    for (const node of [...p.children]) {
      if (node.tagName === "a:br") { if (runs.length) runs[runs.length - 1].text += "\n"; continue; }
      if (node.tagName !== "a:r" && node.tagName !== "a:fld") continue;
      const rPr = kid(node, "a:rPr");
      const text = kid(node, "a:t")?.textContent ?? "";
      const size = num(rPr?.getAttribute("sz"), 0) / 100 || fallbackSize;
      runs.push({
        text,
        size: r3(Math.max(4, size * scale)),
        ...(rPr?.getAttribute("b") === "1" ? { bold: true } : {}),
        ...(rPr?.getAttribute("i") === "1" ? { italic: true } : {}),
        color: color(kid(rPr, "a:solidFill"), theme) ?? theme.tx1 ?? "111111",
        ...(find(rPr, "a:latin")?.getAttribute("typeface") && !/^\+/.test(find(rPr, "a:latin").getAttribute("typeface")) ? { family: find(rPr, "a:latin").getAttribute("typeface") } : {}),
      });
    }
    if (!runs.length) continue;
    const algn = pPr?.getAttribute("algn");
    const bullet = kid(pPr, "a:buNone") ? false : (kid(pPr, "a:buChar") || kid(pPr, "a:buAutoNum")) ? true : placeholderType === "body";
    out.push({ runs, ...(algn === "ctr" ? { align: "center" } : algn === "r" ? { align: "right" } : {}), ...(bullet ? { bullet: true } : {}) });
  }
  return out;
}

// Chart XML into the scene's native chart, or null for kinds it lacks.
async function chartOf(zip, part) {
  const doc = await xml(zip, part);
  const plot = find(doc, "c:plotArea");
  const kinds = [["c:barChart", null], ["c:lineChart", "line"], ["c:pieChart", "pie"], ["c:doughnutChart", "doughnut"], ["c:areaChart", "area"]];
  for (const [tag, kind] of kinds) {
    const node = kid(plot, tag);
    if (!node) continue;
    const chartKind = kind ?? (kid(node, "c:barDir")?.getAttribute("val") === "bar" ? "hbar" : "bar");
    const series = [], categories = [];
    for (const ser of kids(node, "c:ser")) {
      const name = find(kid(ser, "c:tx"), "c:v")?.textContent ?? `Series ${series.length + 1}`;
      const pts = (holder) => all(holder, "c:pt").sort((a, b) => num(a.getAttribute("idx")) - num(b.getAttribute("idx"))).map((pt) => kid(pt, "c:v")?.textContent ?? "");
      if (!categories.length) categories.push(...pts(kid(ser, "c:cat")));
      series.push({ name, values: pts(kid(ser, "c:val")).map((v) => num(v)) });
    }
    if (!series.length) return null;
    const n = Math.max(...series.map((s) => s.values.length));
    while (categories.length < n) categories.push(String(categories.length + 1));
    return { chartKind, categories: categories.slice(0, n), series: series.map((s) => ({ ...s, values: Array.from({ length: n }, (_, i) => s.values[i] ?? 0) })) };
  }
  return null;
}

export async function pptxToScenes(bytes, { filename = "presentation.pptx" } = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw fail("pptx-invalid", "the file is empty");
  if (bytes.length > LIMITS.fileBytes) throw fail("pptx-too-large", `PowerPoint files up to ${LIMITS.fileBytes / 1024 / 1024} MB can be imported`);
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw fail("pptx-invalid", "this is not a PowerPoint (.pptx) file"); }
  if (Object.keys(zip.files).length > LIMITS.entries) throw fail("pptx-too-large", "the file has more parts than an import allows");
  const pres = await xml(zip, "ppt/presentation.xml");
  if (!pres) throw fail("pptx-invalid", "this is not a PowerPoint (.pptx) file");
  const sz = find(pres, "p:sldSz");
  const pw = num(sz?.getAttribute("cx"), 12192000) / EMU, phh = num(sz?.getAttribute("cy"), 6858000) / EMU;
  const scale = Math.min(SCENE_W / pw, SCENE_H / phh), ox = (SCENE_W - pw * scale) / 2, oy = (SCENE_H - phh * scale) / 2;
  const presRels = await rels(zip, "ppt/presentation.xml");
  const order = all(pres, "p:sldId").map((s) => presRels.get(s.getAttribute("r:id"))?.target).filter(Boolean);
  if (!order.length) throw fail("pptx-invalid", "the presentation has no slides");
  if (order.length > LIMITS.slides) throw fail("pptx-too-large", `presentations up to ${LIMITS.slides} slides can be imported`);

  const warnings = [], assets = new Map(), scenes = [];
  const warn = (slide, message) => { if (warnings.length < 200) warnings.push({ slide, message }); };
  for (const [si, slidePath] of order.entries()) {
    const n = si + 1, slideId = `pptx-s${n}`;
    const doc = await xml(zip, slidePath);
    const slideRels = await rels(zip, slidePath);
    const layoutPath = [...slideRels.values()].find((r) => r.type === "slideLayout")?.target ?? null;
    const masterPath = layoutPath ? [...(await rels(zip, layoutPath)).values()].find((r) => r.type === "slideMaster")?.target ?? null : null;
    const theme = masterPath ? await themeColors(zip, masterPath) : {};
    const phSets = [await placeholders(zip, layoutPath), await placeholders(zip, masterPath)];
    const bgOf = async (part) => { const d = part ? await xml(zip, part) : null; return color(find(find(d, "p:bg"), "a:solidFill"), theme) ?? (find(find(d, "p:bg"), "p:bgRef") ? color(find(d, "p:bgRef"), theme) : null); };
    const fill = (await bgOf(slidePath)) ?? (await bgOf(layoutPath)) ?? (await bgOf(masterPath)) ?? theme.lt1 ?? "FFFFFF";

    const elements = [];
    let k = 0;
    const id = () => `${slideId}-e${++k}`;
    const z = () => elements.length * 10;
    const place = (b, t) => {
      // A group maps its children's coordinate space onto its own box.
      const x = t.ox + (b.x - t.cx) * t.sx, y = t.oy + (b.y - t.cy) * t.sy;
      return { x: r3(ox + (x / EMU) * scale), y: r3(oy + (y / EMU) * scale), w: r3(Math.max(0.01, (b.w * t.sx / EMU) * scale)), h: r3(Math.max(0.01, (b.h * t.sy / EMU) * scale)) };
    };
    const walk = async (tree, t) => {
      for (const node of [...(tree?.children ?? [])]) {
        const tag = node.tagName;
        if (tag === "p:grpSp") {
          const g = kid(kid(node, "p:grpSpPr"), "a:xfrm");
          const off = kid(g, "a:off"), ext = kid(g, "a:ext"), chOff = kid(g, "a:chOff"), chExt = kid(g, "a:chExt");
          if (!off || !ext || !chOff || !chExt) { await walk(node, t); continue; }
          const gx = num(off.getAttribute("x")), gy = num(off.getAttribute("y"));
          const sx = num(ext.getAttribute("cx")) / (num(chExt.getAttribute("cx")) || 1), sy = num(ext.getAttribute("cy")) / (num(chExt.getAttribute("cy")) || 1);
          await walk(node, { ox: t.ox + (gx - t.cx) * t.sx, oy: t.oy + (gy - t.cy) * t.sy, cx: num(chOff.getAttribute("x")), cy: num(chOff.getAttribute("y")), sx: t.sx * sx, sy: t.sy * sy });
        } else if (tag === "p:sp") {
          const spPr = kid(node, "p:spPr"), ph = find(find(node, "p:nvPr"), "p:ph");
          const fromPh = inherited(ph, phSets);
          const box = xfrmOf(spPr) ?? fromPh.xfrm;
          if (!box) { warn(n, "A shape without a position was skipped."); continue; }
          const at = place(box, t), rotation = box.rot ? r3(box.rot) : 0;
          const geom = find(spPr, "a:prstGeom")?.getAttribute("prst") ?? "rect";
          // A straight line drawn as a preset shape (as many writers do).
          if (geom === "line" || geom === "straightConnector1") {
            const ln = kid(spPr, "a:ln");
            const [x1, x2] = box.flipH ? [at.x + at.w, at.x] : [at.x, at.x + at.w], [y1, y2] = box.flipV ? [at.y + at.h, at.y] : [at.y, at.y + at.h];
            elements.push({ id: id(), kind: "line", x: x1, y: y1, w: Math.max(0.01, at.w), h: Math.max(0.01, at.h), z: z(), provenance: "human",
              line: { x2: r3(x2), y2: r3(y2), stroke: color(kid(ln, "a:solidFill"), theme) ?? "888888", strokeWidth: r3(num(ln?.getAttribute("w"), 12700) / 12700) } });
            continue;
          }
          const form = geom === "ellipse" ? "ellipse" : geom === "roundRect" ? "roundRect" : "rect";
          if (find(spPr, "a:custGeom") || !["rect", "roundRect", "ellipse"].includes(geom)) {
            if (solidFill(spPr, theme)) {
              const name = find(spPr, "a:custGeom") ? "Freeform" : geom.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
              warn(n, `${name} shapes became ${form === "ellipse" ? "ovals" : form === "roundRect" ? "rounded rectangles" : "rectangles"}.`);
            }
          }
          const bg = solidFill(spPr, theme);
          const lnFill = color(kid(kid(spPr, "a:ln"), "a:solidFill"), theme);
          if (bg || lnFill) {
            elements.push({ id: id(), kind: "shape", ...at, z: z(), provenance: "human", ...(rotation ? { rotation } : {}),
              shape: { form, ...(bg ? { fill: bg } : { fillAlpha: 0, fill: "FFFFFF" }), ...(lnFill ? { stroke: lnFill, strokeWidth: r3(num(kid(spPr, "a:ln")?.getAttribute("w"), 12700) / 12700) } : {}) } });
          }
          const type = ph?.getAttribute("type") ?? (ph ? "body" : null);
          const paras = paragraphs(kid(node, "p:txBody"), { scale, theme, fallbackSize: fromPh.size ?? DEFAULT_SIZE[type] ?? 18, placeholderType: type });
          if (paras.length) {
            const bodyPr = find(kid(node, "p:txBody"), "a:bodyPr");
            const anchor = bodyPr?.getAttribute("anchor");
            // PowerPoint pads text inside its box (0.1in at the sides, 0.05in
            // top and bottom unless the file says otherwise); the editor's own
            // export pads 0.05pt, so the box moves inward by the difference
            // and re-exporting puts the text where it was.
            const inset = (attr, d) => (num(bodyPr?.getAttribute(attr), d) / EMU) * scale - 0.05 / 72;
            const [l, r, tt, b] = [inset("lIns", 91440), inset("rIns", 91440), inset("tIns", 45720), inset("bIns", 45720)];
            const text = { x: r3(at.x + l), y: r3(at.y + tt), w: r3(Math.max(0.05, at.w - l - r)), h: r3(Math.max(0.05, at.h - tt - b)) };
            elements.push({ id: id(), kind: "text", ...text, z: z(), provenance: "human", ...(rotation ? { rotation } : {}),
              ...(anchor === "ctr" ? { valign: "middle" } : anchor === "b" ? { valign: "bottom" } : {}), paragraphs: paras });
          }
        } else if (tag === "p:pic") {
          const box = xfrmOf(kid(node, "p:spPr"));
          const embed = find(node, "a:blip")?.getAttribute("r:embed");
          const target = embed ? slideRels.get(embed)?.target : null;
          if (!box || !target) { warn(n, "A picture without its image was skipped."); continue; }
          let asset;
          try { asset = await prepareAsset(new Uint8Array(await readEntry(zip, target, "uint8array"))); }
          catch { warn(n, `A ${path.posix.extname(target).slice(1).toUpperCase() || "picture"} image could not be imported (PNG, JPEG, WebP and GIF can).`); continue; }
          assets.set(asset.hash, asset);
          const alt = find(node, "p:cNvPr")?.getAttribute("descr") ?? "";
          elements.push({ id: id(), kind: "image", ...place(box, t), z: z(), provenance: "human", ...(box.rot ? { rotation: r3(box.rot) } : {}), image: { src: assetRef(asset.hash), ...(alt ? { alt } : {}) } });
        } else if (tag === "p:cxnSp") {
          const box = xfrmOf(kid(node, "p:spPr"));
          if (!box) continue;
          const a = place(box, t);
          const [x1, x2] = box.flipH ? [a.x + a.w, a.x] : [a.x, a.x + a.w], [y1, y2] = box.flipV ? [a.y + a.h, a.y] : [a.y, a.y + a.h];
          const ln = kid(kid(node, "p:spPr"), "a:ln");
          elements.push({ id: id(), kind: "line", x: x1, y: y1, w: Math.max(0.01, a.w), h: Math.max(0.01, a.h), z: z(), provenance: "human",
            line: { x2: r3(x2), y2: r3(y2), stroke: color(kid(ln, "a:solidFill"), theme) ?? "888888", strokeWidth: r3(num(ln?.getAttribute("w"), 12700) / 12700) } });
        } else if (tag === "p:graphicFrame") {
          const x = kid(node, "p:xfrm"), off = kid(x, "a:off"), ext = kid(x, "a:ext");
          if (!off || !ext) continue;
          const at = place({ x: num(off.getAttribute("x")), y: num(off.getAttribute("y")), w: num(ext.getAttribute("cx")), h: num(ext.getAttribute("cy")) }, t);
          const uri = find(node, "a:graphicData")?.getAttribute("uri") ?? "";
          if (uri.endsWith("/table")) {
            const tbl = find(node, "a:tbl");
            const rows = kids(tbl, "a:tr").map((tr) => kids(tr, "a:tc").map((tc) => all(tc, "a:t").map((tt) => tt.textContent).join("")));
            const cols = Math.max(0, ...rows.map((r) => r.length));
            if (!cols) continue;
            elements.push({ id: id(), kind: "table", ...at, z: z(), provenance: "human",
              table: { rows: rows.map((r) => [...r, ...Array(cols - r.length).fill("")]), header: kid(tbl, "a:tblPr")?.getAttribute("firstRow") === "1" } });
          } else if (uri.endsWith("/chart")) {
            const rid = find(node, "c:chart")?.getAttribute("r:id");
            const part = rid ? slideRels.get(rid)?.target : null;
            const chart = part ? await chartOf(zip, part) : null;
            if (chart) elements.push({ id: id(), kind: "chart", ...at, z: z(), provenance: "human", chart });
            else warn(n, "A chart of a kind the editor cannot draw yet was skipped.");
          } else warn(n, "An embedded object (SmartArt, video or OLE) was skipped.");
        }
      }
    };
    await walk(find(doc, "p:spTree"), { ox: 0, oy: 0, cx: 0, cy: 0, sx: 1, sy: 1 });

    const notesPath = [...slideRels.values()].find((r) => r.type === "notesSlide")?.target ?? null;
    const notesDoc = notesPath ? await xml(zip, notesPath) : null;
    const body = notesDoc ? all(notesDoc, "p:sp").find((sp) => find(find(sp, "p:nvPr"), "p:ph")?.getAttribute("type") === "body") : null;
    const notes = body ? kids(find(body, "p:txBody"), "a:p").map((p) => all(p, "a:t").map((tt) => tt.textContent).join("")).join("\n").trim() : "";
    scenes.push({ id: slideId, width: SCENE_W, height: SCENE_H, background: { fill }, elements, layoutState: "detached", ...(notes ? { notes: notes.slice(0, 20000), notesEdited: true } : {}) });
  }
  const core = await xml(zip, "docProps/core.xml");
  // A tool's placeholder title ("PptxGenJS Presentation", "PowerPoint
  // Presentation") names nothing; the file's own name does.
  const declared = (find(core, "dc:title")?.textContent ?? "").trim();
  const title = (declared && !/^(PptxGenJS|PowerPoint) Presentation$/i.test(declared) ? declared : "") || path.basename(filename, path.extname(filename)) || "Imported presentation";
  return { title: title.slice(0, 200), scenes, assets: [...assets.values()], warnings };
}

// A PowerPoint upload becomes a new project the person owns, its pictures
// stored as the project's assets, with the warnings to show them.
export async function importPptxProject({ owner = null, bytes, filename = "presentation.pptx" }) {
  const { title, scenes, assets, warnings } = await pptxToScenes(bytes, { filename });
  const { projectStore } = await import("./backend.js");
  const store = await projectStore();
  const result = await store.createProject({ owner, title, scenes, assets, origin: { kind: "import", file: String(filename).slice(0, 200) } });
  return { project: result.doc, warnings };
}
