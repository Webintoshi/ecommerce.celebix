import assert from 'node:assert/strict';
import test from 'node:test';
import {initializeLoyaltyProductionRuntime} from './production.ts';
import {startDefaultLoyaltyProductionWorker} from './default.ts';
const database={url:'postgresql://runtime:secret@postgres:5432/celebix_saas_staging_fixture?sslmode=verify-full',name:'celebix_saas_staging_fixture',ca:'test certificate authority'};
test('loyalty startup requires workflow membership and all three native integrations before work',async()=>{
 let ended=0;const queries:string[]=[];let ready=false;
 const deps={now:()=>new Date('2026-11-04T12:00:00.000Z'),createPool(){return{async connect(){return{async query(sql:string){queries.push(sql);return sql.includes('version_num')?{rowCount:1,rows:[{major:16,database:database.name,role:'celebix_saas_workflow',superuser:false,workflow_member:true,loyalty_lifecycle:ready}]}:sql.includes('loyalty_process_pending_v1')&&!sql.includes('regprocedure')?{rowCount:1,rows:[{result:{processed:0,failed:0}}]}:{rowCount:0,rows:[]};},release(){}};},async end(){ended++;}};}};
 await assert.rejects(initializeLoyaltyProductionRuntime(database,deps as never),/loyalty_production_preflight_failed/);assert.equal(ended,1);assert.equal(queries.some(sql=>sql.startsWith('SELECT saas.loyalty_process_pending')),false);
 assert.ok(queries.some(sql=>sql.includes("to_regclass('saas.loyalty_pos_redemptions')")&&sql.includes("to_regprocedure('saas.loyalty_pos_projection_v1(uuid,uuid,jsonb)')")&&sql.includes("to_regclass('saas.loyalty504_functions')")&&sql.includes("to_regprocedure('saas.in_store_sales_bootstrap_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)')")));
 ready=true;const runtime=await initializeLoyaltyProductionRuntime(database,deps as never);assert.deepEqual(await runtime.runOnce(),{processed:0,failed:0});await runtime.close();assert.equal(ended,2);
});
test('development, build and unapproved environments never start the loyalty worker',async()=>{
 for(const source of [{NODE_ENV:'development'},{NODE_ENV:'production',NEXT_PHASE:'phase-production-build',CELEBIX_SAAS_AUTH_MODE:'approved_staging',CELEBIX_DEPLOYMENT_TIER:'staging'},{NODE_ENV:'production'}])await(await startDefaultLoyaltyProductionWorker(source)).stop();
});
