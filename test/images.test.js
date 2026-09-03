import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  licenceTier, queryTerms, queryLadder, rankCandidates,
  imageSeat, seatImage, supplyDeckImages, makeBudget,
} from "../src/ai/images.js";

/* --------------------------------------------------------------- licences */

test("licence tiers rank public domain above BY above BY-SA", () => {
  for (const c of ["cc0", "pdm", "pd", "cc0-1.0", "public-domain"]) {
    assert.equal(licenceTier(c), 0, `${c} should be tier 0`);
  }
  for (const c of ["by", "cc-by-4.0", "cc-by-2.0"]) {
    assert.equal(licenceTier(c), 1, `${c} should be tier 1`);
  }
  for (const c of ["by-sa", "cc-by-sa-4.0", "cc-by-sa-3.0"]) {
    assert.equal(licenceTier(c), 2, `${c} should be tier 2`);
  }
});

test("NonCommercial and NoDerivatives are refused, not down-ranked", () => {
  // `by-nc-sa` matches the BY-SA pattern too — the refusal has to win.
  for (const c of ["by-nc", "by-nd", "by-nc-sa", "by-nc-nd", "cc-by-nc-4.0", "cc-by-nd-4.0"]) {
    assert.equal(licenceTier(c), null, `${c} must be refused`);
  }
});

test("an unreadable licence is refused — 'unknown' is not a licence", () => {
  for (const c of ["", null, undefined, "fair use", "gfdl", "all rights reserved"]) {
    assert.equal(licenceTier(c), null);
  }
});

/* ------------------------------------------------------------------ query */

test("the ladder drops the picture-kind word that makes the query fail", () => {
  // Measured against the live upstream: "electrolysis cell diagram" returns 0
  // results and "electrolysis" returns hundreds. The word costing the match is
  // the one naming the KIND of picture.
  const rungs = queryLadder("a diagram of the electrolysis cell");
  assert.equal(rungs[0], "diagram electrolysis cell");
  assert.ok(rungs.includes("electrolysis cell"), `expected a subject-only rung, got ${JSON.stringify(rungs)}`);
  assert.equal(rungs.at(-1), "electrolysis", "the last rung is the single most distinctive word");
});

test("stopwords go and the writer's word order is kept", () => {
  assert.deepEqual(queryTerms("a photo of the rooftop solar array"), ["photo", "rooftop", "solar", "array"]);
  assert.equal(queryLadder("a photo of the rooftop solar array")[1], "rooftop solar array");
});

test("the ladder dedupes and survives a description with nothing in it", () => {
  assert.deepEqual(queryLadder("perovskite"), ["perovskite"]);
  assert.deepEqual(queryLadder("   "), []);
  assert.deepEqual(queryLadder("the a of"), []);
  // A description that is ONLY picture-kind words still has to search for something.
  assert.deepEqual(queryLadder("a diagram"), ["diagram"]);
});

/* ----------------------------------------------------------------- ranking */

const cand = (over) => ({ src: "x", tier: 1, width: 1200, height: 800, ...over });

test("least licence debt wins, then the larger image", () => {
  const ranked = rankCandidates([
    cand({ src: "bysa", tier: 2, width: 4000, height: 2400 }),
    cand({ src: "by-small", tier: 1, width: 800 }),
    cand({ src: "by-big", tier: 1, width: 2000 }),
    cand({ src: "pd", tier: 0, width: 700 }),
  ]);
  assert.deepEqual(ranked.map((c) => c.src), ["pd", "by-big", "by-small", "bysa"]);
});

test("too small or too letterboxed is dropped before it is downloaded", () => {
  const ranked = rankCandidates([
    cand({ src: "narrow", width: 320, height: 240 }),
    cand({ src: "panorama", width: 4000, height: 400 }),
    cand({ src: "totem", width: 800, height: 4000 }),
    cand({ src: "good", width: 1600, height: 900 }),
    cand({ src: "unknown-size", width: undefined, height: undefined }),
  ]);
  const kept = ranked.map((c) => c.src);
  assert.ok(kept.includes("good"));
  assert.ok(kept.includes("unknown-size"), "unknown dimensions are verified at download, not guessed at");
  for (const bad of ["narrow", "panorama", "totem"]) {
    assert.ok(!kept.includes(bad), `${bad} should have been dropped`);
  }
});

