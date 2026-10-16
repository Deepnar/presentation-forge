import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { Pool } from "pg";
import { importApiFixture, IMPORT_DECK } from "file:///home/deepnar/Programs/presentations/test/v2-import-fixture.js";
import { openViewer } from "file:///home/deepnar/Programs/presentations/tools/chrome-shot.mjs";
import { EDITOR_IMPORT_REQUEST_ID } from "file:///home/deepnar/Programs/presentations/app/web/src/lib/editorHandoff.js";

const OUT = path.resolve("out/v2-7b-2-validation/browser"), EVIDENCE = path.resolve("docs/v2-7b-2-evidence");
const SAVE = "document.querySelector('[data-save-state]')?.dataset.saveState";
const PROJECT = "JSON.parse(document.querySelector('[data-save-state]')?.dataset.projectState ?? 'null')";
const BUTTON = "[data-editor-handoff] button";
let fixture, maintenance, database;
async function wait(page, expression, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await page.evaluate(`Boolean(${expression})`); if (value) return value; } catch { /* navigation replaces context */ }
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw new Error(`timed out: ${expression}; ${await page.evaluate("document.body.innerText.slice(-1600)").catch(() => "no context")}`);
}
async function click(page, selector) {
  await wait(page, `(() => {const n=document.querySelector(${JSON.stringify(selector)});if(!n)return false;n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !n.disabled && (hit===n || n.contains(hit))})()`);
  const point = await page.evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});if(!n)return null;n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();if(window.__reviewDispatches)window.__reviewDispatches.push({selector:${JSON.stringify(selector)},rect:[r.x,r.y,r.width,r.height],point:[r.x+r.width/2,r.y+r.height/2],time:performance.now()});return [r.x+r.width/2,r.y+r.height/2]})()`);
  assert.ok(point, selector); await page.click(...point);
}
async function ready(page, id) { return wait(page, `${SAVE}==='saved' && ${PROJECT}?.id${id ? `===${JSON.stringify(id)}` : ""}`); }
async function openSource(slug, { deckPage = false, turns = [], sourceFailure = false } = {}) {
  const page = await openViewer(`${fixture.base}/scenes.html?deck=mech-warm-humanist-plain`);
  try {
    await page.onNewDocument(`window.__handoffPolicy=[];addEventListener('securitypolicyviolation',e=>window.__handoffPolicy.push(e.violatedDirective));window.__handoffRequests=[];window.__exports=[];const actualFetch=window.fetch;window.fetch=async function(url,options){const response=await actualFetch.apply(this,arguments);if(String(url).endsWith('/v2-project'))window.__handoffRequests.push({body:JSON.parse(options.body),status:response.status,result:await response.clone().json()});if(String(url).endsWith('/export.pptx')){const bytes=new Uint8Array(await response.clone().arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);window.__exports.push({status:response.status,bearer:!!options.headers.Authorization,bytes:btoa(binary)})}return response}`);
    await page.onNewDocument(`window.__reviewEvents=[];window.__reviewDispatches=[];window.__reviewRestore=[];for(const kind of ['pointerdown','pointerup','click'])document.addEventListener(kind,event=>{const b=event.target.closest?.('button'),r=b?.getBoundingClientRect();window.__reviewEvents.push({kind,trusted:event.isTrusted,target:event.target.tagName,button:b?.outerHTML.slice(0,240),point:[event.clientX,event.clientY],rect:r?[r.x,r.y,r.width,r.height]:null,time:performance.now()})},true);const reviewerFetch=window.fetch;window.fetch=async function(url,options){const relevant=String(url).endsWith('/restore');if(relevant)window.__reviewRestore.push({phase:'request',url:String(url),body:options?.body,time:performance.now()});const response=await reviewerFetch.apply(this,arguments);if(relevant)window.__reviewRestore.push({phase:'response',status:response.status,body:await response.clone().json(),time:performance.now()});return response}`);
    if (sourceFailure) await page.onNewDocument(`window.__failSourceRead=true;const sourceFetch=window.fetch;window.fetch=function(url){if(window.__failSourceRead&&String(url)===${JSON.stringify(`/api/decks/${slug}`)}){window.__failSourceRead=false;return Promise.reject(new TypeError('injected source read failure'))}return sourceFetch.apply(this,arguments)}`);
    const chat = { id: `handoff-${slug}`, kind: "deck", topic: "Measured results", title: "Imported results", produced: true, deckSlug: slug, turns, briefStep: 99, briefing: {}, createdAt: "2026-10-16T00:00:00Z" };
    await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(fixture.token)});localStorage.setItem(${JSON.stringify(`forge.chats.${fixture.owner}`)},${JSON.stringify(JSON.stringify([chat]))});location.href=${JSON.stringify(`${fixture.base}/#/${deckPage ? `deck/${slug}` : "projects"}`)}`);
    if (!deckPage) {
      await wait(page, "document.querySelector('[data-workspace-create]')");
      await page.evaluate(`location.hash=${JSON.stringify(`#/chat/${chat.id}`)}`);
    }
    await wait(page, sourceFailure ? "document.body.textContent.includes('Retry loading deck')" : `document.querySelector(${JSON.stringify(BUTTON)}) && !document.querySelector(${JSON.stringify(BUTTON)}).disabled`);
    return page;
  } catch (error) { await page.close(); throw error; }
}
async function holdResponse(page, { ambiguous = false } = {}) {
  await page.evaluate(`(() => {const real=window.fetch;window.fetch=async function(url,options){const response=await real.apply(this,arguments);if(!String(url).endsWith('/v2-project'))return response;window.__heldImport=await response.clone().json();${ambiguous ? "throw new TypeError('injected lost response after commit')" : "await new Promise(resolve=>window.__releaseImport=resolve);window.__releasedImport=true;return response"}}})()`);
}
async function list() { return (await fixture.request("/api/v2/projects", { token: fixture.token }).then(r => r.json())).projects; }
before(async () => {
  execFileSync("node_modules/.bin/vite", ["build", "--config", "app/web/vite.config.js"], { timeout: 300000, stdio: "pipe" });
  await mkdir(OUT, { recursive: true }); await mkdir(EVIDENCE, { recursive: true });
  let env = {};
  if (process.env.FORGE_HANDOFF_TEST_BACKEND === "postgres") {
    if (!process.env.TEST_PG_URL) throw new Error("TEST_PG_URL is required for owned PostgreSQL browser validation");
    maintenance = new Pool({ connectionString: process.env.TEST_PG_URL, connectionTimeoutMillis: 3000 });
    const name = `forge_handoff_${process.pid}_${Date.now().toString(36)}`;
    await maintenance.query(`CREATE DATABASE "${name}"`); database = name;
    const url = new URL(process.env.TEST_PG_URL); url.pathname = `/${name}`;
    env = { FORGE_PROJECTS_BACKEND: "postgres", FORGE_PROJECTS_DATABASE_URL: url.href };
  }
  fixture = await importApiFixture(env);
  console.log(`handoff backend: ${fixture.env.FORGE_PROJECTS_BACKEND}; actual authenticated production server`);
});
after(async () => {
  try { await fixture?.stop(); if (database) await maintenance.query(`DROP DATABASE "${database}"`); }
  finally { await maintenance?.end(); }
});

