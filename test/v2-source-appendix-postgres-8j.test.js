import test,{before,after} from 'node:test';
import { Pool } from 'pg';
import * as store from '../src/projects/store-postgres.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { seed } from './v2-tool-fixture.js';
import { appendixContracts } from './v2-source-appendix-contract.js';
import { waitForPgLock } from './v2-citation-references-contract.js';
const url=process.env.FORGE_J64_TEST_PG_URL;
if(!url)test('References appendix PostgreSQL: backend unavailable, five contracts unexecuted',t=>t.skip('Owned isolated FORGE_J64_TEST_PG_URL required.'));
else {
  const database='forge_appendix_j64_'+process.pid+'_'+Date.now().toString(36),maintenance=new Pool({connectionString:url,connectionTimeoutMillis:3000});
  const connection=new URL(url);connection.pathname='/'+database;const previous=process.env.FORGE_PROJECTS_DATABASE_URL;
  before(async()=>{await maintenance.query(`CREATE DATABASE "${database}"`);process.env.FORGE_PROJECTS_DATABASE_URL=connection.href;await store.__testReset();});
  after(async()=>{await store.closeProjectStore();if(previous===undefined)delete process.env.FORGE_PROJECTS_DATABASE_URL;else process.env.FORGE_PROJECTS_DATABASE_URL=previous;
    try{await maintenance.query(`DROP DATABASE "${database}"`);}finally{await maintenance.end();}});
  appendixContracts((name,body)=>test('References appendix PostgreSQL: '+name,{timeout:15000},body),async()=>{
    const {doc}=await store.createProject({owner:'owner',title:'Copy fixture',scenes:seed()}),binding={id:doc.id,owner:'owner'};
    return {store,binding,dialect:'postgres',registry:createSourceRegistry(store),query:(sql,params=[])=>store.withRuntimeTransaction(binding,tx=>tx.query(sql,params)),waitForLock:()=>waitForPgLock(store)};
  });
}