/* ----------------------------------------------------------------- seating */

test("a type that REQUIRES an image is never a seat waiting to be filled", async () => {
  // image / image-text / hero-image / image-grid all require the field, so a
  // validated deck cannot contain one that is missing it.
  for (const t of ["image", "image-text", "hero-image", "image-grid"]) {
    assert.equal(await imageSeat(t), null, `${t} requires its image`);
  }
  assert.equal(await imageSeat("testimonial"), "image", "testimonial's image is optional — fillable in place");
  assert.equal(await imageSeat("bullets"), null);
});

test("an optional seat is filled in place, changing nothing else", async () => {
  const slide = { type: "testimonial", quote: "It worked.", name: "A. Person", role: "Engineer" };
  const out = await seatImage(slide, "assets/auto/abc.png");
  assert.equal(out.type, "testimonial");
  assert.equal(out.image, "assets/auto/abc.png");
  assert.equal(out.quote, "It worked.");
});

test("a short list is promoted to image-text without losing a point", async () => {
  const slide = {
    type: "bullets", headline: "Why it matters", section: 1, presenter: "Ann",
    bullets: ["Cost falls", "Storage scales", "Grid stabilises", "Jobs follow"],
  };
  const out = await seatImage(slide, "assets/auto/abc.png");
  assert.equal(out.type, "image-text");
  assert.equal(out.image, "assets/auto/abc.png");
  assert.deepEqual(out.body, slide.bullets, "every bullet survives the promotion");
  assert.equal(out.bullets, undefined, "the old field is gone, not left beside the new one");
  assert.equal(out.section, 1);
  assert.equal(out.presenter, "Ann");
});

test("a list too long for image-text is NOT promoted — content beats decoration", async () => {
  // `image-text.body` caps at 4. Six bullets cannot go in without dropping two,
  // and dropping them unattended to make room for a photograph is the wrong trade.
  const slide = {
    type: "bullets", headline: "Six things",
    bullets: ["One", "Two", "Three", "Four", "Five", "Six"],
  };
  assert.equal(await seatImage(slide, "assets/auto/abc.png"), null);
});

test("a slide with no headline cannot be promoted — image-text requires one", async () => {
  const slide = { type: "bullets", bullets: ["One", "Two", "Three", "Four"] };
  assert.equal(await seatImage(slide, "assets/auto/abc.png"), null);
});

test("a type with no image field and no list mapping is left alone", async () => {
  assert.equal(await seatImage({ type: "quote", quote: "Q", attribution: "A" }, "assets/auto/a.png"), null);
});

/* ------------------------------------------------------- the whole path */

/** A PNG the size checks accept: real magic bytes, padded past the 8KB floor. */
function fakePng() {
  const buf = Buffer.alloc(20_000, 0x20);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  return buf;
}

function commonsBody({ licence = "cc0", short = "CC0", artist = "<a href='/x'>A. Photographer</a>" } = {}) {
  return {
    query: {
      pages: {
        "1": {
          title: "File:Rooftop solar array.png",
          imageinfo: [{
            url: "https://upload.wikimedia.org/full.png",
            thumburl: "https://upload.wikimedia.org/thumb.png",
            thumbwidth: 1600, thumbheight: 900,
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Rooftop_solar_array.png",
            mime: "image/png",
            extmetadata: {
              License: { value: licence },
              LicenseShortName: { value: short },
              LicenseUrl: { value: "https://creativecommons.org/publicdomain/zero/1.0/" },
              Artist: { value: artist },
            },
          }],
        },
      },
    },
  };
}

/** Stand in for the network for one call, and record what was asked for. */
async function withStubbedFetch(handler, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return handler(String(url), init, calls);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

const jsonRes = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});

const imgRes = () => new Response(fakePng(), {
  status: 200, headers: { "content-type": "image/png" },
});