test("completed chat after later turns opens a saved project by keyboard, then edits, saves, reopens, restores and exports", async () => {
  const { slug } = await fixture.source();
  const page = await openSource(slug, { turns: [{ role: "user", text: "Keep the measured values" }, { role: "assistant", text: "The measured values are retained." }] });
  try {
    await page.screenshot(path.join(EVIDENCE, "completed-chat.png"));
    await page.evaluate(`document.querySelector(${JSON.stringify(BUTTON)}).focus()`);
    assert.equal(await page.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(BUTTON)})`), true);
    await page.key(32, " "); await ready(page);
    const id = await page.evaluate(`${PROJECT}.id`);
    const { project } = await fixture.request(`/api/v2/projects/${id}`, { token: fixture.token }).then(r => r.json()); assert.equal(project.scenes.length, 3);
    const title = await page.evaluate("(() => {const r=document.querySelector('[data-stage] [data-el]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    await page.evaluate("window.__saveStates=[];new MutationObserver(()=>window.__saveStates.push(document.querySelector('[data-save-state]')?.dataset.saveState)).observe(document.querySelector('[data-save-state]'),{attributes:true,attributeFilter:['data-save-state']})");
    await page.dblclick(...title); await wait(page, "document.querySelector('[data-text-edit]')"); await page.insertText("Human handoff title");
    await click(page, '[aria-label="Back to workspace"]'); await wait(page, "document.querySelector('[data-leave-save]')");
    await click(page, "[data-leave-save]"); await wait(page, "document.querySelector('[data-project-grid]')");
    await click(page, `[data-project-open="${project.id}"]`); await ready(page, project.id);
    assert.ok(await page.evaluate("document.querySelector('[data-stage]').textContent.includes('Human handoff title')"));
    await writeFile(path.join(OUT, "save-states.json"), JSON.stringify(await page.evaluate("window.__saveStates"), null, 2));
    await page.evaluate("location.reload()"); await ready(page, project.id);
    await click(page, '[aria-label="Undo"]');
    await page.evaluate("window.__undoSettled=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__undoSettled=true))");
    await wait(page, "window.__undoSettled");
    assert.equal(await page.evaluate(`${PROJECT}.revision`), 1);
    assert.ok(await page.evaluate("document.querySelector('[data-stage]').textContent.includes('Human handoff title')"));
    const title2 = await page.evaluate("(() => {const r=document.querySelector('[data-stage] [data-el]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    await page.dblclick(...title2); await wait(page, "document.querySelector('[data-text-edit]')"); await page.insertText(" second edit");
    await click(page, '[aria-label="Version history"]'); await page.key(27, "Escape"); await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===2`);
    await click(page, '[aria-label="Undo"]'); await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===3`);
    await click(page, '[aria-label="Redo"]'); await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===4`);
    await page.evaluate(`location.hash=${JSON.stringify(`#/deck/${slug}`)}`); await wait(page, `document.querySelector(${JSON.stringify(BUTTON)})`); await click(page, BUTTON); await ready(page, project.id);
    assert.equal(await page.evaluate(`${PROJECT}.revision`), 4); assert.ok(await page.evaluate("document.querySelector('[data-stage]').textContent.includes('second edit')"));
    await click(page, '[aria-label="Version history"]'); await wait(page, "document.querySelector('[data-history-select=\"0\"]')");
    await click(page, '[data-history-select="0"]'); await wait(page, "document.querySelector('[data-history-restore=\"0\"]')");
    await click(page, '[data-history-restore="0"]'); await wait(page, "document.querySelector('[data-restore-done]')");
    assert.equal(await page.evaluate(`${PROJECT}.revision`), 5);
    await page.screenshot(path.join(EVIDENCE, "handoff-history.png"));
    await page.key(27, "Escape"); await wait(page, "!document.querySelector('[data-history-panel]')");
    await click(page, "[data-topbar-export]"); await wait(page, "window.__exports.length===1");
    const exported = await page.evaluate("window.__exports[0]"); assert.equal(exported.status, 200); assert.equal(exported.bearer, true);
    await writeFile(path.join(OUT, "handoff.pptx"), Buffer.from(exported.bytes, "base64"));
    assert.deepEqual(await page.evaluate("window.__handoffPolicy"), []);
  } finally {
    const diagnostic=await page.evaluate("JSON.stringify({events:window.__reviewEvents,dispatches:window.__reviewDispatches,restore:window.__reviewRestore,body:document.body.innerText.slice(-2400)})").catch(()=>"unavailable");
    console.log('review-restore-final',diagnostic);
    await writeFile('docs/v2-7b-2-evidence/logs/independent/restore-diagnostic-full.json',diagnostic+'\n');
    await page.screenshot('docs/v2-7b-2-evidence/logs/independent/restore-diagnostic-full.png').catch(()=>{});
    await page.close();
  }
});

