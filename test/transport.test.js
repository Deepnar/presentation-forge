import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT } from "../src/paths.js";
import { applyTransport, authorTransport, researchExcerptCap, researchProfile, chat, ollamaThink, DEFAULT_EXCERPT_CHARS } from "../src/ai/ollama.js";
import { excerptResearch, RESEARCH_EXCERPT } from "../src/ai/research.js";
import { providerModels, setHostedForTest } from "../src/cloud.js";

/**
 * Whichever model config/models.yaml currently gives the author role.
 *
 * These tests fake `/api/tags` so `resolveRole` believes the configured model
 * is installed; hardcoding its name made them fail the day the config named a
 * different one, which is a fact about the config and not about the transport
 * they exist to exercise.
 */
async function configuredAuthorModel() {
  const cfg = YAML.parse(await readFile(path.join(ROOT, "config", "models.yaml"), "utf8"));
  return cfg.roles.author.model;
}

// These exercise the LOCAL Ollama transport, so they must run in local mode.
// Without this the result depends on whether this machine's admin toggle
// (config/hosted.json) happens to be flipped — green in CI, red on a box that
// has been switched to hosted.
setHostedForTest(false);

/* -------------------------------------------------------- applyTransport */

test("applyTransport leaves a spec without overrides untouched", () => {
  const spec = { role: "author", num_predict: 12000 };
  assert.equal(applyTransport(spec, { type: "ollama" }), spec);
  assert.equal(applyTransport(spec, { type: "openai-compatible" }), spec);
});

test("applyTransport merges the cloud override only onto the cloud backend", () => {
  const spec = { num_predict: 12000, excerpt_chars: 80000, transports: { cloud: { num_predict: 24000, excerpt_chars: 240000 } } };
  const cloud = applyTransport(spec, { type: "openai-compatible" });
  assert.equal(cloud.num_predict, 24000);
  assert.equal(cloud.excerpt_chars, 240000);
  const local = applyTransport(spec, { type: "ollama" });
  assert.equal(local.num_predict, 12000);
  assert.equal(local.excerpt_chars, 80000);
});

test("applyTransport replaces nested blocks wholesale, not as patches", () => {
  const spec = { research: { angle_max: 8, per_query_limit: 8 }, transports: { cloud: { research: { angle_max: 10 } } } };
  const cloud = applyTransport(spec, { type: "openai-compatible" });
  assert.equal(cloud.research.angle_max, 10);
  assert.equal(cloud.research.per_query_limit, undefined); // replaced, not merged
});

test("the local override wins on the local backend when both are declared", () => {
  const spec = { num_predict: 12000, transports: { local: { num_predict: 8000 }, cloud: { num_predict: 24000 } } };
  assert.equal(applyTransport(spec, { type: "ollama" }).num_predict, 8000);
  assert.equal(applyTransport(spec, { type: "openai-compatible" }).num_predict, 24000);
});

test("authorTransport resolves by explicit model name without touching routing", async () => {
  // deepseek-v4-flash is a declared opencode-go model → cloud.
  assert.equal(await authorTransport({ model: "deepseek-v4-flash" }), "cloud");
  // A name on no provider's list (a local pull) → ollama.
  assert.equal(await authorTransport({ model: "qwen3:4b-instruct" }), "ollama");
});

test("researchExcerptCap follows the transport of the model that will read the notes", async () => {
  assert.equal(await researchExcerptCap({ model: "deepseek-v4-flash" }), 240_000);
  assert.equal(await researchExcerptCap({ model: "qwen3:4b-instruct" }), DEFAULT_EXCERPT_CHARS);
});

test("researchProfile resolves the research role's transport-aware depth", async () => {
  const local = await researchProfile();
  // The committed research role is local-first → the local budgets.
  assert.equal(local.angle_max, 8);
  assert.equal(local.per_query_limit, 8);
  assert.ok(local.papers_limit >= 6);
  // A fabricated cloud spec deepens every stage.
  const spec = {
    research: { angle_max: 8, per_query_limit: 8, per_query_read: 4 },
    transports: { cloud: { research: { angle_max: 10, per_query_limit: 12, per_query_read: 8 } } },
  };
  const cloud = applyTransport(spec, { type: "openai-compatible" }).research;
  assert.equal(cloud.angle_max, 10);
  assert.equal(cloud.per_query_limit, 12);
  assert.equal(cloud.per_query_read, 8);
});

/* ------------------------------------------------- models.yaml contract */