async function inTmpDeck(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-images-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const deckWithNote = (slide) => ({
  title: "Test deck",
  sections: ["A"],
  slides: [
    { type: "title", headline: "Test deck" },
    slide,
    { type: "closing", headline: "Thanks" },
  ],
});

test("a note becomes a real local image, a promotion, and a credit", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Rooftop solar", section: 0,
      bullets: ["Cheaper", "Faster", "Cleaner", "Local"],
      notes: "[image] a photo of a rooftop solar array\nSay it plainly.",
    });

    const { deck: out, supplied, skipped, credits } = await withStubbedFetch(
      (url) => (url.includes("commons.wikimedia.org") ? jsonRes(commonsBody()) : imgRes()),
      () => supplyDeckImages(deck, dir, { budget: makeBudget() }),
    );

    assert.equal(skipped.length, 0);
    assert.equal(supplied.length, 1);
    const slide = out.slides[1];
    assert.equal(slide.type, "image-text", "a bullets slide is promoted to carry the picture");
    assert.match(slide.image, /^assets\/auto\/[0-9a-f]{12}\.png$/, "a deck-relative local path, never a URL");
    assert.deepEqual(slide.body, ["Cheaper", "Faster", "Cleaner", "Local"]);
    assert.equal(slide.notes, "Say it plainly.", "the [image] line goes, the rest of the note stays");

    // The bytes are really on disk under the deck, which is what resolveAsset needs.
    const bytes = await readFile(path.join(dir, slide.image));
    assert.ok(bytes.length > 8_000);

    assert.equal(credits.length, 1);
    assert.equal(credits[0].licence_code, "cc0");
    assert.equal(credits[0].attribution_required, false);
    assert.equal(credits[0].creator, "A. Photographer", "the Artist HTML is reduced to a name");
    assert.equal(credits[0].slide, 2);
  });
});

test("the input deck is never mutated — a failed supply must be undoable", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Rooftop solar",
      bullets: ["Cheaper", "Faster", "Cleaner", "Local"],
      notes: "[image] a rooftop solar array",
    });
    const before = JSON.stringify(deck);
    await withStubbedFetch(
      (url) => (url.includes("commons.wikimedia.org") ? jsonRes(commonsBody()) : imgRes()),
      () => supplyDeckImages(deck, dir, { budget: makeBudget() }),
    );
    assert.equal(JSON.stringify(deck), before, "the caller's deck is untouched");
  });
});

test("an attribution-owing licence writes a credits file that says so", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Electrolysis",
      bullets: ["Split water", "Store it", "Burn it clean", "Repeat"],
      notes: "[image] a diagram of the electrolysis cell",
    });
    const { credits } = await withStubbedFetch(
      (url) => (url.includes("commons.wikimedia.org")
        ? jsonRes(commonsBody({ licence: "cc-by-sa-4.0", short: "CC BY-SA 4.0" }))
        : imgRes()),
      () => supplyDeckImages(deck, dir, { budget: makeBudget() }),
    );
    assert.equal(credits[0].attribution_required, true);

    const md = await readFile(path.join(dir, "CREDITS.md"), "utf8");
    assert.match(md, /REQUIRE attribution/);
    assert.match(md, /CC BY-SA 4\.0/);
    assert.match(md, /A\. Photographer/);

    const json = JSON.parse(await readFile(path.join(dir, "assets", "auto", "credits.json"), "utf8"));
    assert.equal(json.length, 1);
    assert.equal(json[0].licence_code, "cc-by-sa-4.0");
  });
});

test("an NC-only result supplies nothing and keeps the note for the manual door", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Rooftop solar",
      bullets: ["Cheaper", "Faster", "Cleaner", "Local"],
      notes: "[image] a rooftop solar array",
    });
    const { deck: out, supplied, skipped } = await withStubbedFetch(
      (url) => (url.includes("commons.wikimedia.org")
        ? jsonRes(commonsBody({ licence: "cc-by-nc-4.0", short: "CC BY-NC 4.0" }))
        : jsonRes({ results: [] })),
      () => supplyDeckImages(deck, dir, { budget: makeBudget() }),
    );
    assert.equal(supplied.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(out.slides[1].type, "bullets", "the slide is left exactly as the writer wrote it");
    assert.match(out.slides[1].notes, /\[image\]/, "the note survives so the 'add image' badge still shows");
  });
});

test("a slide that cannot seat an image costs no network request at all", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Six things",
      bullets: ["One", "Two", "Three", "Four", "Five", "Six"],
      notes: "[image] a rooftop solar array",
    });
    const { supplied, skipped } = await withStubbedFetch(
      () => { throw new Error("no request should have been made"); },
      (calls) => supplyDeckImages(deck, dir, { budget: makeBudget() })
        .then((r) => { assert.equal(calls.length, 0, "seatability is checked before the budget is spent"); return r; }),
    );
    assert.equal(supplied.length, 0);
    assert.match(skipped[0].reason, /cannot carry an image/);
  });
});

