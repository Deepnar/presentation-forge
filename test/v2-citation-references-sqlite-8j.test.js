import test from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as store from '../src/projects/store.js';
import { setDbPathForTest } from '../src/db.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { createCitationReferenceChecker } from '../src/projects/citation-references.js';
import { citationContracts,citationScenes } from './v2-citation-references-contract.js';
const check=(name,body)=>test('Citation SQLite: '+name,{timeout:15000},body);
citationContracts(check,async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'forge-citation-j3-'));setDbPathForTest(path.join(dir,'forge.db'));
  t.after(async()=>{store.closeProjectStore();await rm(dir,{recursive:true,force:true});});
  const {doc}=await store.createProject({owner:'owner',title:'Citation fixture',scenes:citationScenes()}),binding={id:doc.id,owner:'owner'};
  return {store,doc,binding,registry:createSourceRegistry(store),checker:createCitationReferenceChecker(store),query:(sql,params)=>store.withRuntimeTransaction(binding,tx=>tx.query(sql,params))};
});
