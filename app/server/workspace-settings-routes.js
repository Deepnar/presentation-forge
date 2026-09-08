/** Per-account presets, identity, brand assets, and report-template routes. */

import express from "express";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  deepMerge, loadBaseIdentity, loadUserIdentity, saveUserIdentity,
} from "../../src/ai/identity.js";
import { reportUnavailable } from "../../src/ai/pipeline.js";
import { userBrandDirs, userReferenceDir } from "../../src/tenant.js";
import { donorDirFor, donorStatus } from "../../src/report.js";
import { REFERENCE } from "../../src/paths.js";
import { deletePreset, listPresets, savePreset, updatePreset } from "../../src/presets.js";
import { normalizeBrand } from "../../tools/prep-brand.mjs";
import { requireAdminUser, requireAuth } from "./auth-routes.js";
import { fail, ok, wrap } from "./http.js";

const BRAND_ASSETS = ["crest", "banner", "watermark"];
const BRAND_IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "tiff"]);
const DONOR_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const presetBody = (body = {}) => {
  const { name, team, maxSlides, theme, density, branding, slidesPerMember } = body;
  return { name, team, maxSlides, theme, density, branding, slidesPerMember };
};

async function brandStatus(email) {
  const dirs = userBrandDirs(email);
  const entries = await readdir(dirs.logos, { withFileTypes: true }).catch(() => []);
  const sources = {};
  for (const name of BRAND_ASSETS) {
    sources[name] = entries.find((entry) =>
      !entry.isDirectory() && entry.name.startsWith(`${name}.`))?.name ?? null;
  }
  return { sources, placeholder: !Object.values(sources).some(Boolean) };
}

async function syncBrandIdentity(email) {
  const dirs = userBrandDirs(email);
  const status = await brandStatus(email);
  const next = { ...await loadUserIdentity(email) };
  if (status.placeholder) {
    delete next.brand;
  } else {
    next.brand = {
      ...(status.sources.banner ? { banner: dirs.rel.banner } : {}),
      ...(status.sources.crest ? { crest: dirs.rel.crest, crest_light: dirs.rel.crest_light } : {}),
      ...(status.sources.watermark ? { watermark: dirs.rel.watermark } : {}),
    };
  }
  await saveUserIdentity(email, next);
  return status;
}

async function acceptDonorUpload(req, res, directory) {
  if (!req.body?.length) {
    fail(res, 400, "empty upload");
    return null;
  }
  if (!req.body.subarray(0, 4).equals(DONOR_MAGIC)) {
    fail(res, 400, "that is not a .docx file");
    return null;
  }
  let name = "";
  try { name = decodeURIComponent(String(req.headers["x-file-name"] ?? "")); } catch {}
  name = path.basename(name).replace(/[^\w .()-]/g, "").slice(0, 120);
  if (!name.toLowerCase().endsWith(".docx")) name = `${name || "template"}.docx`;
  await mkdir(directory, { recursive: true });
  for (const file of await readdir(directory).catch(() => [])) {
    if (file.toLowerCase().endsWith(".docx")) await rm(path.join(directory, file), { force: true });
  }
  await writeFile(path.join(directory, name), req.body);
  return name;
}

