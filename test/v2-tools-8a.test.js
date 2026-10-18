import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolSession } from '../packages/tools/session.ts';
import { createDocument } from '../packages/model/engine.ts';
import { blankSlide } from '../packages/editor/scene-text.js';

test('unauthorized caller cannot inspect project state', async () => {
  const document = await createDocument([blankSlide()]);
  const tools = createToolSession({ document, projectId: 'p', ownerId: 'owner', actorId: 'other', agentId: 'a', mode: 'inspect', readableSlides: [], editableTargets: [], selection: [] });
  assert.deepEqual(await tools.execute({ tool: 'get_project', args: {} }), { ok: false, code: 'forbidden', message: 'This project is not available to this caller.' });
});

import { readFile } from 'node:fs/promises';
import { Ajv } from 'ajv';
import { rig, seed, target, textEdit, edit } from './v2-tool-fixture.js';
import { renderPptx } from '../packages/renderer-pptx/render.ts';
import JSZip from 'jszip';
const validates = new Ajv({strict:false}).compile(JSON.parse(await readFile(new URL('../packages/tools/result.schema.json',import.meta.url),'utf8')));
const check = result => {assert.ok(validates(result),JSON.stringify(validates.errors));return result};

test('project index pages expose only allowed slides and no content/style',async()=>{
 const {tools}=await rig();const r=check(await tools.execute({tool:'get_project',args:{limit:1}}));
 assert.equal(r.ok,true);assert.equal(r.data.total,1);assert.equal(r.data.slides[0].slideId,'s1');
 for(const secret of ['Unrelated private slide','Measured','112233','owner','Inter'])assert.equal(JSON.stringify(r).includes(secret),false);
});
test('slide and selection projections preserve exact content without renderer or authority fields',async()=>{
 const {tools}=await rig();for(const request of [{tool:'get_slide',args:{slideId:'s1'}},{tool:'get_selected_elements',args:{}}]){
 const r=check(await tools.execute(request));assert.equal(r.ok,true);const json=JSON.stringify(r);
 assert.ok(json.includes('Measured '));for(const v of ['112233','445566','Inter','customized','semanticRef','ownerId','agentId','Unrelated private slide'])assert.equal(json.includes(v),false,v);
 }
});
test('pagination is explicit and slide grants cannot be bypassed',async()=>{
 const {tools}=await rig();const r=await tools.execute({tool:'get_slide',args:{slideId:'s1',limit:1}});assert.equal(r.data.nextOffset,1);assert.equal(r.data.total,3);
 const next=await tools.execute({tool:'get_slide',args:{slideId:'s1',offset:1,limit:2}});assert.equal(next.data.nextOffset,null);assert.equal(next.data.elements.length,2);
 assert.equal((await tools.execute({tool:'get_slide',args:{slideId:'s2'}})).code,'unknown-slide');
});
test('empty and invalid selections never widen scope',async()=>{
 assert.deepEqual((await (await rig({selection:[]})).tools.execute({tool:'get_selected_elements',args:{}})).data,{elements:[]});
 for(const selection of [[target('other','s2')],[target('missing')]])assert.equal((await (await rig({selection})).tools.execute({tool:'get_selected_elements',args:{}})).code,'unknown-element');
});
for(const [label,payload] of [
 ['raw command',{tool:'edit_content',args:{baseRevision:0,edits:[{type:'element.move',id:'text',x:1,y:2}]}}],
 ['geometry',{...edit(),x:9}],['owner override',{...edit(),ownerId:'owner'}],['text style',edit([{...textEdit(),color:'#FF0000'}])],
 ['nonfinite',edit([{kind:'chart',...target('chart'),categories:['A'],series:[{name:'x',values:[NaN]}]}])],
 ['missing args',{tool:'get_slide'}],['unknown tool',{tool:'get_scene',args:{}}],['sparse array',edit(new Array(2))],
 ['function',{tool:'get_project',args:{evil:()=>1}}],['pollution',JSON.parse('{"tool":"get_project","args":{"__proto__":{}}}')],
 ])test(`rejects ${label} as untrusted input without mutation`,async()=>{const {tools,document}=await rig();const before=document.snapshot();assert.equal(check(await tools.execute(payload,'bad')).code,'invalid-input');assert.deepEqual(document.snapshot(),before)});
