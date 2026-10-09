import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import type {TenantContext} from '@celebix/saas-contracts';
const api=await import('./repository.ts').catch(()=>({})) as typeof import('./repository.ts');
test('connection commands are available through a bounded repository',()=>{
 assert.equal(typeof api.createPostgresEmailMarketingConnectionRepository,'function');
});
const configPath=process.env.CELEBIX_EMAIL_ISOLATED_PG_CONFIG;
test('apply replays without a second provider write and releases database during provider IO',{skip:!configPath},async()=>{
 assert.equal(typeof api.createPostgresEmailMarketingConnectionRepository,'function');
 const config=JSON.parse(await readFile(configPath!,'utf8'));assert.equal(config.database,'email_marketing_isolated');assert.match(config.host,/^\/tmp\/celebix-email-marketing-/);
 // Shared native fixtures expose authority only for this disposable database.
 const pool=new Pool({...config,max:1});
 try{
  const tenantContext=await createNativeFixture(pool);let writes=0;
  const adapter={account:async()=>({id:'repo-test-account',name:'Test',senderStatus:'unknown' as const}),lists:async()=>({items:[{id:'managed',name:'Celebix'}]}),createList:async()=>{writes++;const concurrency=await pool.query('SELECT 1 AS ok');assert.equal(concurrency.rows[0].ok,1);return {kind:'verified' as const,value:{id:'new-managed',name:'Test list'}};}};
  const repo=api.createPostgresEmailMarketingConnectionRepository({pool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:3000,statementMs:10000,lockMs:3000,idleTransactionMs:10000},keyring:{activeKeyId:'test',keys:[{keyId:'test',key:new Uint8Array(32).fill(5)}]},providers:{brevo:adapter,klaviyo:adapter},uuid:()=>crypto.randomUUID()});
  const now=new Date();const a={tenantContext,now};const candidate=await repo.validate({...a,provider:'brevo',apiKey:'isolated-fixture-key',sessionBinding:'test-session-opaque-123',operationId:crypto.randomUUID()});
  const input={...a,candidateId:candidate.candidateId,sessionBinding:'test-session-opaque-123',expectedVersion:0,operationId:crypto.randomUUID(),selection:{kind:'create' as const,name:'Test list'}};
  const first=await repo.apply(input);const second=await repo.apply(input);assert.equal(first.id,second.id);assert.equal(second.version,1);assert.equal(writes,1);
  const rotatedRepo=api.createPostgresEmailMarketingConnectionRepository({pool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:3000,statementMs:10000,lockMs:3000,idleTransactionMs:10000},keyring:{activeKeyId:'rotated',keys:[{keyId:'rotated',key:new Uint8Array(32).fill(6)},{keyId:'test',key:new Uint8Array(32).fill(5)}]},providers:{brevo:adapter,klaviyo:adapter},uuid:()=>crypto.randomUUID()});
  assert.equal((await rotatedRepo.apply(input)).id,first.id);assert.equal(writes,1);
  const state=await pool.query("SELECT (SELECT count(*) FROM saas.email_marketing_connections WHERE store_id=$1) AS connections,(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE store_id=$1 AND kind='bootstrap') AS jobs",[tenantContext.store.id]);assert.equal(state.rows[0].connections,'1');assert.equal(state.rows[0].jobs,'1');
 }finally{await cleanupNativeFixture(pool);await pool.end();}
});

const fixture={principal:'22500000-0000-4000-8000-000000000001',store:'22500000-0000-4000-8000-000000000002',membership:'22500000-0000-4000-8000-000000000003',subscription:'22500000-0000-4000-8000-000000000004'};
async function createNativeFixture(pool:Pool):Promise<TenantContext>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const {rows}=await client.query("SELECT p.id,p.plan_code,p.version FROM saas.plans p JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='integrations' AND f.enabled WHERE p.status='active' AND p.valid_from<=clock_timestamp() AND(p.valid_until IS NULL OR p.valid_until>clock_timestamp()) ORDER BY p.version DESC LIMIT 1");const plan=rows[0];assert.ok(plan);
 await client.query("INSERT INTO saas.principals VALUES($1,'https://email-repository-fixture.invalid','repo-fixture','repo-fixture@example.test',true,clock_timestamp(),clock_timestamp()) ON CONFLICT(id) DO NOTHING",[fixture.principal]);
 await client.query("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Email repository fixture','email-repo-fixture','active','tr','TRY','base',clock_timestamp(),clock_timestamp()) ON CONFLICT(id) DO NOTHING",[fixture.store]);
 await client.query("INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'store_owner','active',clock_timestamp(),clock_timestamp()) ON CONFLICT(id) DO NOTHING",[fixture.membership,fixture.principal,fixture.store]);
 await client.query("INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active',clock_timestamp()-interval '1 day',clock_timestamp(),clock_timestamp()) ON CONFLICT(id) DO NOTHING",[fixture.subscription,fixture.store,plan.id,plan.plan_code,plan.version]);await client.query('COMMIT');
 return {schemaVersion:1,requestId:'test',principal:{id:fixture.principal,issuer:'https://email-repository-fixture.invalid',subject:'repo-fixture'},store:{id:fixture.store,slug:'email-repo-fixture',status:'active'},membership:{id:fixture.membership,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:plan.id,planCode:plan.plan_code,version:Number(plan.version),status:'active',features:['integrations'],limits:{products:1,staff:1,storageBytes:1},validFrom:'2026-01-01T00:00:00Z'},locale:'tr'} as TenantContext;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function cleanupNativeFixture(pool:Pool){
 const client=await pool.connect();try{await client.query('BEGIN');for(const table of ['email_marketing_sync_jobs','email_marketing_operations','email_marketing_candidates','email_marketing_contacts','email_marketing_connections'])await client.query(`DELETE FROM saas.${table} WHERE store_id=$1`,[fixture.store]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