export function registerWorkspaceSettingsRoutes(app, { sniffImage }) {
  app.get("/api/presets", wrap(async (req, res) => {
    ok(res, { presets: await listPresets(req.user.email) });
  }));
  app.post("/api/presets", wrap(async (req, res) => {
    ok(res, { preset: await savePreset(req.user.email, presetBody(req.body)) });
  }));
  app.put("/api/presets/:id", wrap(async (req, res) => {
    ok(res, { preset: await updatePreset(req.user.email, req.params.id, presetBody(req.body)) });
  }));
  app.delete("/api/presets/:id", wrap(async (req, res) => {
    await deletePreset(req.user.email, req.params.id);
    ok(res);
  }));

  app.get("/api/identity", wrap(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const base = await loadBaseIdentity();
    const own = await loadUserIdentity(user.email);
    ok(res, { identity: deepMerge(base, own), overrides: own });
  }));
  app.put("/api/identity", wrap(async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const { identity } = req.body ?? {};
    if (!identity || typeof identity !== "object") return fail(res, 400, "body must include `identity`");
    await saveUserIdentity(user.email, identity);
    ok(res);
  }));

  app.get("/api/brand", wrap(async (req, res) => {
    const user = await requireAuth(req, res, "log in to manage brand marks");
    if (user) ok(res, { brand: await brandStatus(user.email) });
  }));
  app.post("/api/brand/:name", (req, res) => {
    const name = req.params.name;
    if (!BRAND_ASSETS.includes(name)) return fail(res, 400, `unknown brand asset "${name}"`);
    const extension = typeof req.headers["x-file-ext"] === "string"
      ? req.headers["x-file-ext"].toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    if (!BRAND_IMAGE_EXT.has(extension)) {
      return fail(res, 400, `unsupported image extension — allowed: ${[...BRAND_IMAGE_EXT].join(", ")}`);
    }
    express.raw({ type: () => true, limit: "20mb" })(req, res, (error) => {
      if (error) return fail(res, 413, "image too large — max 20 MB");
      (async () => {
        const user = await requireAuth(req, res, "log in to upload brand marks");
        if (!user) return;
        if (!req.body?.length) return fail(res, 400, "empty upload");
        if (!sniffImage(req.body, extension)) return fail(res, 400, `file does not look like a ${extension} image`);
        const dirs = userBrandDirs(user.email);
        const file = path.join(dirs.logos, `${name}.${extension}`);
        await mkdir(dirs.logos, { recursive: true });
        for (const entry of await readdir(dirs.logos).catch(() => [])) {
          if (entry.startsWith(`${name}.`) && entry !== path.basename(file)) {
            await rm(path.join(dirs.logos, entry), { force: true });
          }
        }
        await writeFile(file, req.body);
        await normalizeBrand({ srcDir: dirs.logos, outDir: dirs.generated, placeholders: false });
        ok(res, { asset: name, file: path.basename(file), brand: await syncBrandIdentity(user.email) });
      })().catch((error) => fail(res, 500, error.message));
    });
  });
  app.delete("/api/brand/:name", wrap(async (req, res) => {
    const user = await requireAuth(req, res, "log in to manage brand marks");
    if (!user) return;
    const name = req.params.name;
    if (!BRAND_ASSETS.includes(name)) return fail(res, 400, `unknown brand asset "${name}"`);
    const dirs = userBrandDirs(user.email);
    let removed = null;
    for (const entry of await readdir(dirs.logos).catch(() => [])) {
      if (entry.startsWith(`${name}.`)) {
        await rm(path.join(dirs.logos, entry), { force: true });
        removed = entry;
      }
    }
    await rm(path.join(dirs.generated, `${name}.png`), { force: true });
    if (name === "crest") await rm(path.join(dirs.generated, "crest-light.png"), { force: true });
    await normalizeBrand({ srcDir: dirs.logos, outDir: dirs.generated, placeholders: false });
    ok(res, { asset: name, removed, brand: await syncBrandIdentity(user.email) });
  }));

  app.get("/api/donor", wrap(async (req, res) => {
    const user = await requireAuth(req, res, "log in to manage your report template");
    if (!user) return;
    const own = await donorStatus(userReferenceDir(user.email));
    const effective = await donorStatus(await donorDirFor(user.email));
    ok(res, { own, effective, fallback: !own.ok, message: effective.ok ? null : reportUnavailable(effective) });
  }));
  app.post("/api/donor", (req, res) => {
    express.raw({ type: () => true, limit: "25mb" })(req, res, (error) => {
      if (error) return fail(res, 413, "template too large — max 25 MB");
      (async () => {
        const user = await requireAuth(req, res, "log in to upload a report template");
        if (!user) return;
        const donor = await acceptDonorUpload(req, res, userReferenceDir(user.email));
        if (donor !== null) ok(res, { donor });
      })().catch((error) => fail(res, 500, error.message));
    });
  });
  app.delete("/api/donor", wrap(async (req, res) => {
    const user = await requireAuth(req, res, "log in to manage your report template");
    if (!user) return;
    const directory = userReferenceDir(user.email);
    let removed = null;
    for (const file of await readdir(directory).catch(() => [])) {
      if (file.toLowerCase().endsWith(".docx")) {
        await rm(path.join(directory, file), { force: true });
        removed = file;
      }
    }
    ok(res, { removed, effective: await donorStatus(await donorDirFor(user.email)) });
  }));

  app.get("/api/admin/donor", wrap(async (req, res) => {
    if (!(await requireAdminUser(req, res))) return;
    const donor = await donorStatus();
    ok(res, { ...donor, message: donor.ok ? null : reportUnavailable(donor) });
  }));
  app.post("/api/admin/donor", (req, res) => {
    express.raw({ type: () => true, limit: "25mb" })(req, res, (error) => {
      if (error) return fail(res, 413, "template too large — max 25 MB");
      (async () => {
        if (!(await requireAdminUser(req, res))) return;
        const donor = await acceptDonorUpload(req, res, REFERENCE);
        if (donor !== null) ok(res, { donor });
      })().catch((error) => fail(res, 500, error.message));
    });
  });
}