test('accessors and cycles are refused without invoking accessors',async()=>{
 const {tools}=await rig();let hits=0;const q={tool:'get_project',get args(){hits++;return {}}};assert.equal((await tools.execute(q)).code,'invalid-input');assert.equal(hits,0);
 const cycle={};cycle.self=cycle;assert.equal((await tools.execute(cycle)).code,'invalid-input');
});
test('text edits preserve all runs, styling and geometry with exact undo/redo',async()=>{
 const {tools,document}=await rig();const before=document.snapshot();const r=check(await tools.execute(edit([textEdit('Edited ',0),textEdit('conclusion',1)]),'text1'));assert.equal(r.ok,true);assert.equal(r.changed,true);assert.equal(r.revision,1);
 const after=document.snapshot();const expected=structuredClone(before.scenes);expected[0].elements[0].paragraphs[0].runs[0].text='Edited ';expected[0].elements[0].paragraphs[0].runs[1].text='conclusion';expected[0].elements[0].contentCustomized=true;expected[0].elements[0].provenance='human';
 assert.deepEqual(after.scenes,expected);assert.equal(document.log()[0].actor,'agent');assert.equal(document.status().historyLength,1);
 await document.undo();assert.deepEqual(document.snapshot().scenes,before.scenes);await document.redo();assert.deepEqual(document.snapshot().scenes,after.scenes);
});
test('text, chart and table changes commit as one native batch',async()=>{
 const {tools,document}=await rig();const original=document.snapshot();const chart={kind:'chart',...target('chart'),categories:['First','Second'],series:[{name:'Exact data',values:[1.25,12.5]}]},table={kind:'table',...target('table'),rows:[['Measurement','Value'],['A','1.25'],['B','12.5']]};
 const r=await tools.execute(edit([textEdit('Edited '),chart,table]),'mixed');assert.equal(r.ok,true);assert.equal(document.status().historyLength,1);
 const scenes=document.snapshot().scenes;assert.deepEqual(scenes[0].elements[1].chart.labels,original.scenes[0].elements[1].chart.labels);assert.deepEqual(scenes[0].elements[2].table.layout,original.scenes[0].elements[2].table.layout);assert.deepEqual(scenes[1],original.scenes[1]);
 const zip=await JSZip.loadAsync(await renderPptx(scenes));assert.ok((await zip.file('ppt/slides/slide1.xml').async('string')).includes('<a:tbl>'));const c=await zip.file('ppt/charts/chart1.xml').async('string');assert.ok(c.includes('Exact data')&&c.includes('12.5'));
 await document.undo();assert.deepEqual(document.snapshot().scenes,original.scenes);
});
test('invalid later chart or table edit rolls back every earlier valid edit',async()=>{
 for(const invalid of [{kind:'chart',...target('chart'),categories:['one'],series:[{name:'Mismatch',values:[1,2]}]},{kind:'table',...target('table'),rows:[['a','b'],['ragged']]}]){
 const {tools,document}=await rig();const before=document.snapshot();assert.equal((await tools.execute(edit([textEdit(),invalid]),'invalid')).code,'engine-refused');assert.deepEqual(document.snapshot(),before);assert.equal(document.status().historyLength,0);
 }
});
for(const [label,edits] of [['duplicate text run',[textEdit(),textEdit()]],['duplicate data',[{kind:'table',...target('table'),rows:[['a']]},{kind:'table',...target('table'),rows:[['b']]}]],['wrong kind',[{kind:'table',...target('text'),rows:[['a']]}]],['invalid run',[{...textEdit(),runIndex:99}]]])test(`${label} is refused atomically`,async()=>{const {tools,document}=await rig();const before=document.snapshot();assert.equal((await tools.execute(edit(edits),'invalid')).code,'invalid-edit');assert.deepEqual(document.snapshot(),before)});
test('stale revisions and duplicate applied calls cannot overwrite',async()=>{
 const {tools,document}=await rig();assert.equal((await tools.execute(edit(),'once')).ok,true);const saved=document.snapshot();assert.equal((await tools.execute(edit([textEdit('stale')]),'new')).code,'stale-revision');assert.equal((await tools.execute(edit([textEdit('duplicate')],1),'once')).code,'duplicate-id');assert.deepEqual(document.snapshot(),saved);
});
test('parallel calls with the same revision have only one winner',async()=>{
 const {tools,document}=await rig();const results=await Promise.all([tools.execute(edit([textEdit('one')]),'one'),tools.execute(edit([textEdit('two')]),'two')]);assert.equal(results.filter(r=>r.ok).length,1);assert.ok(results.some(r=>r.code==='stale-revision'));assert.equal(document.status().historyLength,1);
});
test('noop edits retain revision, history and redo state',async()=>{
 const {tools,document}=await rig();const before=document.snapshot();const r=await tools.execute(edit([textEdit('Measured ')]),'noop');assert.equal(r.ok,true);assert.equal(r.changed,false);assert.deepEqual(document.snapshot(),before);assert.equal(document.status().historyLength,0);
});
test('read-only mode and absent grants cannot be widened by a tool request',async()=>{
 for(const options of [{mode:'inspect'},{editableTargets:[]}]){const {tools,document}=await rig(options);assert.equal(tools.catalog().some(t=>t.name==='edit_content'),false);assert.equal((await tools.execute(edit(),'deny')).code,'not-editable');assert.equal(document.status().revision,0)}
});
test('editing outside the grant or outside readable slides is refused',async()=>{
 const {tools}=await rig({editableTargets:[target('other','s2')]});assert.equal((await tools.execute(edit(),'outside')).code,'not-editable');assert.equal((await tools.execute(edit([{...textEdit(),slideId:'s2',elementId:'other'}]),'other')).code,'not-editable');
});
for(const flag of ['locked','hidden'])test(`${flag} targets are refused even with an explicit grant`,async()=>{
 const scenes=seed();scenes[0].elements[0][flag]=true;const {tools,document}=await rig({},scenes);assert.equal((await tools.execute(edit(),'protected')).code,'locked');assert.equal(document.status().revision,0);
});
test('ancestor locks and hidden groups protect nested targets',async()=>{
 for(const flag of ['locked','hidden']){const scenes=seed(),child=scenes[0].elements.shift();scenes[0].elements.push({id:'group',kind:'group',x:0,y:0,w:12,h:7,z:3,provenance:'human',[flag]:true,group:{children:[child]}});const {tools,document}=await rig({},scenes);assert.equal((await tools.execute(edit(),'nested')).code,'locked');assert.equal(document.status().revision,0)}
});
test('detached content stays editable and existing tombstones/human additions survive',async()=>{
 const scenes=seed();scenes[0].layoutState='detached';const {tools,document}=await rig({},scenes);
 await document.apply({id:'delete',actor:'human',baseRevision:0,slideId:'s1',op:{type:'element.delete',id:'chart'}});const before=document.snapshot();assert.ok(before.scenes[0].suppressed.length);
 assert.equal((await tools.execute(edit([textEdit()],1),'detached')).ok,true);assert.equal(document.snapshot().scenes[0].layoutState,'detached');assert.deepEqual(document.snapshot().scenes[0].suppressed,before.scenes[0].suppressed);assert.deepEqual(document.snapshot().scenes[1],before.scenes[1]);
});
test('input is snapshotted and output/catalog/grants cannot mutate authoritative state',async()=>{
 const selection=[target('text')],readableSlides=['s1'],editableTargets=[target('text')],{tools,document}=await rig({selection,readableSlides,editableTargets});selection[0].elementId='missing';readableSlides.length=0;editableTargets.length=0;
 const request=edit();const pending=tools.execute(request,'snapshot');request.args.edits[0].text='raced';assert.equal((await pending).ok,true);assert.equal(document.snapshot().scenes[0].elements[0].paragraphs[0].runs[0].text,'Human-reviewed ');
 const data=await tools.execute({tool:'get_selected_elements',args:{}});data.data.elements[0].element.paragraphs[0].runs[0].text='output mutation';assert.equal(document.snapshot().scenes[0].elements[0].paragraphs[0].runs[0].text,'Human-reviewed ');const catalog=tools.catalog();catalog[0].name='evil';assert.equal(tools.catalog()[0].name,'get_project');
});
test('calls, oversized reads, input and pre-commit acknowledgements obey budgets',async()=>{
 const {tools}=await rig({limits:{maxCalls:1}});assert.equal((await tools.execute({tool:'get_project',args:{}})).ok,true);assert.equal((await tools.execute({tool:'get_project',args:{}})).code,'budget-exceeded');
 const scenes=seed();scenes[0].elements[0].paragraphs[0].runs[0].text='x'.repeat(3000);const limited=await rig({limits:{outputChars:1024}},scenes);assert.equal((await limited.tools.execute({tool:'get_slide',args:{slideId:'s1'}})).code,'budget-exceeded');assert.equal(limited.document.status().revision,0);
 assert.equal((await limited.tools.execute(edit([textEdit('x'.repeat(70000))]),'large')).code,'invalid-input');
});
test('unexpected document failures do not echo private exception text',async()=>{
 const {binding}=await rig();const tools=createToolSession({...binding,document:{...binding.document,snapshot(){throw new Error('credential-private-token')}}});const r=await tools.execute({tool:'get_project',args:{}});assert.equal(check(r).code,'unavailable');assert.equal(JSON.stringify(r).includes('credential-private-token'),false);
});
test('an oversized acknowledgement refuses before the real engine can commit',async()=>{
 const scenes=seed(),grants=[];
 for(let i=0;i<16;i++){const el=structuredClone(scenes[0].elements[0]);el.id=`extra-${i}-${'x'.repeat(80)}`;el.z=i+3;scenes[0].elements.push(el);grants.push(target(el.id))}
 const {tools,document}=await rig({limits:{outputChars:1024},editableTargets:grants},scenes);const before=document.snapshot();
 assert.equal((await tools.execute(edit(grants.map(t=>({...textEdit('changed'),...t}))),'ack')).code,'budget-exceeded');assert.deepEqual(document.snapshot(),before);assert.equal(document.status().historyLength,0);
});