test("models.yaml declares a per-transport split that is strictly deeper on cloud", async () => {
  const cfg = YAML.parse(await readFile(path.join(ROOT, "config", "models.yaml"), "utf8"));
  const author = cfg.roles.author;
  const research = cfg.roles.research;

  assert.ok(author.transports.cloud.num_predict >= author.num_predict * 2, "cloud author output cap must not inherit the local cap");
  assert.ok(author.transports.cloud.excerpt_chars > author.excerpt_chars, "cloud author research budget must exceed the local one");
  assert.equal(author.transports.cloud.excerpt_chars, 240_000);

  const local = research.research;
  const cloud = research.transports.cloud.research;
  for (const key of Object.keys(local)) {
    assert.ok(cloud[key] >= local[key], `cloud research ${key} (${cloud[key]}) must not be smaller than local (${local[key]})`);
  }

  assert.ok(cfg.defaults.num_predict_bump_ceiling >= 2 * author.num_predict, "the bump ceiling must give the cloud cap room to double");
});

/* ------------------------------------------------------- excerpt cap param */

test("excerptResearch honours an explicit cap", () => {
  const text = `## A\n\n${"word ".repeat(RESEARCH_EXCERPT)}tail-line\n`;
  const out = excerptResearch(text, 10_000);
  assert.ok(out.length <= 10_000);
  assert.ok(out.endsWith("\n"));
  assert.ok(excerptResearch(text).length <= RESEARCH_EXCERPT);
});

/* ------------------------------------------------------- length auto-bump */

function fakeResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => "",
  };
}

/* ------------------------------------------------- hosted model curation */

test("providerModels returns the static list when one is declared", async () => {
  assert.deepEqual(await providerModels({ models: ["a", "b"], baseURL: "https://x.example/v1" }), ["a", "b"]);
});

test("providerModels fetches GET {baseURL}/models when the list is empty and a key exists", async () => {
  const orig = globalThis.fetch;
  process.env.FAKE_PROV_KEY = "envkey";
  globalThis.fetch = async (url, opts = {}) => {
    assert.equal(String(url), "https://x.example/v1/models");
    assert.equal(opts.headers.Authorization, "Bearer envkey");
    return fakeResponse({ data: [{ id: "m1" }, { id: "m2" }] });
  };
  try {
    const list = await providerModels({ models: [], baseURL: "https://x.example/v1/", apiKey: "env:FAKE_PROV_KEY" });
    assert.deepEqual(list, ["m1", "m2"]);
  } finally {
    globalThis.fetch = orig;
    delete process.env.FAKE_PROV_KEY;
  }
});

test("providerModels handles the string-array /models shape too", async () => {
  const orig = globalThis.fetch;
  process.env.FAKE_PROV_KEY = "envkey";
  globalThis.fetch = async () => fakeResponse({ models: ["one", "two"] });
  try {
    const list = await providerModels({ baseURL: "https://y.example/v1", apiKey: "env:FAKE_PROV_KEY" });
    assert.deepEqual(list, ["one", "two"]);
  } finally {
    globalThis.fetch = orig;
    delete process.env.FAKE_PROV_KEY;
  }
});

test("providerModels returns empty on a failed fetch, never throwing", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => "nope" });
  try {
    assert.deepEqual(await providerModels({ baseURL: "https://z.example/v1", apiKey: "env:FAKE_KEY" }), []);
  } finally {
    globalThis.fetch = orig;
  }
});

test("chat() auto-bumps the cap when a non-streamed response is cut at length", async () => {
  const orig = globalThis.fetch;
  const caps = [];
  const AUTHOR = await configuredAuthorModel();
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith("/api/tags")) {
      return fakeResponse({ models: [{ name: AUTHOR }] });
    }
    if (u.endsWith("/api/chat")) {
      const body = JSON.parse(opts.body ?? "{}");
      caps.push(body.options?.num_predict);
      const truncated = caps.length === 1;
      return fakeResponse({
        model: AUTHOR,
        message: { content: '{"ops":[]}' },
        done_reason: truncated ? "length" : "stop",
        eval_count: 1234,
      });
    }
    throw new Error(`unexpected URL ${u}`);
  };
  try {
    // An explicit local model name skips the routing preference and forces the
    // ollama backend, so the test is deterministic on any machine.
    const res = await chat({ role: "author", model: AUTHOR, messages: [{ role: "user", content: "hi" }] });
    assert.equal(caps.length, 2);
    assert.equal(caps[0], 12000);   // the local author cap
    assert.equal(caps[1], 24000);   // doubled by the auto-bump
    assert.equal(res.doneReason, "stop");
    assert.equal(res.cap, 24000);
    assert.equal(res.transport, "ollama");
  } finally {
    globalThis.fetch = orig;
  }
});

test("chat() leaves a streamed length-truncated response alone (tokens cannot be unsaid)", async () => {
  const orig = globalThis.fetch;
  const caps = [];
  const AUTHOR = await configuredAuthorModel();
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith("/api/tags")) {
      return fakeResponse({ models: [{ name: AUTHOR }] });
    }
    if (u.endsWith("/api/chat")) {
      const body = JSON.parse(opts.body ?? "{}");
      caps.push(body.options?.num_predict);
      assert.equal(body.stream, true);
      // NDJSON stream: one truncated line, done_reason=length.
      const line = JSON.stringify({ message: { content: "partial" }, done: true, done_reason: "length" });
      const reader = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(line + "\n"));
          controller.close();
        },
      }).getReader();
      return { ok: true, body: { getReader: () => reader } };
    }
    throw new Error(`unexpected URL ${u}`);
  };
  try {
    const res = await chat({
      role: "author", model: AUTHOR,
      messages: [{ role: "user", content: "hi" }],
      onToken: () => {},
    });
    assert.equal(caps.length, 1); // no bump for a streamed call
    assert.equal(res.doneReason, "length");
  } finally {
    globalThis.fetch = orig;
  }
});