test("both entry points and fresh tabs reopen the same human-edited dark project", async () => {
  const { slug } = await fixture.source({ meta: { mode: "dark" } }); const count = (await list()).length;
  const page = await openSource(slug, { deckPage: true }); let id, cold;
  try {
    await page.screenshot(path.join(EVIDENCE, "deck-page-action.png")); const start = Date.now(); await click(page, BUTTON); await ready(page); id = await page.evaluate(`${PROJECT}.id`);
    cold = { handoffMs: Date.now() - start, timings: await page.evaluate("window.__handoffRequests[0].result.timings") };
    await click(page, "[data-project-title]"); await page.evaluate("document.querySelector('[data-project-title]').select()"); await page.insertText("Human project name"); await page.key(13, "Enter");
    await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===1`);
  } finally { await page.close(); }
  const next = await openSource(slug);
  try {
    const start = Date.now(); await click(next, BUTTON); await ready(next, id); assert.equal(await next.evaluate(`${PROJECT}.title`), "Human project name");
    await writeFile(path.join(OUT, "cold-warm.json"), JSON.stringify({ backend: fixture.env.FORGE_PROJECTS_BACKEND, cold, warm: { handoffMs: Date.now() - start, timings: await next.evaluate("window.__handoffRequests[0].result.timings") } }, null, 2));
    assert.equal(await next.evaluate("window.__handoffRequests[0].result.reused"), true);
    assert.deepEqual(await next.evaluate("window.__handoffRequests[0].body"), { requestId: EDITOR_IMPORT_REQUEST_ID, mode: "dark" });
    assert.equal((await list()).length, count + 1);
  } finally { await next.close(); }
});

test("a lost response after real creation retries safely after reload without a duplicate", async () => {
  const { slug } = await fixture.source(); const count = (await list()).length; const page = await openSource(slug);
  try {
    await holdResponse(page, { ambiguous: true }); await click(page, BUTTON); await wait(page, "document.querySelector('[data-editor-handoff] [role=alert]')");
    const first = await page.evaluate("window.__heldImport.project.id"); assert.equal((await list()).length, count + 1);
    await page.screenshot(path.join(EVIDENCE, "ambiguous-response.png"));
    await page.evaluate("location.reload()"); await wait(page, "document.querySelector('textarea')");
    await page.evaluate(`location.hash=${JSON.stringify(`#/chat/handoff-${slug}`)}`);
    await wait(page, `document.querySelector(${JSON.stringify(BUTTON)}) && !document.querySelector(${JSON.stringify(BUTTON)}).disabled`);
    await click(page, BUTTON); await ready(page, first); assert.equal((await list()).length, count + 1);
    assert.equal(await page.evaluate("window.__handoffRequests[0].result.reused"), true);
  } finally { await page.close(); }
});

test("a held successful response cannot navigate after leaving its source view", async () => {
  const { slug } = await fixture.source(); const page = await openSource(slug);
  try {
    await holdResponse(page); await click(page, BUTTON); await wait(page, "window.__releaseImport");
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(BUTTON)}).disabled`), true);
    await page.screenshot(path.join(EVIDENCE, "opening-project.png"));
    await page.evaluate("location.hash='#/projects'"); await wait(page, "document.querySelector('[data-project-grid]')");
    await page.evaluate("window.__releaseImport()"); await wait(page, "window.__releasedImport");
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await page.evaluate("location.hash"), "#/projects");
    const heldId = await page.evaluate("window.__heldImport.project.id"); assert.ok((await list()).some(project => project.id === heldId));
  } finally { await page.close(); }
});

