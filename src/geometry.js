import { CANVAS } from "./chrome.js";

const ORNAMENT = 0.02;

export function watchGeometry(slide) {
  const found = [];
  const drawn = [];

  const check = (kind, o) => {
    if (!o || typeof o !== "object") return;
    const { x, y, w, h } = footprint(o);
    if ([x, y, w, h].some((v) => typeof v !== "number" || !Number.isFinite(v))) return;
    if (w <= 0 || h <= 0) {
      report(found, `${kind} has a ${w <= 0 ? "width" : "height"} of ${round(w <= 0 ? w : h)}in`);
      return; // every other verdict on a degenerate box is noise
    }
    if (w < ORNAMENT && h < ORNAMENT) return;

    if (kind === "shape") return;

    const over = [
      x < -0.01 ? `${round(-x)}in off the left edge` : null,
      y < -0.01 ? `${round(-y)}in off the top edge` : null,
      x + w > CANVAS.w + 0.01 ? `${round(x + w - CANVAS.w)}in past the right edge` : null,
      y + h > CANVAS.h + 0.01 ? `${round(y + h - CANVAS.h)}in past the bottom edge` : null,
    ].filter(Boolean);
    if (over.length) report(found, `${kind} sits ${over.join(" and ")}`);
  };

  const wrapped = new Proxy(slide, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || !String(prop).startsWith("add")) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (...args) => {
        const kind = String(prop).replace(/^add/, "").toLowerCase();
        check(kind, args.at(-1));
        if (kind === "text") collect(drawn, args[0]);
        else if (kind === "table") collect(drawn, args[0]);
        else if (kind === "chart") collect(drawn, args[1]);
        return value.apply(target, args);
      };
    },
  });

  return { slide: wrapped, problems: () => found, drawn: () => drawn };
}

function collect(into, node, depth = 0) {
  if (depth > 6) return;
  if (typeof node === "string") into.push(node);
  else if (Array.isArray(node)) for (const it of node) collect(into, it, depth + 1);
  else if (node && typeof node === "object") {
    for (const key of ["text", "name", "labels"]) {
      if (key in node) collect(into, node[key], depth + 1);
    }
  }
}

function report(found, message) {
  found.push(message);
  if (!process.env.FORGE_GEOM_TRACE) return;
  const at = new Error().stack.split("\n").slice(3, 6).map((l) => l.trim()).join(" | ");
  console.error(`  geometry: ${message}\n    ${at}`);
}

function footprint({ x, y, w, h, rotate }) {
  const turn = ((Number(rotate) || 0) % 360 + 360) % 360;
  if (turn !== 90 && turn !== 270) return { x, y, w, h };
  if ([x, y, w, h].some((v) => typeof v !== "number")) return { x, y, w, h };
  return { x: x + w / 2 - h / 2, y: y + h / 2 - w / 2, w: h, h: w };
}

const round = (n) => Math.round(n * 100) / 100;
