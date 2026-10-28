import test from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as store from '../src/projects/store.js';
import { setDbPathForTest } from '../src/db.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { createProjectCitations } from '../src/projects/citations.js';
import { citationWriteContracts,writeScenes } from './v2-citations-contract.js';
citationWriteContracts((name,body)=>test('Citation writes SQLite: '+name,{timeout:15000},body),async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'forge-citations-j4-'));setDbPathForTest(path.join(dir,'forge.db'));
  t.after(async()=>{store.closeProjectStore();await rm(dir,{recursive:true,force:true});});
  const {doc}=await store.createProject({owner:'owner',title:'Citation write fixture',scenes:writeScenes()}),binding={id:doc.id,owner:'owner'};
  return {store,binding,dialect:'sqlite',registry:createSourceRegistry(store),citations:createProjectCitations(store),query:(sql,params=[])=>store.withRuntimeTransaction(binding,tx=>tx.query(sql,params))};
});
