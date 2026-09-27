import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {PostgresSaaSDataRepository,PostgresTenantOperationRecovery} from '@celebix/saas-data';
import {createStarterTenantService} from '@celebix/saas-tenant-core';
import {createOwnerTenantCoreAdapter} from '../../../apps/owner/lib/saas-tenant-core/adapter.ts';
import {createPersistentRegistrationCompletionService,createPersistentRegistrationRecoveryService} from '../../../apps/owner/lib/self-serve-registration-completion.ts';
import {createAes256GcmPayloadCipher,createOpaqueStateDigester} from '../../../apps/owner/lib/saas-persistence/identity-crypto.ts';
import {PostgresRegistrationAttemptStore} from '../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts';
import {PostgresOnboardingJobRepository,bindOriginalRegistrationScope} from '../../../apps/owner/lib/onboarding-jobs/postgres-repository.ts';
import {createDefaultOnboardingWorker} from '../../../apps/owner/lib/onboarding-jobs/default.ts';
import {probeTenantAccess} from '../../../apps/owner/lib/onboarding-jobs/access-probe.ts';
const database='onboarding_jobs_empty_qa_20260927';
const connection={host:'127.0.0.1',port:56417,user:'postgres',database,connectionTimeoutMillis:2000};
const sql=name=>readFileSync(new URL(`../../../apps/owner/scripts/sql/saas/${name}`,import.meta.url),'utf8');
const up=()=>sql('202609270167_registration_onboarding_jobs.up.sql');
const assertions=()=>sql('202609270167_registration_onboarding_jobs_assertions.sql');
const down=()=>sql('202609270167_registration_onboarding_jobs.down.sql');
const net={ownerOrigin:'https://owner.saas-staging.celebix.net',panelOrigin:'https://panel.saas-staging.celebix.net',platformDomainSuffix:'saas-staging.celebix.net'};
const site={ownerOrigin:'https://owner.saas-staging.celebix.site',panelOrigin:'https://panel.saas-staging.celebix.site',platformDomainSuffix:'saas-staging.celebix.site'};
test('PG16 durable scope, atomic enqueue, scope separation, lease CAS, retry cap, RLS and rollback guards',async()=>{
 const admin=new pg.Pool(connection);const pools=[];
 try{
  const check=(await admin.query("SELECT current_database() AS name,current_setting('server_version_num') AS version,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];
  assert.equal(check.name,database);assert.equal(Math.floor(Number(check.version)/10000),16);assert.equal(check.marker,'celebix-task-owned-disposable-onboarding-20260927');
  if(process.env.CELEBIX_ONBOARDING_QA_RED==='1'){
   let failure;try{await admin.query(assertions());}catch(error){failure=error;}
   assert.equal(failure,undefined,'onboarding migration authority is not installed');return;
  }
  const installed=(await admin.query("SELECT to_regclass('saas.registration_authority_scopes') IS NOT NULL AS installed")).rows[0].installed;
  if(!installed){await admin.query(up());await admin.query(assertions());await admin.query(down());await admin.query(up());}
  await admin.query(assertions());
  // Assertions must fail on empty/missing relations, RLS drift and unexpected grants, independently of row count.
  for(const mutation of ["ALTER TABLE saas.registration_onboarding_jobs DISABLE ROW LEVEL SECURITY","GRANT SELECT ON saas.registration_authority_scopes TO celebix_saas_identity","ALTER FUNCTION saas.read_registration_onboarding_health(text,text,text,timestamptz) SECURITY INVOKER"]){
   const client=await admin.connect();try{await client.query('BEGIN');await client.query(mutation);await assert.rejects(()=>client.query(assertions()),/ONBOARDING_.*ASSERTION_FAILED/);}finally{await client.query('ROLLBACK');client.release();}
  }
  await admin.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='onboarding_jobs_qa_workload') THEN CREATE ROLE onboarding_jobs_qa_workload NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; END IF; END $$; GRANT celebix_saas_identity,celebix_saas_bootstrap TO onboarding_jobs_qa_workload");
  const workload={async connect(){const c=await admin.connect();await c.query('SET SESSION AUTHORIZATION onboarding_jobs_qa_workload');return {query:async(...args)=>{try{return await c.query(...args);}catch(error){if(error.code!=='42501')console.info('QA database failure code',error.code);throw error;}},release:()=>{c.release(true);}};}};
  const key=randomBytes(32);const cipher=createAes256GcmPayloadCipher({currentKeyId:'qa',resolveKey:()=>key});
  const now=new Date();
  const deps={pool:workload,stateDigester:createOpaqueStateDigester({key:randomBytes(32),context:'registration-attempt-state'}),payloadCipher:cipher,timeouts:{poolCheckoutMs:2000,statementMs:5000,lockMs:5000,idleTransactionMs:5000},clock:()=>now,audit:()=>undefined,identityRole:'celebix_saas_identity'};
  async function fixture(scope,verified=true){
   const id=`attempt_qa167_${randomBytes(12).toString('hex')}`;const state=randomBytes(32).toString('base64url');
   const store=new PostgresRegistrationAttemptStore(deps,scope??net,undefined,scope);
   await store.save({id,state,status:'awaiting_identity',idempotencyKey:randomBytes(24).toString('hex'),requestedAt:now.toISOString(),createdAt:now.toISOString(),expiresAt:new Date(+now+600000).toISOString(),details:{storeName:'QA onboarding',storeSlug:`qa167-${randomBytes(8).toString('hex')}`,locale:'tr',currency:'TRY',themeKey:'starter',privacyAcceptedAt:now.toISOString()}});
   if(verified){await store.consume(state,now);await store.recordVerifiedIdentity({attemptId:id,expectedVersion:1,identity:{issuer:'https://qa.invalid',subject:randomUUID(),email:`qa-${randomBytes(6).toString('hex')}@example.invalid`,emailVerified:true},now});}
   return {id,store,state};
  }
  const a=await fixture(net),b=await fixture(site),legacy=await fixture(undefined),waiting=await fixture(net,false);
  const aborted=await fixture(net,false);await aborted.store.consume(aborted.state,now);
  const rollbackPool={async connect(){const c=await workload.connect();return {release:()=>c.release(),async query(text,values){if(text.startsWith('INSERT INTO saas.registration_tenant_completions'))throw new Error('synthetic atomic rollback');return c.query(text,values);}};}};
  await assert.rejects(()=>new PostgresRegistrationAttemptStore({...deps,pool:rollbackPool},net).recordVerifiedIdentity({attemptId:aborted.id,expectedVersion:1,identity:{issuer:'https://qa.invalid',subject:randomUUID(),email:'atomic@example.invalid',emailVerified:true},now}));
  assert.equal(Number((await admin.query('SELECT count(*) AS count FROM saas.registration_onboarding_jobs WHERE attempt_id=$1',[aborted.id])).rows[0].count),0);
  assert.equal(Number((await admin.query('SELECT count(*) AS count FROM saas.registration_verified_identities WHERE attempt_id=$1',[aborted.id])).rows[0].count),0);
  const repository=new PostgresOnboardingJobRepository(deps);
  assert.equal(Number((await admin.query('SELECT count(*) AS count FROM saas.registration_onboarding_jobs WHERE attempt_id=$1',[a.id])).rows[0].count),1);
  assert.equal(Number((await admin.query('SELECT count(*) AS count FROM saas.registration_onboarding_jobs WHERE attempt_id=ANY($1::text[])',[[legacy.id,waiting.id]])).rows[0].count),0);
  await assert.rejects(()=>admin.query('SELECT saas.bind_registration_onboarding_scope($1,$2,$3,$4,$5)',[legacy.id,net.ownerOrigin,net.panelOrigin,net.platformDomainSuffix,now.toISOString()]),/ORIGINAL_SCOPE_REQUIRED/);
  const [left,right]=await Promise.all([repository.claim({scope:net,now,limit:25}),repository.claim({scope:net,now,limit:25})]);
  const own=[...left,...right].filter(j=>j.attemptId===a.id);assert.equal(own.length,1);assert.equal([...left,...right].some(j=>j.attemptId===b.id),false);
  const first=own[0];assert.equal(await repository.finish({scope:site,attemptId:a.id,leaseToken:first.leaseToken,now,state:'pending',safeCode:'completion_pending'}),false);
  const restart=new PostgresOnboardingJobRepository(deps);const afterExpiry=new Date(+now+61000);
  const reclaimed=(await restart.claim({scope:net,now:afterExpiry,limit:25})).find(j=>j.attemptId===a.id);assert.ok(reclaimed);assert.notEqual(reclaimed.leaseToken,first.leaseToken);
  assert.equal(await repository.finish({scope:net,attemptId:a.id,leaseToken:first.leaseToken,now:afterExpiry,state:'retry',safeCode:'completion_unavailable'}),false);
  assert.equal(await restart.finish({scope:net,attemptId:a.id,leaseToken:reclaimed.leaseToken,now:afterExpiry,state:'pending',safeCode:'completion_pending'}),true);
  let current=new Date(+afterExpiry+15000);const expected=[15,30,60,120,300,300,300,300,300,300];
  for(let i=0;i<10;i++){
   const job=(await repository.claim({scope:net,now:current,limit:25})).find(j=>j.attemptId===a.id);assert.ok(job);assert.equal(job.failureCount,i);
   assert.equal(await repository.finish({scope:net,attemptId:a.id,leaseToken:job.leaseToken,now:current,state:'retry',safeCode:'completion_unavailable'}),true);
   const row=(await admin.query('SELECT state,failure_count,due_at FROM saas.registration_onboarding_jobs WHERE attempt_id=$1',[a.id])).rows[0];assert.equal(+row.due_at-+current,expected[i]*1000);assert.equal(row.failure_count,i+1);if(i===9)assert.equal(row.state,'attention_required');current=new Date(+row.due_at);
  }
  assert.equal((await repository.claim({scope:net,now:current,limit:25})).some(j=>j.attemptId===a.id),false);
  await repository.heartbeat(net,now);assert.equal((await repository.readHealth(net,new Date(+now+44999))).workerState,'healthy');assert.equal((await repository.readHealth(net,new Date(+now+45000))).workerState,'degraded');assert.equal((await repository.readHealth(site,now)).workerState,'degraded');
  assert.equal(await repository.readSnapshot({scope:net,attemptId:a.id,now}),undefined);
  const c=await workload.connect();try{await assert.rejects(()=>c.query('SELECT * FROM saas.registration_onboarding_jobs'),/permission denied/);}finally{c.release();}
  // Legacy backfill gets its scope from reviewed exact canonical committed domains, never from the scanning worker.
  const tenantOptions={pool:workload,generateId:()=>randomUUID(),audit:()=>undefined,timeouts:deps.timeouts,bootstrapRole:'celebix_saas_bootstrap',panelOrigin:net.panelOrigin,adminOriginEnvironment:'staging_net'};
  const completion=createPersistentRegistrationCompletionService({workflowStore:legacy.store,tenantCore:createOwnerTenantCoreAdapter(createStarterTenantService({repository:new PostgresSaaSDataRepository(tenantOptions),platformDomainSuffix:net.platformDomainSuffix,panelBaseUrl:net.panelOrigin,adminOriginEnvironment:'staging_net'})),recovery:new PostgresTenantOperationRecovery(tenantOptions),panelOrigin:net.panelOrigin,platformDomainSuffix:net.platformDomainSuffix,clock:()=>now,audit:()=>undefined});
  const created=await completion.resumeTenantCreation(legacy.id);assert.ok('result' in created,`legacy fixture completion: ${JSON.stringify(created)}`);
  const before=Date.now();
  await admin.query('SELECT saas.backfill_registration_onboarding_jobs($1,$2,$3,$4,$5)',[site.ownerOrigin,site.panelOrigin,site.platformDomainSuffix,now,25]);
  assert.equal(Number((await admin.query('SELECT count(*) AS count FROM saas.registration_authority_scopes WHERE attempt_id=$1',[legacy.id])).rows[0].count),0);
  await admin.query('SELECT saas.backfill_registration_onboarding_jobs($1,$2,$3,$4,$5)',[net.ownerOrigin,net.panelOrigin,net.platformDomainSuffix,now,25]);
  const legacyJob=(await repository.claim({scope:net,now,limit:25})).find(j=>j.attemptId===legacy.id);assert.ok(legacyJob);
  const result=created.result;assert.equal(await repository.verifyTenantProof(net,legacy.id,result.store.id,new URL(result.panelUrl).hostname,new URL(result.storefrontUrl).hostname,now),true);
  const snapshot={attemptId:legacy.id,storeId:result.store.id,checkedAt:now.toISOString(),state:'ready',safeCodes:['access_ready']};
  assert.equal(await repository.finish({scope:net,attemptId:legacy.id,leaseToken:legacyJob.leaseToken,now,state:'ready',safeCode:'access_ready',snapshot}),true);
  assert.equal((await repository.readSnapshot({scope:net,attemptId:legacy.id,storeId:result.store.id,now})).state,'ready');
  assert.equal(await repository.readSnapshot({scope:site,attemptId:legacy.id,now}),undefined);
  assert.equal(await repository.readSnapshot({scope:net,attemptId:legacy.id,storeId:randomUUID(),now}),undefined);
  assert.equal(await repository.readSnapshot({scope:net,attemptId:legacy.id,now:new Date(+now+300000)}),undefined);
  const refresh=(await repository.claim({scope:net,now:new Date(+now+300000),limit:25})).find(job=>job.attemptId===legacy.id);assert.ok(refresh,'ready access must become due for refresh at5min');
  assert.equal((await repository.readCompletedTenant(net,legacy.id)).store.id,result.store.id);
  assert.equal(await repository.readCompletedTenant(site,legacy.id),undefined);

  assert.ok(Date.now()-before<60000,'healthy legacy access fixture exceeds60s');
  const verifiedStarted=Date.now();const fresh=await fixture(net);
  const freshDependencies={workflowStore:fresh.store,tenantCore:createOwnerTenantCoreAdapter(createStarterTenantService({repository:new PostgresSaaSDataRepository(tenantOptions),platformDomainSuffix:net.platformDomainSuffix,panelBaseUrl:net.panelOrigin,adminOriginEnvironment:'staging_net'})),recovery:new PostgresTenantOperationRecovery(tenantOptions),panelOrigin:net.panelOrigin,platformDomainSuffix:net.platformDomainSuffix,clock:()=>new Date(),audit:()=>undefined};
  const worker=createDefaultOnboardingWorker({scope:net,repository,completion:createPersistentRegistrationCompletionService(freshDependencies),recovery:createPersistentRegistrationRecoveryService(freshDependencies),clock:()=>new Date(),probe:(scope,result,attemptId)=>probeTenantAccess(scope,result,{attemptId,now:new Date(),verifyProof:p=>repository.verifyTenantProof(p.scope,p.attemptId,p.storeId,p.adminHost,p.storefrontHost,p.now),get:async url=>({status:200,body:url.pathname==='/api/health'?JSON.stringify({schemaVersion:1,status:'ok',storeId:result.store.id,hostname:url.hostname}):'<html>QA</html>'})})});
  const counts=await worker.tick();assert.ok(counts.ready>=1);assert.equal((await repository.readSnapshot({scope:net,attemptId:fresh.id,now:new Date()})).state,'ready');
  const elapsed=Date.now()-verifiedStarted;assert.ok(elapsed<=60000,'verification to ready fixture exceeds60s');console.info(`Synthetic verification-to-ready ${elapsed}ms (realPG, injected network; not liveTLS evidence)`);

  await assert.rejects(()=>admin.query(down()),/ONBOARDING_ROLLBACK_HAS_DURABLE_AUTHORITY/);await admin.query('ROLLBACK');
  console.info('PG16 PASS: up/down/up, assertion tamper checks, atomic verified enqueue, legacy fail closed, awaiting exclusion, NET/SITE isolation, SKIP LOCKED claims, restart/expired lease CAS, pending budget, 10 retries/backoff, heartbeat45s, RLS, guarded rollback');
 }finally{await Promise.all(pools.map(p=>p.end()));await admin.end();}
});
