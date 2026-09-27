import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {createAes256GcmPayloadCipher,createOpaqueStateDigester} from '../../../apps/owner/lib/saas-persistence/identity-crypto.ts';
import {PostgresRegistrationAttemptStore} from '../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts';
import {PostgresOnboardingJobRepository} from '../../../apps/owner/lib/onboarding-jobs/postgres-repository.ts';
const database='onboarding_operations_qa_20260928';
const net={ownerOrigin:'https://owner.saas-staging.celebix.net',panelOrigin:'https://panel.saas-staging.celebix.net',platformDomainSuffix:'saas-staging.celebix.net'};
const site={ownerOrigin:'https://owner.saas-staging.celebix.site',panelOrigin:'https://panel.saas-staging.celebix.site',platformDomainSuffix:'saas-staging.celebix.site'};
const sql=suffix=>readFileSync(new URL(`../../../apps/owner/scripts/sql/saas/202609270167_registration_onboarding_jobs${suffix}`,import.meta.url),'utf8');
const enabled=process.env.CELEBIX_ONBOARDING_OPERATIONS_QA===database;
test('operator retry PG16 scope/CAS/active lease/fence proof preservation and migration cycle',{skip:!enabled},async()=>{
 for(const key of Object.keys(process.env))if(key==='DATABASE_URL'||key.startsWith('PG')||key.includes('SUPABASE'))throw new Error('external_database_environment_denied');
 const admin=new pg.Pool({host:'127.0.0.1',port:56417,user:'postgres',database,connectionTimeoutMillis:2000,statement_timeout:5000});
 let held;
 try{
  const check=(await admin.query("SELECT current_database() AS database,current_setting('server_version_num')::integer/10000 AS major,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];
  assert.equal(check.database,database);assert.equal(check.major,16);assert.equal(check.marker,'celebix-task-owned-disposable-onboarding-20260927');
  if(process.env.CELEBIX_ONBOARDING_OPERATIONS_QA_RED==='1'){
   assert.notEqual((await admin.query("SELECT to_regprocedure('saas.retry_registration_onboarding_job(text,text,text,text,bigint,timestamptz)') AS retry")).rows[0].retry,null,'operator CAS function does not exist');return;
  }
  const installed=(await admin.query("SELECT to_regclass('saas.registration_onboarding_jobs') IS NOT NULL AS installed")).rows[0].installed;
  if(!installed){await admin.query(sql('.up.sql'));await admin.query(sql('_assertions.sql'));await admin.query(sql('.down.sql'));await admin.query(sql('.up.sql'));}
  else {const source=sql('.up.sql');const functions=source.slice(source.indexOf('CREATE FUNCTION saas.list_registration_onboarding_operations'),source.indexOf('DO $grants$')).replaceAll('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');await admin.query(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${functions}COMMIT;`);}
  await admin.query(sql('_assertions.sql'));
  await admin.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='onboarding_operations_qa_workload') THEN CREATE ROLE onboarding_operations_qa_workload NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; END IF; END $$; GRANT celebix_saas_identity TO onboarding_operations_qa_workload");
  const workload={async connect(){const client=await admin.connect();await client.query('SET SESSION AUTHORIZATION onboarding_operations_qa_workload');return {query:(...args)=>client.query(...args),release:()=>client.release(true)};}};
  const now=new Date();const encryption=randomBytes(32);
  const deps={pool:workload,timeouts:{poolCheckoutMs:2000,statementMs:5000,lockMs:5000,idleTransactionMs:5000},clock:()=>now,audit:()=>undefined,identityRole:'celebix_saas_identity',stateDigester:createOpaqueStateDigester({key:randomBytes(32),context:'registration-attempt-state'}),payloadCipher:createAes256GcmPayloadCipher({currentKeyId:'qa',resolveKey:()=>encryption})};
  const repository=new PostgresOnboardingJobRepository(deps);
  const stores=new Map();
  async function fixture(scope){const id=`attempt_qa_ops_${randomBytes(12).toString('hex')}`;const state=randomBytes(32).toString('base64url');const store=new PostgresRegistrationAttemptStore(deps,scope,undefined,scope);
   await store.save({id,state,status:'awaiting_identity',idempotencyKey:randomBytes(24).toString('hex'),requestedAt:now.toISOString(),createdAt:now.toISOString(),expiresAt:new Date(+now+600000).toISOString(),details:{storeName:'QA operator',storeSlug:`qa-ops-${randomBytes(8).toString('hex')}`,locale:'tr',currency:'TRY',themeKey:'starter',privacyAcceptedAt:now.toISOString()}});
   await store.consume(state,now);await store.recordVerifiedIdentity({attemptId:id,expectedVersion:1,identity:{issuer:'https://qa.invalid',subject:randomUUID(),email:`qa-${randomBytes(6).toString('hex')}@example.invalid`,emailVerified:true},now});stores.set(id,store);return id;
  }
  const id=await fixture(net),other=await fixture(site);
  const store=stores.get(id);const completion=await store.claimTenantCompletion({attemptId:id,now});assert.equal(completion.kind,'claimed');completion.lease.release();
  const unknown=await store.markTenantCompletionCommitUnknown({attemptId:id,expectedWorkflowVersion:completion.authority.version,expectedCompletionVersion:completion.authority.completion.version,expectedState:'creating',now});
  const fenced=await store.recoverAbsentTenantCompletion({attemptId:id,expectedWorkflowVersion:unknown.version,expectedCompletionVersion:unknown.completion.version,expectedState:'commit_unknown',now});assert.ok(fenced.completion.recoveryAbsentAt);
  const list=()=>repository.listOperations({scope:net,now,limit:50});
  assert.equal((await list()).some(row=>row.attemptId===other),false);
  const immutable=async()=>JSON.stringify((await admin.query('SELECT w.tenant_idempotency_digest,c.canonical_fingerprint,c.recovery_absent_at,c.state FROM saas.registration_workflows w JOIN saas.registration_tenant_completions c USING(attempt_id) WHERE w.attempt_id=$1',[id])).rows);
  const proof=await immutable();let row=(await list()).find(row=>row.attemptId===id);assert.equal(row.version,1);
  assert.equal(await repository.requestRetry({scope:site,attemptId:id,expectedVersion:row.version,now}),'conflict');
  assert.equal(await repository.requestRetry({scope:net,attemptId:id,expectedVersion:row.version+1,now}),'conflict');
  held=await admin.connect();await held.query('SELECT pg_advisory_lock(hashtextextended($1,2607120012))',[id]);
  assert.equal(await repository.requestRetry({scope:site,attemptId:id,expectedVersion:row.version,now}),'conflict');
  const start=Date.now();assert.equal(await repository.requestRetry({scope:net,attemptId:id,expectedVersion:row.version,now}),'busy');assert.ok(Date.now()-start<5000);
  await held.query('SELECT pg_advisory_unlock(hashtextextended($1,2607120012))',[id]);held.release();held=undefined;
  const claimed=(await repository.claim({scope:net,now,limit:25})).find(job=>job.attemptId===id);row=(await list()).find(row=>row.attemptId===id);assert.equal(row.version,2);
  assert.equal(await repository.requestRetry({scope:net,attemptId:id,expectedVersion:row.version,now}),'busy');
  assert.equal(await repository.finish({scope:net,attemptId:id,leaseToken:claimed.leaseToken,now,state:'attention_required',safeCode:'completion_failed'}),true);
  row=(await list()).find(row=>row.attemptId===id);assert.equal(row.version,3);
  const results=await Promise.all([repository.requestRetry({scope:net,attemptId:id,expectedVersion:row.version,now}),repository.requestRetry({scope:net,attemptId:id,expectedVersion:row.version,now})]);
  assert.equal(results.filter(result=>result==='queued').length,1);assert.equal(results.filter(result=>result==='busy'||result==='conflict').length,1);
  assert.equal(await repository.requestRetry({scope:net,attemptId:id,expectedVersion:row.version,now}),'conflict');
  row=(await list()).find(row=>row.attemptId===id);assert.equal(row.version,4);assert.equal(row.state,'pending');assert.equal(row.failureCount,0);
  assert.equal(await immutable(),proof,'operator retry changed immutable completion authority');
  const client=await workload.connect();try{await assert.rejects(()=>client.query('SELECT * FROM saas.registration_onboarding_jobs'),/permission denied/);}finally{client.release();}
  await assert.rejects(()=>admin.query(sql('.down.sql')),/ONBOARDING_ROLLBACK_HAS_DURABLE_AUTHORITY/);await admin.query('ROLLBACK');
  console.info('PG16 operator PASS: migration up/down/up, 12 restricted functions, wrong scope/stale version, session lease busy, active job lease busy, two-writer retry CAS, unchanged identity key/fingerprint/fence, RLS and durable rollback guard');
 }finally{if(held){await held.query('SELECT pg_advisory_unlock_all()').catch(()=>undefined);held.release();}await admin.end();}
});
