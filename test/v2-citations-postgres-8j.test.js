import test,{before,after} from 'node:test';
import { Pool } from 'pg';
import * as store from '../src/projects/store-postgres.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { createProjectCitations } from '../src/projects/citations.js';
import { citationWriteContracts,writeScenes } from './v2-citations-contract.js';
import { waitForPgLock } from './v2-citation-references-contract.js';
const url=process.env.FORGE_J4_TEST_PG_URL;
if(!url)test('Citation writes PostgreSQL: backend unavailable, contracts unexecuted',t=>t.skip('Owned isolated FORGE_J4_TEST_PG_URL is required.'));
else {
  const database='forge_citations_j4_'+process.pid+'_'+Date.now().toString(36),maintenance=new Pool({connectionString:url,connectionTimeoutMillis:3000});
  const connection=new URL(url);connection.pathname='/'+database;const previous=process.env.FORGE_PROJECTS_DATABASE_URL;
  before(async()=>{await maintenance.query(`CREATE DATABASE "${database}"`);process.env.FORGE_PROJECTS_DATABASE_URL=connection.href;await store.__testReset();});
  after(async()=>{await store.closeProjectStore();if(previous===undefined)delete process.env.FORGE_PROJECTS_DATABASE_URL;else process.env.FORGE_PROJECTS_DATABASE_URL=previous;
    try{await maintenance.query(`DROP DATABASE "${database}"`);}finally{await maintenance.end();}});
  citationWriteContracts((name,body)=>test('Citation writes PostgreSQL: '+name,{timeout:15000},body),async t=>{
    const {doc}=await store.createProject({owner:'owner',title:'Citation write fixture',scenes:writeScenes()}),binding={id:doc.id,owner:'owner'};
    t.after(()=>store.deleteProject(binding));
    return {store,binding,dialect:'postgres',registry:createSourceRegistry(store),citations:createProjectCitations(store),query:(sql,params=[])=>store.withRuntimeTransaction(binding,tx=>tx.query(sql,params)),waitForLock:()=>waitForPgLock(store)};
  });
}
