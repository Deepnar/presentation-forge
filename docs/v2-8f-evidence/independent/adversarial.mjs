import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createSearxngSearchProvider } from '../../../src/agent/search-provider.js';
const sample={results:[{url:'https://example.org/evidence',title:'Evidence',content:'Verified wording'}]};
async function service(t,handler){
 const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return `http://127.0.0.1:${server.address().port}`;
}
test('concurrent searches isolate project identity and one cancelled operation',async t=>{
 let firstArrived;const arrived=new Promise(r=>{firstArrived=r;});
 const baseURL=await service(t,async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;
  if(new URLSearchParams(body).get('q')==='cancel me'){firstArrived();return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(sample));
 });
 const provider=createSearxngSearchProvider({baseURL}),controller=new AbortController();
 const first=provider.search({projectId:'first'},{query:'cancel me'},{signal:controller.signal});await arrived;
 const second=provider.search({projectId:'second'},{query:'complete me'});controller.abort();
 assert.equal((await first).code,'cancelled');const result=await second;
 assert.equal(result.ok,true);assert.equal(result.sources[0].projectId,'second');
 assert.ok(Object.isFrozen(result.sources[0]));
 const third=await provider.search({projectId:'first'},{query:'complete me'});
 assert.notEqual(result.sources[0].id,third.sources[0].id);
});
test('citation identity remains provider neutral over two actual HTTP adapters',async t=>{
 let calls=0;const baseURL=await service(t,(_req,res)=>{calls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(sample));});
 const a=await createSearxngSearchProvider({baseURL,id:'one'}).search({projectId:'same'},{query:'first'});
 const b=await createSearxngSearchProvider({baseURL,id:'two'}).search({projectId:'same'},{query:'other'});
 assert.equal(calls,2);assert.equal(a.sources[0].id,b.sources[0].id);assert.notEqual(a.sources[0].searchProvider,b.sources[0].searchProvider);
});
test('fragmented multibyte UTF8 survives empty chunks and the fixed response buffer',async()=>{
 const body={results:[{...sample.results[0],title:'Café 🔋',content:'Safety evidence'}]},encoded=new TextEncoder().encode(JSON.stringify(body));let index=0,empty=true;
 assert.ok(encoded.length<256);
 const stream=new ReadableStream({pull(controller){if(empty){empty=false;controller.enqueue(new Uint8Array(0));return;}empty=true;if(index<encoded.length)controller.enqueue(encoded.subarray(index,index+1));else controller.close();index++;}});
 const provider=createSearxngSearchProvider({maxResponseBytes:256},{fetch:async()=>new Response(stream,{headers:{'content-type':'application/json'}})});
 const result=await provider.search({projectId:'unicode'},{query:'cells'});
 assert.equal(result.ok,true);assert.equal(result.sources[0].title,'Café 🔋');assert.equal(result.sources[0].excerpt,'Safety evidence');
});