/* ------------------------------------------------------------- thinking */

/**
 * `roles.author.thinking` was declared and read on exactly one path: the
 * openai-compatible one. The Ollama payload never carried it, so on the local
 * backend the flag was a comment — the same shape as `vision` before
 * `roleCanSeeImages`.
 */

test("a thinking role sends `think` at its level to a model that reports the capability", async () => {
  const orig = globalThis.fetch;
  const AUTHOR = await configuredAuthorModel();
  let sent;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith("/api/tags")) return fakeResponse({ models: [{ name: AUTHOR }] });
    if (u.endsWith("/api/show")) return fakeResponse({ capabilities: ["completion", "vision", "thinking"] });
    if (u.endsWith("/api/chat")) {
      sent = JSON.parse(opts.body ?? "{}");
      return fakeResponse({ model: AUTHOR, message: { content: "{}" }, done_reason: "stop" });
    }
    throw new Error(`unexpected URL ${u}`);
  };
  try {
    await chat({ role: "author", model: AUTHOR, messages: [{ role: "user", content: "hi" }] });
    // config/models.yaml puts the author at reasoning_effort: medium.
    console.log("SENT1:", JSON.stringify({think: sent?.think, model: sent?.model}));
    assert.equal(sent.think, "medium");
  } finally {
    globalThis.fetch = orig;
  }
});

test("a role whose model cannot think sends nothing — an unsupported `think` is an error, not a no-op", async () => {
  const orig = globalThis.fetch;
  const PLAIN = "no-thoughts:1b";
  let sent;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith("/api/tags")) return fakeResponse({ models: [{ name: PLAIN }] });
    if (u.endsWith("/api/show")) return fakeResponse({ capabilities: ["completion"] });
    if (u.endsWith("/api/chat")) {
      sent = JSON.parse(opts.body ?? "{}");
      return fakeResponse({ model: PLAIN, message: { content: "{}" }, done_reason: "stop" });
    }
    throw new Error(`unexpected URL ${u}`);
  };
  try {
    await chat({ role: "author", model: PLAIN, messages: [{ role: "user", content: "hi" }] });
    assert.ok(!("think" in sent), `no think key at all, got ${JSON.stringify(sent.think)}`);
  } finally {
    globalThis.fetch = orig;
  }
});

test("a role that does not declare thinking turns it OFF explicitly", async () => {
  // The `research` role, which shares the author's model and declares no
  // thinking — so the only difference under test is the role's own config.
  const orig = globalThis.fetch;
  const M = "research-capable:35b";
  const UTILITY = await configuredAuthorModel();
  let sent;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith("/api/tags")) return fakeResponse({ models: [{ name: M }, { name: UTILITY }] });
    if (u.endsWith("/api/show")) return fakeResponse({ capabilities: ["completion", "thinking"] });
    if (u.endsWith("/api/chat")) {
      sent = JSON.parse(opts.body ?? "{}");
      return fakeResponse({ model: M, message: { content: "{}" }, done_reason: "stop" });
    }
    throw new Error(`unexpected URL ${u}`);
  };
  try {
    await chat({ role: "research", model: M, messages: [{ role: "user", content: "hi" }] });
    // Not "absent" — FALSE. The model's own default is to think, so omitting
    // the flag meant "whatever the template does", and the research role was
    // measured returning 16,948 characters of reasoning it never asked for.
    // Sending false took that call from 27 seconds to 3.
    assert.equal(sent.think, false, "the role's declaration is the gate, and it has to be sent");
  } finally {
    globalThis.fetch = orig;
  }
});

test("xhigh is the gateway's vocabulary and maps to Ollama's top level", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/show")) return fakeResponse({ capabilities: ["thinking"] });
    throw new Error("unexpected");
  };
  try {
    const at = (effort, model) =>
      ollamaThink({ thinking: true, reasoning_effort: effort, model, backend: { baseURL: "http://t.example" } });
    assert.equal(await at("xhigh", "m-xhigh"), "high", "Ollama has no xhigh; passing it through is a 400");
    assert.equal(await at("low", "m-low"), "low");
    assert.equal(await at(undefined, "m-none"), true, "declared without a level is still on");
    assert.equal(
      await ollamaThink({ thinking: false, model: "m-off", backend: { baseURL: "http://t.example" } }),
      false,
      "a capable model is told NOT to think, rather than left to its default",
    );
  } finally {
    globalThis.fetch = orig;
  }
});
