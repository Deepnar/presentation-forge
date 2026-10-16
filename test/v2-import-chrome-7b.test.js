import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { importApiFixture } from "./v2-import-fixture.js";
import { openViewer } from "../tools/chrome-shot.mjs";

const OUT = path.resolve("out/v2-7b-1-validation/browser");
const EVIDENCE = path.resolve("docs/v2-7b-1-evidence");
const SAVE = "document.querySelector('[data-save-state]')?.dataset.saveState";
const PROJECT = "JSON.parse(document.querySelector('[data-save-state]')?.dataset.projectState ?? 'null')";
let fixture;

async function wait(page, expression, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { const result = await page.evaluate(expression); if (result) return result; } catch { /* navigation replaces the execution context */ }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  const detail = await page.evaluate("JSON.stringify({url:location.href,body:document.body.innerText.slice(-1000)})").catch(() => "no page context");
  throw new Error(`browser condition timed out: ${expression}; ${detail}`);
}
async function click(page, selector) {
  const point = await page.evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); if (!n) return null; n.scrollIntoView({block:'nearest',inline:'nearest'}); const r=n.getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2]; })()`);
  assert.ok(point, `control exists: ${selector}`); await page.click(...point);
}
async function textButton(page, text) {
  const selector = await page.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)}); if(!b) return null; b.setAttribute('data-import-control','true'); return '[data-import-control="true"]'; })()`);
  assert.ok(selector, `button exists: ${text}`); await click(page, selector);
  await page.evaluate(`document.querySelector('[data-import-control]')?.removeAttribute('data-import-control')`);
}
async function openProject(projectId) {
  const page = await openViewer(`${fixture.base}/scenes.html?deck=mech-warm-humanist-plain`);
  try {
    await page.onNewDocument("window.__importPolicyViolations=[];addEventListener('securitypolicyviolation',event=>window.__importPolicyViolations.push(event.violatedDirective))");
    await page.evaluate(`localStorage.setItem('forge.token', ${JSON.stringify(fixture.token)});location.href=${JSON.stringify(`${fixture.base}/#/project/${projectId}`)}`);
    await wait(page, `${SAVE}==='saved' && ${PROJECT}?.id===${JSON.stringify(projectId)}`);
    assert.deepEqual(await page.evaluate("window.__importPolicyViolations"), []);
    return page;
  } catch (error) { await page.close(); throw error; }
}
before(async () => {
  execFileSync("node_modules/.bin/vite", ["build", "--config", "app/web/vite.config.js"], { timeout: 300000, stdio: "pipe" });
  await mkdir(OUT, { recursive: true }); await mkdir(EVIDENCE, { recursive: true });
  fixture = await importApiFixture();
});
after(async () => { await fixture?.stop(); });

for (const [kind, index, input] of [["chart", 1, 'input[aria-label="Category 1 label"]'], ["table", 2, "input"]]) {
  test(`imported native ${kind} edits, undo/redo, saves and reopens without moving the canvas`, async () => {
    const { slug } = await fixture.source(); const response = await fixture.create(slug); assert.equal(response.status, 200);
    const { project } = await response.json(); const scene = project.scenes[index], element = scene.elements.find(e => e.kind === kind);
    const opened = Date.now(); const page = await openProject(project.id);
    const openingMs = Date.now() - opened;
    try {
      await click(page, `[data-thumb="${scene.id}"]`); await textButton(page, "Layers");
      const before = await page.evaluate(`(() => { const r=document.querySelector('[data-stage]').getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; })()`);
      await click(page, `[data-layer="${element.id}"] button[title^="Select"]`);
      await wait(page, `document.querySelector('[data-${kind}-editor]') !== null`);
      const after = await page.evaluate(`(() => { const r=document.querySelector('[data-stage]').getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; })()`);
      before.forEach((value, i) => assert.ok(Math.abs(value - after[i]) < 1, "selection leaves the canvas stable"));
      const selector = `[data-${kind}-editor] ${input}`;
      await click(page, selector); await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);
      await page.insertText(`Human ${kind}`);
      await page.evaluate(`window.__importSaveStates=[];new MutationObserver(()=>window.__importSaveStates.push(document.querySelector('[data-save-state]')?.dataset.saveState)).observe(document.querySelector('[data-save-state]'),{attributes:true,attributeFilter:['data-save-state']})`);
      await textButton(page, "Apply"); await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===1`);
      const states = await page.evaluate("window.__importSaveStates");
      for (const state of ["dirty", "saving", "saved"]) assert.ok(states.includes(state), `confirmed transition: ${state}`);
      const current = () => fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token }).then(r => r.json());
      assert.ok(JSON.stringify((await current()).project.scenes[index]).includes(`Human ${kind}`));
      await click(page, '[aria-label="Undo"]'); await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===2`);
      assert.ok(!JSON.stringify((await current()).project.scenes[index]).includes(`Human ${kind}`));
      await click(page, '[aria-label="Redo"]'); await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===3`);
      assert.ok(JSON.stringify((await current()).project.scenes[index]).includes(`Human ${kind}`));
      const replay = await fixture.create(slug).then(r => r.json());
      assert.equal(replay.reused, true); assert.equal(replay.project.revision, 3);
      assert.ok(JSON.stringify(replay.project.scenes[index]).includes(`Human ${kind}`));
      assert.deepEqual(await page.evaluate("window.__importPolicyViolations"), []);
      await page.screenshot(path.join(EVIDENCE, `imported-${kind}.png`));
      await writeFile(path.join(OUT, `canvas-${kind}.json`), JSON.stringify({ before, after, openingMs, states }, null, 2));
      const exported = await fixture.request(`/api/v2/projects/${project.id}/export.pptx`, { token: fixture.token });
      assert.equal(exported.status, 200); await writeFile(path.join(OUT, `imported-${kind}.pptx`), Buffer.from(await exported.arrayBuffer()));
      await page.evaluate("location.reload()"); await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===3`);
      assert.ok(JSON.stringify((await current()).project.scenes[index]).includes(`Human ${kind}`));
    } finally { await page.close(); }
  });
}

