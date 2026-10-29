import test from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as store from '../src/projects/store.js';
import { setDbPathForTest } from '../src/db.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { seed } from './v2-tool-fixture.js';
import { exportContracts } from './v2-citation-export-contract.js';
exportContracts((name,body)=>test('Notes export SQLite: '+name,{timeout:15000},body),async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'forge-export-j6-'));setDbPathForTest(path.join(dir,'forge.db'));
  t.after(async()=>{store.closeProjectStore();await rm(dir,{recursive:true,force:true});});
  const {doc}=await store.createProject({owner:'owner',title:'Copy fixture',scenes:seed()}),binding={id:doc.id,owner:'owner'};
  return {store,binding,dialect:'sqlite',registry:createSourceRegistry(store),query:(sql,params=[])=>store.withRuntimeTransaction(binding,tx=>tx.query(sql,params))};
});
