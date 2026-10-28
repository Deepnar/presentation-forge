import test,{before,after} from 'node:test';
import { Pool } from 'pg';
import * as store from '../src/projects/store-postgres.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { createCitationReferenceChecker } from '../src/projects/citation-references.js';
import { citationContracts,citationScenes,waitForPgLock } from './v2-citation-references-contract.js';
const url=process.env.FORGE_J3_TEST_PG_URL;
if(!url) test('Citation PostgreSQL: backend unavailable, contracts unexecuted',t=>t.skip('Owned isolated FORGE_J3_TEST_PG_URL is required.'));
else {
  const database='forge_citation_j3_'+process.pid+'_'+Date.now().toString(36),maintenance=new Pool({connectionString:url,connectionTimeoutMillis:3000});
  const connection=new URL(url);connection.pathname='/'+database;const previous=process.env.FORGE_PROJECTS_DATABASE_URL;
  before(async()=>{await maintenance.query(`CREATE DATABASE "${database}"`);process.env.FORGE_PROJECTS_DATABASE_URL=connection.href;await store.__testReset();});
  after(async()=>{await store.closeProjectStore();if(previous===undefined)delete process.env.FORGE_PROJECTS_DATABASE_URL;else process.env.FORGE_PROJECTS_DATABASE_URL=previous;
    try{await maintenance.query(`DROP DATABASE "${database}"`);}finally{await maintenance.end();}});
  citationContracts((name,body)=>test('Citation PostgreSQL: '+name,{timeout:15000},body),async t=>{
    const {doc}=await store.createProject({owner:'owner',title:'Citation fixture',scenes:citationScenes()}),binding={id:doc.id,owner:'owner'};
    t.after(()=>store.deleteProject(binding));
    return {store,doc,binding,registry:createSourceRegistry(store),checker:createCitationReferenceChecker(store),query:(sql,params)=>store.withRuntimeTransaction(binding,tx=>tx.query(sql,params)),waitForLock:()=>waitForPgLock(store)};
  });
}
