import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";

function fileFor(email) {
  const safe = String(email ?? "").replace(/[^a-zA-Z0-9@._-]/g, "_");
  return path.join(CONFIG, "presets", `${safe}.json`);
}

function sanitize(input) {
  const p = input ?? {};
  return {
    name: String(p.name ?? "").trim(),
    team: p.team ?? {},
    maxSlides: Number.isFinite(p.maxSlides) && p.maxSlides > 0 ? p.maxSlides : null,
    theme: String(p.theme ?? ""),
    density: String(p.density ?? "balanced"),
    branding: String(p.branding ?? "full"),
    slidesPerMember: Number.isFinite(p.slidesPerMember) && p.slidesPerMember > 0 ? p.slidesPerMember : null,
  };
}

function clean(input) {
  const p = input ?? {};
  return {
    ...(typeof p.id === "string" ? { id: p.id } : {}),
    ...(typeof p.createdAt === "string" ? { createdAt: p.createdAt } : {}),
    ...sanitize(p),
  };
}

export async function listPresets(email) {
  try {
    const raw = await readFile(fileFor(email), "utf8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(clean).filter((p) => p.name) : [];
  } catch {
    return [];
  }
}

export async function savePreset(email, input) {
  const p = sanitize(input);
  if (!p.name) throw new Error("preset needs a name");
  const list = await listPresets(email);
  const id = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const preset = { id, createdAt: new Date().toISOString(), ...p };
  await mkdir(path.dirname(fileFor(email)), { recursive: true });
  await writeFile(fileFor(email), JSON.stringify([preset, ...list], null, 2), "utf8");
  return preset;
}

export async function updatePreset(email, id, input) {
  const list = await listPresets(email);
  const p = sanitize(input);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("no such preset");
  list[i] = { ...list[i], ...p, id };
  await mkdir(path.dirname(fileFor(email)), { recursive: true });
  await writeFile(fileFor(email), JSON.stringify(list, null, 2), "utf8");
  return list[i];
}

export async function deletePreset(email, id) {
  const list = await listPresets(email);
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) throw new Error("no such preset");
  if (next.length) {
    await mkdir(path.dirname(fileFor(email)), { recursive: true });
    await writeFile(fileFor(email), JSON.stringify(next, null, 2), "utf8");
  } else {
    await rm(fileFor(email), { force: true }).catch(() => {});
  }
}

export async function clearPresets(email) {
  await rm(fileFor(email), { force: true }).catch(() => {});
}
