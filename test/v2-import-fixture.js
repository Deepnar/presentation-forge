import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import YAML from "yaml";

export const IMPORT_DECK = {
  title: "Imported results", theme: "warm-humanist",
  slides: [
    { type: "title", headline: "Imported results" },
    { type: "chart", headline: "Conductivity", chart: { kind: "bar", categories: ["A", "B"], series: [{ name: "Score", values: [1.25, 12.5] }], unit: "mS/cm" } },
    { type: "table", headline: "Measurements", columns: ["Cell", "Score"], rows: [["A", "1.25"], ["B", "12.5"]] },
  ],
};

export async function importApiFixture(extraEnv = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-import-api-"));
  const port = await new Promise((resolve, reject) => {
    const server = createServer(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
  const env = {
    ...process.env, FORGE_API_PORT: String(port), FORGE_CONFIG_DIR: path.join(dir, "config"),
    FORGE_DB_PATH: path.join(dir, "forge.db"), FORGE_DECKS_DIR: path.join(dir, "decks"),
    FORGE_HOSTED: "1", FORGE_LOCAL_MULTI_USER: "1", FORGE_AUTH_RATE_LIMIT: "100",
    FORGE_SMTP_HOST: "", FORGE_PROJECTS_BACKEND: "sqlite", ...extraEnv,
  };
  const processHandle = spawn(process.execPath, ["app/server/index.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const stop = async () => {
    if (processHandle.exitCode === null && processHandle.signalCode === null) {
      await new Promise(resolve => {
        const kill = setTimeout(() => processHandle.kill("SIGKILL"), 3000);
        processHandle.once("exit", () => { clearTimeout(kill); resolve(); }); processHandle.kill("SIGTERM");
      });
    }
    await rm(dir, { recursive: true, force: true });
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`API startup timed out: ${output}`)), 15000);
      const data = bytes => { output = (output + String(bytes)).slice(-6000); if (output.includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } };
      processHandle.stdout.on("data", data); processHandle.stderr.on("data", data);
      processHandle.once("exit", code => { clearTimeout(timer); reject(new Error(`API exited ${code}: ${output}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    const request = (route, { token, ...options } = {}) => fetch(`${base}${route}`, {
      ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
    const register = async email => {
      const response = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Import test", email, password: "test-password-123" }) });
      const result = await response.json(); if (!response.ok || !result.user) throw new Error("registration failed");
      const login = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "test-password-123" }) }).then(r => r.json());
      if (!login.token) throw new Error("login failed"); return login.token;
    };
    const owner = "import-owner@example.test", other = "import-other@example.test";
    const token = await register(owner), otherToken = await register(other);
    let serial = 0;
    const source = async ({ deck = IMPORT_DECK, sourceOwner = owner, meta = {} } = {}) => {
      const slug = `source-${++serial}`, folder = path.join(env.FORGE_DECKS_DIR, slug);
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "deck.yaml"), YAML.stringify(deck));
      await writeFile(path.join(folder, "meta.yaml"), YAML.stringify({ owner: sourceOwner, status: "ready", ...meta }));
      return { slug, folder };
    };
    const create = (slug, { requestId = "request-one", mode, ...options } = {}) => request(`/api/decks/${slug}/v2-project`, { token, method: "POST", body: JSON.stringify({ requestId, ...(mode ? { mode } : {}) }), ...options });
    return { base, env, owner, token, otherToken, request, source, create, stop, dir };
  } catch (error) { await stop(); throw error; }
}
