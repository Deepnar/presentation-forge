// Supplemental real hosted authentication check. Run after serial test/build
// owners finish; it serves the existing dist without rebuilding it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { openViewer } from '../../tools/chrome-shot.mjs';
import { buildBlankScenes } from '../../app/web/src/lib/v2create.js';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const OUT=path.join(ROOT,'docs/v2-7a-evidence');
const API=5287, WEB=5286;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(page, expression) {
  const deadline=Date.now()+30000;
  while(Date.now()<deadline) {
    try { if(await page.evaluate(expression))return; } catch { /* navigation */ }
    await pause(100);
  }
  throw new Error(`hosted browser did not settle: ${expression}`);
}
async function click(page,selector) {
  const point=await page.evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];})()`);
  assert.ok(point,selector);await page.click(...point);
}

test('hosted sign-in opens, edits, exports and reopens an owned PostgreSQL project',async t=>{
  const scratch=await mkdtemp(path.join(tmpdir(),'forge-v27a-hosted-'));
  const db=`forge_v27a_auth_${Date.now().toString(36)}`;
  const maintUrl=process.env.TEST_PG_URL??'postgres://postgres:probe@127.0.0.1:5544/postgres';
  const maint=new Pool({connectionString:maintUrl,connectionTimeoutMillis:5000});
  let api,server,page;
  t.after(async()=>{
    await page?.close();
    if(server)await new Promise(resolve=>server.close(resolve));
    if(api){api.kill();await new Promise(resolve=>api.exitCode===null?api.once('exit',resolve):resolve());}
    await maint.query(`DROP DATABASE IF EXISTS "${db}"`);
    await maint.end();await rm(scratch,{recursive:true,force:true});
  });
  await maint.query(`CREATE DATABASE "${db}"`);
  const databaseUrl=new URL(maintUrl);databaseUrl.pathname=`/${db}`;
  const cfg=path.join(scratch,'config');await mkdir(cfg);
  await writeFile(path.join(cfg,'hosted.json'),JSON.stringify({hosted:true}));
  api=spawn(process.execPath,['app/server/index.js'],{cwd:ROOT,env:{...process.env,
    FORGE_HOSTED:'1',FORGE_OPEN_REGISTRATION:'1',FORGE_SMTP_HOST:'',FORGE_API_PORT:String(API),FORGE_CONFIG_DIR:cfg,
    FORGE_DB_PATH:path.join(scratch,'auth.db'),FORGE_PROJECTS_BACKEND:'postgres',
    FORGE_PROJECTS_DATABASE_URL:databaseUrl.href},stdio:['ignore','pipe','pipe']});
  const ready=await new Promise(resolve=>{
    const timer=setTimeout(()=>resolve(false),25000);
    const listen=chunk=>{if(String(chunk).includes(`localhost:${API}`)){clearTimeout(timer);resolve(true);}};
    api.stdout.on('data',listen);api.stderr.on('data',listen);
  });
  assert.equal(ready,true,'dedicated hosted API ready');
  const json=async(method,url,body,token)=>{
    const res=await fetch(`http://127.0.0.1:${API}${url}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    return {status:res.status,body:await res.json()};
  };
  const account=await json('POST','/api/auth/register',{name:'Hosted validation',email:'hosted-validation@example.test',password:'validation-password-123'});
  assert.ok(account.body.user,`test account registered (${account.status}: ${account.body.error ?? 'missing user'})`);
  const login=await json('POST','/api/auth/login',{email:'hosted-validation@example.test',password:'validation-password-123'});
  assert.ok(login.body.token,'fixture login succeeds');
  const made=await json('POST','/api/v2/projects',{title:'Hosted acceptance fixture',scenes:await buildBlankScenes()},login.body.token);
  assert.equal(made.status,200);const id=made.body.project.id;
  const exports=[];
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'};
  server=createServer(async(req,res)=>{
    try {
      if(req.url.startsWith('/api/')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const headers={...req.headers,host:`127.0.0.1:${API}`};delete headers['content-length'];
        const upstream=await fetch(`http://127.0.0.1:${API}${req.url}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
        const bytes=Buffer.from(await upstream.arrayBuffer());
        if(req.url.endsWith('/export.pptx'))exports.push({status:upstream.status,bytes:bytes.length,bearer:Boolean(req.headers.authorization)});
        res.writeHead(upstream.status,Object.fromEntries([...upstream.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key))));res.end(bytes);return;
      }
      const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
      const dist=path.join(ROOT,'app/web/dist');const file=path.resolve(dist,relative);assert.ok(file.startsWith(dist+path.sep));
      const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});res.end(bytes);
    }catch(error){if(res.headersSent)res.destroy(error);else {res.writeHead(500);res.end('test transport failed');}}
  });
  await new Promise(resolve=>server.listen(WEB,'127.0.0.1',resolve));
  page=await openViewer(`http://127.0.0.1:${WEB}/scenes.html?deck=mech-warm-humanist-plain`);
  await page.evaluate(`location.href='http://127.0.0.1:${WEB}/#/projects';true`);
  await wait(page,`document.body.textContent.includes('Sign in to see presentations')`);
  const signin=await page.evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Sign in');const r=b.getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2];})()`);await page.click(...signin);
  await wait(page,`document.querySelector('input[type="password"]') !== null`);
  await page.evaluate(`(() => {for(const [type,value]of [['email','hosted-validation@example.test'],['password','validation-password-123']]){const el=document.querySelector('input[type="'+type+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await click(page,'button[type="submit"]');
  await wait(page,`document.querySelector('[data-project-open="${id}"]') !== null`);
  assert.equal(await page.evaluate(`location.hash`),'#/projects');
  assert.ok(await page.evaluate(`localStorage.getItem('forge.token') !== null`));
  await page.screenshot(path.join(OUT,'dashboard-hosted-signedin.png'));
  await click(page,`[data-project-open="${id}"]`);
  await wait(page,`document.querySelector('[data-save-state]')?.dataset.saveState === 'saved'`);
  await click(page,'button[title="Add an editable text box at the slide center"]');
  await wait(page,`JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).revision === 1 && document.querySelector('[data-save-state]').dataset.saveState === 'saved'`);
  await click(page,'[data-topbar-export]');
  const deadline=Date.now()+15000;while(exports.length===0&&Date.now()<deadline)await pause(100);
  assert.equal(exports[0]?.status,200);assert.equal(exports[0]?.bearer,true);assert.ok(exports[0]?.bytes>1000);
  await click(page,'[aria-label="Back to workspace"]');
  await wait(page,`document.querySelector('[data-project-open="${id}"]') !== null`);
  await click(page,`[data-project-open="${id}"]`);
  await wait(page,`document.querySelector('[data-save-state]')?.dataset.saveState === 'saved' && JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).revision === 1`);
  const stored=await json('GET',`/api/v2/projects/${id}`,undefined,login.body.token);
  assert.equal(stored.body.project.scenes[0].elements.filter(el=>el.kind==='text').length,1);
  await page.screenshot(path.join(OUT,'editor-hosted-signedin.png'));
  const geometry=await page.evaluate(`(() => {const box=document.querySelector('[data-scroll-container]'),stage=document.querySelector('[data-stage]');const b=box.getBoundingClientRect(),s=stage.getBoundingClientRect(),css=getComputedStyle(box);return {viewport:[innerWidth,innerHeight],scrollContainer:{x:b.x,right:b.right,width:b.width,clientWidth:box.clientWidth,scrollWidth:box.scrollWidth,paddingLeft:css.paddingLeft,paddingRight:css.paddingRight},stage:{x:s.x,right:s.right,width:s.width}};})()`);
  await writeFile(path.join(OUT,'canvas-hosted.json'),JSON.stringify(geometry,null,2)+'\n');
  await writeFile(path.join(OUT,'hosted-auth.json'),JSON.stringify({hosted:true,backend:'postgres',login:'actual form submission',projectRevision:stored.body.project.revision,export:exports[0],reopened:true},null,2)+'\n');
});
