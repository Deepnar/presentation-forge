import { render } from "./render.js";
import { specimenDeck } from "./specimens.js";
import { slideFieldMeta, walkStrings } from "./ai/trim.js";
import { NON_TEXT } from "./textcheck.js";

const MARK = "Zamphirodex";

async function markable(slide) {
  const { strings } = await slideFieldMeta(slide.type);
  return strings.filter((p) => !NON_TEXT.has(p.split(".").at(-1).replace("[]", "")));
}

function marked(slide, path, mark) {
  const out = structuredClone(slide);
  let n = 0;
  for (const w of walkStrings(out, path)) {
    if (typeof w.value !== "string" || !w.value.trim()) continue;
    w.set(mark);
    n++;
  }
  return n ? out : null;
}

export async function drawCheck({ types, themes = ["warm-humanist"], deck: given } = {}) {
  const deck = given ?? (await specimenDeck());
  const wanted = types ? new Set(types) : null;
  const rows = [];

  for (const slide of deck.slides) {
    if (wanted && !wanted.has(slide.type)) continue;
    const seeded = { ...slide };
    for (const f of ["headline", "standfirst"]) {
      if (!seeded[f]?.trim()) seeded[f] = f;
    }
    for (const path of await markable(seeded)) {
      const one = marked(seeded, path, `${MARK} ${path}`);
      if (!one) { rows.push({ type: slide.type, path, verdict: "unpopulated" }); continue; }
      let drew = false;
      for (const theme of themes) {
        const probe = structuredClone(deck);
        probe.slides = [one];
        const r = await render({ deck: probe, themeName: theme, write: false });
        const found = (r.drawn[0] ?? []).some((t) => String(t).toUpperCase().includes(MARK.toUpperCase()));
        if (found) { drew = true; break; }
      }
      rows.push({ type: slide.type, path, verdict: drew ? "drawn" : "dropped" });
    }
  }
  return rows;
}