test("an imported project keeps pending text guarded and is reachable at exact narrow viewport dimensions", async () => {
  const { slug } = await fixture.source(); const { project } = await fixture.create(slug).then(r => r.json());
  const page = await openProject(project.id);
  try {
    const title = await page.evaluate(`(() => {const n=document.querySelector('[data-stage] [data-el]');const r=n.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
    await page.dblclick(...title); await wait(page, "document.querySelector('[data-text-edit]') !== null");
    await page.insertText("Human title draft");
    await click(page, '[aria-label="Back to workspace"]'); await wait(page, "document.querySelector('[data-leave-guard]') !== null");
    await click(page, "[data-leave-save]"); await wait(page, "document.querySelector('[data-project-grid]') !== null");
    await click(page, `[data-project-open="${project.id}"]`); await wait(page, `${SAVE}==='saved' && ${PROJECT}?.revision===1`);
    assert.ok(await page.evaluate("document.querySelector('[data-stage]').textContent.includes('Human title draft')"));
    await page.viewport(480, 900); await wait(page, "innerWidth===480 && innerHeight===900");
    await wait(page, "document.querySelector('[aria-label=\"Show inspector rail\"]') !== null");
    await click(page, '[aria-label="Show inspector rail"]'); await wait(page, "document.querySelector('aside[aria-label=Inspector]').offsetParent !== null");
    await page.screenshot(path.join(EVIDENCE, "imported-narrow.png"));
    const geometry = await page.evaluate(`(() => {const r=document.querySelector('aside[aria-label=Inspector]').getBoundingClientRect();return {viewport:[innerWidth,innerHeight],inspector:[r.x,r.y,r.width,r.height]}})()`);
    assert.ok(geometry.inspector[0] >= 0 && geometry.inspector[0] + geometry.inspector[2] <= 481, "inspector fits within the narrow viewport");
    await writeFile(path.join(OUT, "narrow.json"), JSON.stringify(geometry, null, 2));
    await click(page, '[aria-label="Hide inspector rail"]'); await click(page, '[aria-label="Back to workspace"]');
    await wait(page, "document.querySelector('[data-project-grid]') !== null");
    assert.equal(await page.evaluate("document.querySelector('[data-stage]')===null"), true);
  } finally { await page.close(); }
});

test("the 60-slide import boundary opens all thumbnails; oversized input refuses atomically", async () => {
  const deck = { title: "Boundary deck", theme: "warm-humanist", sections: ["Results", "Results"], slides: Array.from({ length: 60 }, (_, index) => ({ type: "bullets", headline: `Evidence ${index + 1}`, section: index < 30 ? 0 : 1, bullets: ["Measured first claim", "Measured second claim", "Measured third claim", "Measured fourth claim"] })) };
  const { slug } = await fixture.source({ deck });
  const response = await fixture.create(slug); assert.equal(response.status, 200);
  const { project, timings } = await response.json(); assert.equal(project.scenes.length, 60);
  const start = Date.now(); const page = await openProject(project.id); const openingMs = Date.now() - start;
  try {
    assert.equal(await page.evaluate("document.querySelectorAll('[data-thumb]').length"), 60);
    assert.ok(await page.evaluate("document.querySelector('[data-stage]')?.textContent.includes('Section 01')"));
    await click(page, '[data-thumb="legacy-s60"]');
    await wait(page, "document.querySelector('[data-stage]')?.textContent.includes('Evidence 60')");
    assert.ok(await page.evaluate("document.querySelector('[data-stage]')?.textContent.includes('Section 02')"));
    await writeFile(path.join(OUT, "boundary-60.json"), JSON.stringify({ slides: 60, openingMs, timings }, null, 2));
  } finally { await page.close(); }
  const before = await fixture.request("/api/v2/projects", { token: fixture.token }).then(r => r.json());
  const oversized = await fixture.source({ deck: { ...deck, slides: [...deck.slides, deck.slides[0]] } });
  const refused = await fixture.create(oversized.slug); assert.equal(refused.status, 422);
  const after = await fixture.request("/api/v2/projects", { token: fixture.token }).then(r => r.json());
  assert.deepEqual(after.projects, before.projects);
});