test("the ladder stops at the first rung that lands", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Electrolysis",
      bullets: ["Split water", "Store it", "Burn it clean", "Repeat"],
      notes: "[image] a diagram of the electrolysis cell",
    });
    const searches = [];
    await withStubbedFetch(
      (url) => {
        if (url.includes("commons.wikimedia.org")) {
          searches.push(new URL(url).searchParams.get("gsrsearch"));
          return jsonRes(commonsBody());
        }
        return imgRes();
      },
      () => supplyDeckImages(deck, dir, { budget: makeBudget() }),
    );
    assert.deepEqual(searches, ["diagram electrolysis cell"], "the first rung answered, so no rung after it is tried");
  });
});

test("Openverse is only asked when Commons has nothing usable", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Rooftop solar",
      bullets: ["Cheaper", "Faster", "Cleaner", "Local"],
      notes: "[image] rooftop solar array",
    });
    const hosts = [];
    const { supplied, credits } = await withStubbedFetch(
      (url) => {
        hosts.push(new URL(url).host);
        if (url.includes("commons.wikimedia.org")) return jsonRes({ query: { pages: {} } });
        if (url.includes("api.openverse.org")) {
          return jsonRes({
            results: [{
              url: "https://live.staticflickr.com/x.png", title: "Array", creator: "P. Hotographer",
              license: "by", license_version: "4.0", license_url: "https://creativecommons.org/licenses/by/4.0/",
              foreign_landing_url: "https://flickr.com/x", source: "flickr", width: 1600, height: 900,
            }],
          });
        }
        return imgRes();
      },
      () => supplyDeckImages(deck, dir, { budget: makeBudget() }),
    );
    assert.ok(hosts.includes("commons.wikimedia.org"), "Commons is asked first");
    assert.ok(hosts.includes("api.openverse.org"), "Openverse picks up what Commons missed");
    assert.equal(supplied.length, 1);
    assert.equal(credits[0].source, "openverse/flickr");
    assert.equal(credits[0].attribution_required, true);
  });
});

test("the Openverse budget is a hard ceiling, not a hope", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Rooftop solar",
      bullets: ["Cheaper", "Faster", "Cleaner", "Local"],
      notes: "[image] rooftop solar array turbine hydro",
    });
    let openverseCalls = 0;
    await withStubbedFetch(
      (url) => {
        if (url.includes("commons.wikimedia.org")) return jsonRes({ query: { pages: {} } });
        openverseCalls++;
        return jsonRes({ results: [] });
      },
      () => supplyDeckImages(deck, dir, { budget: makeBudget({ openverse: 1 }) }),
    );
    assert.equal(openverseCalls, 1, "the ladder keeps walking but the spent budget refuses to pay");
  });
});

test("a download whose bytes are not an image is refused", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({
      type: "bullets", headline: "Rooftop solar",
      bullets: ["Cheaper", "Faster", "Cleaner", "Local"],
      notes: "[image] rooftop solar array",
    });
    const { supplied, skipped } = await withStubbedFetch(
      (url) => (url.includes("commons.wikimedia.org")
        ? jsonRes(commonsBody())
        : new Response(Buffer.alloc(20_000, 0x3c), { status: 200, headers: { "content-type": "image/png" } })),
      () => supplyDeckImages(deck, dir, { budget: makeBudget() }),
    );
    // An HTML error page served as image/png is the classic shape. The magic
    // bytes are the check, not the header the server claims.
    assert.equal(supplied.length, 0);
    assert.equal(skipped.length, 1);
  });
});

test("a deck with no [image] note spends nothing and returns itself", async () => {
  await inTmpDeck(async (dir) => {
    const deck = deckWithNote({ type: "bullets", headline: "H", bullets: ["a", "b", "c", "d"] });
    const r = await withStubbedFetch(
      () => { throw new Error("no request expected"); },
      () => supplyDeckImages(deck, dir, { budget: makeBudget() }),
    );
    assert.equal(r.deck, deck);
    assert.deepEqual(r.supplied, []);
    assert.deepEqual(r.credits, []);
  });
});