test("an account change during a held response cannot open another account's project", async () => {
  const { slug } = await fixture.source(); const page = await openSource(slug);
  try {
    await holdResponse(page); await click(page, BUTTON); await wait(page, "window.__releaseImport"); const hash = await page.evaluate("location.hash");
    const id = await page.evaluate("window.__heldImport.project.id");
    await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(fixture.otherToken)});window.__releaseImport()`); await wait(page, "window.__releasedImport");
    await wait(page, "document.querySelector('[data-editor-handoff]')?.textContent.includes('Your sign-in changed')");
    assert.equal(await page.evaluate("location.hash"), hash); assert.equal((await fixture.request(`/api/v2/projects/${id}`, { token: fixture.otherToken })).status, 404);
  } finally { await page.close(); }
});

test("a real second document's token storage event invalidates pending work with reload recovery", async () => {
  const { slug } = await fixture.source(); const page = await openSource(slug);
  try {
    await holdResponse(page); await click(page, BUTTON); await wait(page, "window.__releaseImport");
    await page.evaluate("window.__peer=window.open('/scenes.html?deck=mech-warm-humanist-plain','_blank');window.__storageKeys=[];addEventListener('storage',event=>window.__storageKeys.push(event.key))");
    await wait(page, "window.__peer && window.__peer.document.readyState==='complete'");
    await page.evaluate(`window.__peer.localStorage.setItem('forge.token',${JSON.stringify(fixture.otherToken)})`);
    await wait(page, "window.__storageKeys.includes('forge.token')");
    await wait(page, "document.querySelector('[data-editor-handoff]')?.textContent.includes('Your sign-in changed')");
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(BUTTON)}).disabled`), true);
    assert.equal(await page.evaluate("document.activeElement===document.querySelector('[data-editor-handoff] [role=alert]')"), true);
    const recovery = await page.evaluate("(() => {const r=document.querySelector('[data-editor-handoff] [role=alert]').getBoundingClientRect();return [r.top,r.bottom,document.querySelector('footer').getBoundingClientRect().top]})()");
    assert.ok(recovery[0] >= 0 && recovery[1] <= recovery[2], 'sign-in recovery is visible above the composer');
    assert.ok(await page.evaluate("[...document.querySelectorAll('[data-editor-handoff] button')].some(b=>b.textContent==='Reload page')"));
    await page.evaluate("window.__releaseImport();window.__peer.close()"); await wait(page, "window.__releasedImport");
    assert.ok(await page.evaluate("location.hash.startsWith('#/chat/')"));
    await page.screenshot(path.join(EVIDENCE, "session-changed.png"));
  } finally { await page.evaluate("window.__peer?.close()").catch(() => {}); await page.close(); }
});

