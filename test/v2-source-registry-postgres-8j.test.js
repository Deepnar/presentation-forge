import test,{before,after} from 'node:test';
import { Pool } from 'pg';
import * as store from '../src/projects/store-postgres.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { seed } from './v2-tool-fixture.js';
import { child } from './v2-source-registry-fixture.js';
import { contracts } from './v2-source-registry-contract.js';
const url=process.env.FORGE_J2_TEST_PG_URL;
if(!url) test('Registry PostgreSQL: backend unavailable, contracts unexecuted',t=>t.skip('Owned isolated FORGE_J2_TEST_PG_URL is required.'));
else {
  const database='forge_source_j2_'+process.pid+'_'+Date.now().toString(36),maintenance=new Pool({connectionString:url,connectionTimeoutMillis:3000});
  const connection=new URL(url);connection.pathname='/'+database;
  const previous=process.env.FORGE_PROJECTS_DATABASE_URL;
  before(async()=>{await maintenance.query(`CREATE DATABASE "${database}"`);process.env.FORGE_PROJECTS_DATABASE_URL=connection.href;await store.__testReset();});
  after(async()=>{await store.closeProjectStore();if(previous===undefined)delete process.env.FORGE_PROJECTS_DATABASE_URL;else process.env.FORGE_PROJECTS_DATABASE_URL=previous;
    try{await maintenance.query(`DROP DATABASE "${database}"`);}finally{await maintenance.end();}});
  const check=(name,body)=>test('Registry PostgreSQL: '+name,{timeout:15000},body);
  async function setup(t) {
    const {doc}=await store.createProject({owner:'owner',title:'Source fixture',scenes:seed()}),binding={owner:'owner',id:doc.id};
    t.after(()=>store.deleteProject(binding));
    const env={FORGE_PROJECTS_BACKEND:'postgres',FORGE_PROJECTS_DATABASE_URL:connection.href};
    return {store,doc,binding,registry:createSourceRegistry(store),query:(sql,params)=>store.withRuntimeTransaction(binding,tx=>tx.query(sql,params)),
      raw:async(sql,params)=>{let n=0;return(await store.__testQuery(sql.replace(/\?/g,()=>'$'+(++n)),params)).rows;},coldDelete:()=>child('store-postgres',binding,env,'delete')};
  }
  contracts(check,setup);
}
