import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { Pool } from "pg";
import { importApiFixture, IMPORT_DECK } from "../../../test/v2-import-fixture.js";
import { openViewer } from "../../../tools/chrome-shot.mjs";
import { EDITOR_IMPORT_REQUEST_ID } from "../../../app/web/src/lib/editorHandoff.js";

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
  await wait(page, "document.getAnimations().filter(a=>['view-in','fade-in'].some(name=>a.effect?.target?.classList?.contains(name))).every(a=>a.playState!=='running')", 6000);
  await wait(page, `document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
  // A source retry changes the rail width while smooth scrolling can still run.
  // A trusted press/release must address the same settled, unobscured control.
  await page.evaluate(`window.__handoffClickReady={done:false,point:null};void (async () => {
    const n=document.querySelector(${JSON.stringify(selector)});if(!n)return null;
    await document.fonts.ready;n.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    let previous=null,stable=0;const end=performance.now()+5000;
    while(performance.now()<end){
      await new Promise(requestAnimationFrame);
      if(!n.isConnected||n.disabled)return null;
      const r=n.getBoundingClientRect(),box=[r.x,r.y,r.width,r.height];
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      const visible=r.width>0&&r.height>0&&r.x+r.width/2>=0&&r.x+r.width/2<innerWidth&&r.y+r.height/2>=0&&r.y+r.height/2<innerHeight&&(hit===n||n.contains(hit));
      stable=visible&&previous&&box.every((v,i)=>Math.abs(v-previous[i])<.05)?stable+1:0;
      if(stable>=3){window.__handoffClickReady.point=[r.x+r.width/2,r.y+r.height/2];break;}previous=box;
    }
  })().finally(()=>{window.__handoffClickReady.done=true})`);
  await wait(page, 'window.__handoffClickReady?.done===true');
  const point = await page.evaluate('window.__handoffClickReady.point');
  assert.ok(point, selector); await page.click(...point);
}
async function ready(page, id) { return wait(page, `${SAVE}==='saved' && ${PROJECT}?.id${id ? `===${JSON.stringify(id)}` : ""}`); }
async function openSource(slug, { deckPage = false, turns = [], sourceFailure = false } = {}) {
  const page = await openViewer(`${fixture.base}/scenes.html?deck=mech-warm-humanist-plain`);
  try {
    await page.onNewDocument(`window.__clickTrace=[];for(const type of ['pointerdown','pointerup','click'])addEventListener(type,e=>{const a=document.querySelector('[data-editor-handoff] button'),r=a?.getBoundingClientRect();window.__clickTrace.push({type,trusted:e.isTrusted,target:e.target.closest('[data-editor-handoff] button')?'action':e.target.tagName,x:e.clientX,y:e.clientY,actionRect:r&&[r.x,r.y,r.width,r.height],at:performance.now()})},true);window.__handoffPolicy=[];addEventListener('securitypolicyviolation',e=>window.__handoffPolicy.push(e.violatedDirective));window.__handoffRequests=[];window.__exports=[];const actualFetch=window.fetch;window.fetch=async function(url,options){const response=await actualFetch.apply(this,arguments);if(String(url).endsWith('/v2-project'))window.__handoffRequests.push({body:JSON.parse(options.body),status:response.status,result:await response.clone().json()});if(String(url).endsWith('/export.pptx')){const bytes=new Uint8Array(await response.clone().arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);window.__exports.push({status:response.status,bearer:!!options.headers.Authorization,bytes:btoa(binary)})}return response}`);
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
test("a transient completed-chat source read can retry without losing dark mode", async () => {
  const { slug } = await fixture.source({ meta: { mode: "dark" } }); const page = await openSource(slug, { sourceFailure: true });
  try {
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(BUTTON)}).disabled`), true);
    const point = await page.evaluate("(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry loading deck');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    await page.click(...point); await wait(page, `!document.querySelector(${JSON.stringify(BUTTON)}).disabled`);
    await click(page, BUTTON); await ready(page); assert.equal(await page.evaluate("window.__handoffRequests[0].body.mode"), "dark");const trace=await page.evaluate("window.__clickTrace.filter(e=>e.target===\"action\")");assert.deepEqual(trace.map(e=>e.type),["pointerdown","pointerup","click"]);assert.ok(trace.every(e=>e.trusted));assert.ok(Math.abs(trace[0].actionRect[1]-trace[1].actionRect[1])<.1);
  } finally { const diagnostic=await page.evaluate("({hash:location.hash,clicks:window.__clickTrace,requests:window.__handoffRequests?.map(r=>({body:r.body,status:r.status}))})");await writeFile('out/v2-8a-validation/source-retry-nearest-trace.json',JSON.stringify(diagnostic,null,2));await page.close(); }
});