test("a transient completed-chat source read can retry without losing dark mode", async () => {
  const { slug } = await fixture.source({ meta: { mode: "dark" } }); const page = await openSource(slug, { sourceFailure: true });
  try {
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(BUTTON)}).disabled`), true);
    const point = await page.evaluate("(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry loading deck');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    await page.click(...point); await wait(page, `!document.querySelector(${JSON.stringify(BUTTON)}).disabled`);
    await click(page, BUTTON); await ready(page); assert.equal(await page.evaluate("window.__handoffRequests[0].body.mode"), "dark");
  } finally { await page.close(); }
});

test("unsupported content refuses visibly with keyboard focus and usable original access at narrow width", async () => {
  const { slug } = await fixture.source({ deck: { ...IMPORT_DECK, slides: [{ type: "title", headline: "Private notes", notes: "Must not be dropped" }] } });
  const count = (await list()).length; const page = await openSource(slug);
  try {
    await page.viewport(480, 900);
    await wait(page, "document.querySelector('[aria-label=\"Open the menu\"]')");
    await click(page, BUTTON); await wait(page, "document.querySelector('[data-editor-handoff] [role=alert]')");
    assert.equal(await page.evaluate("document.activeElement===document.querySelector('[data-editor-handoff] [role=alert]')"), true);
    assert.ok(await page.evaluate("document.querySelector('[data-editor-handoff]').textContent.includes('notes')"));
    const bounds = await page.evaluate("(() => {const r=document.querySelector('[data-editor-handoff] [role=alert]').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()");
    assert.ok(bounds[0] >= 0 && bounds[0] + bounds[2] <= 481 && bounds[1] >= 0 && bounds[1] + bounds[3] <= 901);
    await page.screenshot(path.join(EVIDENCE, "refusal-narrow.png")); await writeFile(path.join(OUT, "refusal-narrow.json"), JSON.stringify({ viewport: [480, 900], bounds }, null, 2));
    assert.equal((await list()).length, count); await click(page, '[data-editor-handoff] a[href^="#/deck/"]');
    await wait(page, `location.hash===${JSON.stringify(`#/deck/${slug}`)} && document.body.textContent.includes('Render now')`);
    assert.equal((await fixture.request(`/api/decks/${slug}`, { token: fixture.token }).then(r => r.json())).deck.slides[0].notes, "Must not be dropped");
  } finally { await page.close(); }
});

test("changed and deleted imports refuse without replacing or resurrecting their projects", async () => {
  for (const deleted of [false, true]) {
    const { slug, folder } = await fixture.source(); const { project } = await fixture.create(slug, { requestId: EDITOR_IMPORT_REQUEST_ID }).then(r => r.json());
    if (deleted) assert.equal((await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: "DELETE" })).status, 200);
    else await writeFile(path.join(folder, "deck.yaml"), YAML.stringify({ ...IMPORT_DECK, title: "Changed original" }));
    const count = (await list()).length; const page = await openSource(slug, { deckPage: true });
    try {
      await click(page, BUTTON); await wait(page, "document.querySelector('[data-editor-handoff] [role=alert]')");
      assert.equal(await page.evaluate("window.__handoffRequests[0].status"), deleted ? 410 : 409);
      assert.equal((await list()).length, count); assert.ok(await page.evaluate(`document.querySelector('[data-editor-handoff]').textContent.includes(${JSON.stringify(deleted ? "deleted" : "changed")})`));
    } finally { await page.close(); }
  }
});

test("incomplete generation and unavailable storage keep the original flow usable", async () => {
  const { slug } = await fixture.source({ meta: { status: "writing" } }); const page = await openSource(slug);
  try {
    await click(page, BUTTON); await wait(page, "document.querySelector('[data-editor-handoff] [role=alert]')");
    assert.equal(await page.evaluate("window.__handoffRequests[0].status"), 409);
    await page.evaluate("(() => {const real=window.fetch;window.fetch=function(url){if(String(url).endsWith('/v2-project'))return Promise.resolve(new Response(JSON.stringify({ok:false,code:'storage-unavailable',error:'storage offline'}),{status:503}));return real.apply(this,arguments)}})()");
    await click(page, BUTTON); await wait(page, "document.querySelector('[data-editor-handoff] [role=alert]')?.textContent.includes('storage is unavailable')");
    assert.ok(await page.evaluate("document.querySelector('[data-editor-handoff] a[href^=\"#/deck/\"]')!==null"));
  } finally { await page.close(); }
});

test("60-slide browser handoff opens all thumbnails and keeps the narrow inspector visible", async () => {
  const deck = { title: "Browser boundary", theme: "warm-humanist", slides: Array.from({ length: 60 }, (_, i) => ({ type: "bullets", headline: `Measured slide ${i + 1}`, bullets: ["First measured claim", "Second measured claim", "Third measured claim", "Fourth measured claim"] })) };
  const { slug } = await fixture.source({ deck }); const page = await openSource(slug);
  try {
    const started = Date.now(); await click(page, BUTTON); await ready(page); const handoffMs = Date.now() - started;
    assert.equal(await page.evaluate("document.querySelectorAll('[data-thumb]').length"), 60);
    await click(page, '[data-thumb="legacy-s60"]'); await wait(page, "document.querySelector('[data-stage]')?.textContent.includes('Measured slide 60')");
    await page.viewport(480, 900); await wait(page, "document.querySelector('[aria-label=\"Show inspector rail\"]')");
    await click(page, '[aria-label="Show inspector rail"]'); await wait(page, "document.querySelector('aside[aria-label=Inspector]').offsetParent !== null");
    const bounds = await page.evaluate("(() => {const r=document.querySelector('aside[aria-label=Inspector]').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()");
    assert.ok(bounds[0] >= 0 && bounds[0] + bounds[2] <= 481 && bounds[1] + bounds[3] <= 901);
    await page.screenshot(path.join(EVIDENCE, "boundary-narrow.png")); await writeFile(path.join(OUT, "boundary-60.json"), JSON.stringify({ handoffMs, bounds, timings: await page.evaluate("window.__handoffRequests[0].result.timings") }, null, 2));
  } finally { await page.close(); }
});
