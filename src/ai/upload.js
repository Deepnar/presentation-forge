
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { CONFIG } from "../paths.js";

const run = promisify(execFile);

export const UPLOAD_EXT = new Set(["md", "txt", "markdown", "docx", "pdf"]);
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_MAX_WORDS = 60_000;

const STAGE_TTL_MS = 48 * 60 * 60 * 1000;

async function which(bin) {
  try {
    await run("which", [bin]);
    return true;
  } catch {
    return false;
  }
}

export function uploadStageDir() {
  return path.join(CONFIG, "uploads");
}

function tokenFile(token) {
  if (!/^up-[a-z0-9-]{4,}$/.test(token)) return null;
  return path.join(uploadStageDir(), `${token}.json`);
}

function decodeText(buf) {
  if (buf.includes(0)) throw new Error("file looks binary — .md/.txt uploads must be plain text");
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  let control = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) control++;
  }
  if (control / Math.max(text.length, 1) > 0.05) {
    throw new Error("file does not read as text — is it really a markdown/txt file?");
  }
  return text;
}

async function sofficeToText(buf, name, ext) {
  if (!(await which("soffice"))) {
    throw new Error("LibreOffice (soffice) not found — needed to read .docx/.pdf uploads");
  }
  const tmp = path.join(uploadStageDir(), ".convert");
  await mkdir(tmp, { recursive: true });
  const src = path.join(tmp, `src.${ext}`);
  await writeFile(src, buf);
  const profile = path.join(tmp, ".lo-profile");
  try {
    await run("soffice", [
      `-env:UserInstallation=file://${profile}`,
      "--headless", "--norestore", "--invisible",
      "--convert-to", "txt:Text (encoded):UTF8",
      "--outdir", tmp,
      src,
    ], { timeout: 120_000 });
    const out = path.join(tmp, `src.txt`);
    const text = await readFile(out, "utf8");
    return text.replace(/^\uFEFF/, "");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export async function ingestUpload(buf, { name = "", ext = "" } = {}) {
  if (!buf?.length) throw new Error("the file is empty");
  if (buf.length > UPLOAD_MAX_BYTES) {
    throw new Error(`file too large — max ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)} MB`);
  }
  const e = String(ext || path.extname(name) || "").replace(/^\./, "").toLowerCase();
  if (!UPLOAD_EXT.has(e)) {
    throw new Error("unsupported file type — upload a .md, .txt, .docx or .pdf");
  }

  const text = (e === "md" || e === "txt" || e === "markdown")
    ? decodeText(buf)
    : await sofficeToText(buf, name, e);
  const trimmed = text.trim();
  if (!trimmed) throw new Error("the file produced no readable text");
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  if (words > UPLOAD_MAX_WORDS) {
    throw new Error(`the file is too long — ${words.toLocaleString()} words; max ${UPLOAD_MAX_WORDS.toLocaleString()}`);
  }
  return { text: trimmed, name: name || `upload.${e}`, ext: e, words };
}

export async function stageUpload({ text, name, ext, words }) {
  await mkdir(uploadStageDir(), { recursive: true });
  await sweepStagedUploads();
  const token = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await writeFile(
    path.join(uploadStageDir(), `${token}.json`),
    JSON.stringify({ text, name, ext, words, at: new Date().toISOString() }),
    "utf8",
  );
  return { token, name, ext, words };
}

export async function readStagedUpload(token) {
  const file = tokenFile(token ?? "");
  if (!file) return null;
  try {
    const j = JSON.parse(await readFile(file, "utf8"));
    return { text: String(j.text ?? ""), name: String(j.name ?? "") };
  } catch {
    return null;
  }
}

export async function sweepStagedUploads() {
  let entries = [];
  try {
    entries = await readdir(uploadStageDir(), { withFileTypes: true });
  } catch { /* nothing staged yet */ }
  const now = Date.now();
  for (const e of entries) {
    if (!e.isFile() || !/^up-[a-z0-9-]+\.json$/.test(e.name)) continue;
    try {
      const s = await stat(path.join(uploadStageDir(), e.name));
      if (now - s.mtimeMs > STAGE_TTL_MS) await rm(path.join(uploadStageDir(), e.name), { force: true });
    } catch { /* already gone */ }
  }
}
