import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {createAes256GcmPayloadCipher,createOpaqueStateDigester} from '../../../apps/owner/lib/saas-persistence/identity-crypto.ts';
import {PostgresRegistrationAttemptStore} from '../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts';
import {PostgresOidcTransactionStore} from '../../../apps/owner/lib/saas-persistence/postgres-oidc-transaction-store.ts';
import {createPanelBrowserBindingAuthorityCodec} from '../../../apps/owner/lib/panel-browser-binding/credential-codec.ts';
import {createPostgresPanelBrowserBindingRepository} from '../../../apps/owner/lib/panel-browser-binding/postgres-repository.ts';
import {createOnboardingStatusCredentialCodec} from '../../../apps/owner/lib/self-serve-status/credential-codec.ts';
import {PostgresSaaSDataRepository,PostgresTenantOperationRecovery} from '@celebix/saas-data';
import {createStarterTenantService} from '@celebix/saas-tenant-core';
import {createOwnerTenantCoreAdapter} from '../../../apps/owner/lib/saas-tenant-core/adapter.ts';
import {createPersistentRegistrationCompletionService} from '../../../apps/owner/lib/self-serve-registration-completion.ts';
import {PostgresOnboardingJobRepository} from '../../../apps/owner/lib/onboarding-jobs/postgres-repository.ts';
import {PostgresOnboardingStatusRepository} from '../../../apps/owner/lib/self-serve-status/postgres-repository.ts';
const database='onboarding_status_qa_20260927';
const scope={ownerOrigin:'https://owner.saas-staging.celebix.net',panelOrigin:'https://panel.saas-staging.celebix.net',platformDomainSuffix:'saas-staging.celebix.net'};
const site={ownerOrigin:'https://owner.saas-staging.celebix.site',panelOrigin:'https://panel.saas-staging.celebix.site',platformDomainSuffix:'saas-staging.celebix.site'};
const sql=name=>readFileSync(new URL(`../../../apps/owner/scripts/sql/saas/${name}`,import.meta.url),'utf8');
test('PG16 atomic status/bootstrap authority, scope isolation, expiry, rollback and bounded cleanup',async()=>{
 assert.equal(Object.keys(process.env).some(k=>/^PG|DATABASE_URL$/.test(k)),false,'ambient database authority forbidden');
 const admin=new pg.Pool({host:'127.0.0.1',port:56417,user:'postgres',database,connectionTimeoutMillis:2000});
 try{
  const check=(await admin.query("SELECT current_database() AS name,current_setting('server_version_num') AS version,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];
  assert.equal(check.name,database);assert.equal(Number(check.version),160014);assert.equal(check.marker,'celebix-task-owned-disposable-onboarding-20260927');
  if(process.env.CELEBIX_ONBOARDING_STATUS_QA_RED==='1'){assert.equal((await admin.query("SELECT to_regprocedure('saas.read_registration_status(text,text,text,text,timestamp with time zone)') IS NOT NULL AS installed")).rows[0].installed,true,'status binding function missing');return;}
  if(!(await admin.query("SELECT to_regclass('saas.registration_authority_scopes') IS NOT NULL AS installed")).rows[0].installed)await admin.query(sql('202609270167_registration_onboarding_jobs.up.sql'));
  if(!(await admin.query("SELECT to_regclass('saas.registration_status_bindings') IS NOT NULL AS installed")).rows[0].installed){await admin.query(sql('202609270168_registration_status_bindings.up.sql'));await admin.query(sql('202609270168_registration_status_bindings_assertions.sql'));await admin.query(sql('202609270168_registration_status_bindings.down.sql'));await admin.query(sql('202609270168_registration_status_bindings.up.sql'));}
  await admin.query(sql('202609270168_registration_status_bindings_assertions.sql'));
  for(const mutation of ["ALTER TABLE saas.registration_status_bindings DISABLE ROW LEVEL SECURITY","GRANT SELECT ON saas.registration_status_bindings TO celebix_saas_identity","ALTER FUNCTION saas.read_registration_status(text,text,text,text,timestamptz) SECURITY INVOKER","GRANT EXECUTE ON FUNCTION saas.registration_onboarding_status_projection(text,timestamptz) TO celebix_saas_identity"]){
   const client=await admin.connect();try{await client.query('BEGIN');await client.query(mutation);await assert.rejects(()=>client.query(sql('202609270168_registration_status_bindings_assertions.sql')),/REGISTRATION_STATUS_.*ASSERTION_FAILED/);}finally{await client.query('ROLLBACK');client.release();}
  }
  await admin.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='onboarding_status_qa_workload') THEN CREATE ROLE onboarding_status_qa_workload NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; END IF; END $$; GRANT celebix_saas_identity,celebix_saas_bootstrap TO onboarding_status_qa_workload");
  const workload={async connect(){const c=await admin.connect();await c.query('SET SESSION AUTHORIZATION onboarding_status_qa_workload');return {query:async(...args)=>{try{return await c.query(...args);}catch(error){if(!["42501","23505"].includes(error.code))console.info("Synthetic SQL code",error.code,"constraint",/^[a-z0-9_]{1,100}$/.test(error.constraint??"")?error.constraint:"none");throw error;}},release:()=>c.release(true)};}};
  const now=new Date();const key=randomBytes(32);const stateDigester=createOpaqueStateDigester({key,context:'registration-attempt-state'});const oidcStateDigester=createOpaqueStateDigester({key,context:'oidc-transaction-state'});
  const deps={pool:workload,stateDigester,payloadCipher:createAes256GcmPayloadCipher({currentKeyId:'qa168',resolveKey:()=>key}),timeouts:{poolCheckoutMs:2000,statementMs:2000,lockMs:2000,idleTransactionMs:2000},clock:()=>new Date(),audit:()=>{},identityRole:'celebix_saas_identity'};
  const codec=createPanelBrowserBindingAuthorityCodec({bootstrapKeys:new Map([['qa168',key]]),activeBootstrapKeyId:'qa168',browserBindingKeys:new Map([['qa168',key]]),activeBrowserBindingKeyId:'qa168',randomBytes});
  const browser=createPostgresPanelBrowserBindingRepository({...deps,oidcStateDigester,credentialCodec:codec});const statusCodec=createOnboardingStatusCredentialCodec({key,randomBytes});const reader=new PostgresOnboardingStatusRepository(deps);
  async function fixture(){const attemptId=`attempt_qa168_${randomBytes(12).toString('hex')}`;const rawState=randomBytes(32).toString('base64url');const store=new PostgresRegistrationAttemptStore(deps,scope,{oidcStateDigester},scope);
   await store.save({id:attemptId,state:rawState,status:'awaiting_identity',idempotencyKey:randomBytes(24).toString('hex'),requestedAt:now.toISOString(),createdAt:now.toISOString(),expiresAt:new Date(+now+600000).toISOString(),details:{storeName:'QA status',storeSlug:`qa168-${randomBytes(8).toString('hex')}`,locale:'tr',currency:'TRY',themeKey:'starter',privacyAcceptedAt:now.toISOString()}});
   await new PostgresOidcTransactionStore({...deps,stateDigester:oidcStateDigester},{callbackAuthority:`${scope.panelOrigin}/auth/callback`}).save({state:rawState,nonce:randomBytes(32).toString('base64url'),codeVerifier:randomBytes(32).toString('base64url'),redirectUri:`${scope.panelOrigin}/auth/callback`,returnTo:'/kayit',expectedIssuer:'https://identity.example.invalid/oidc',expectedAudience:'qa168',createdAt:now.toISOString(),expiresAt:new Date(+now+600000).toISOString()});
   const input={rawState,bootstrapCredential:codec.generateBootstrapCredential().credential,providerAuthorizationUrl:'https://identity.example.invalid/authorize',bindingId:randomUUID(),issuedAt:now,expiresAt:new Date(+now+300000)};return {attemptId,input,store};}
  const f=await fixture();const status=statusCodec.issue();const binding={digest:status.digest,scope,expiresAt:new Date(+now+86400000)};
  assert.equal((await browser.issueBootstrapWithStatus(f.input,{...binding,scope:site})).kind,'durable_authority_invalid');
  assert.equal(Number((await admin.query('SELECT count(*) AS n FROM saas.panel_browser_bindings WHERE attempt_id=$1',[f.attemptId])).rows[0].n),0);
  assert.equal((await browser.issueBootstrapWithStatus(f.input,binding)).kind,'browser_bootstrap_created');assert.equal((await browser.issueBootstrapWithStatus(f.input,binding)).kind,'browser_bootstrap_replayed');
  assert.equal((await reader.readStatus({digest:status.digest,scope,now})).projection.stage,'awaiting_identity');
  assert.equal((await reader.readStatus({digest:status.digest,scope:site,now})).kind,'unauthorized');assert.equal((await reader.readStatus({digest:'0'.repeat(64),scope,now})).kind,'unauthorized');
  assert.equal((await browser.issueBootstrapWithStatus(f.input,{...binding,digest:statusCodec.issue().digest})).kind,'operation_mismatch');
  // Duplicate digest violates the second insert: the paired bootstrap must roll back.
  const second=await fixture();assert.equal((await browser.issueBootstrapWithStatus(second.input,binding)).kind,'unavailable');
  assert.equal(Number((await admin.query('SELECT count(*) AS n FROM saas.panel_browser_bindings WHERE attempt_id=$1',[second.attemptId])).rows[0].n),0);
  await f.store.consume(f.input.rawState,now);assert.equal((await reader.readStatus({digest:status.digest,scope,now})).projection.stage,'creating');
  assert.equal(await reader.readCachedReady({rawState:f.input.rawState,scope,now}),false);
  const expiredUncertain=(await admin.query("SELECT saas.registration_onboarding_status_projection($1,$2::timestamptz)->>'stage' AS stage",[f.attemptId,new Date(+now+600001)])).rows[0].stage;assert.equal(expiredUncertain,'attention_required');
  const expiredUnverified=(await admin.query("SELECT saas.registration_onboarding_status_projection($1,$2::timestamptz)->>'stage' AS stage",[second.attemptId,new Date(+now+600001)])).rows[0].stage;assert.equal(expiredUnverified,'expired');
  await f.store.recordVerifiedIdentity({attemptId:f.attemptId,expectedVersion:1,identity:{issuer:'https://identity.example.invalid/oidc',subject:randomUUID(),email:`qa-${randomBytes(6).toString('hex')}@example.invalid`,emailVerified:true},now});
  const tenantOptions={pool:workload,generateId:()=>randomUUID(),audit:()=>{},timeouts:deps.timeouts,bootstrapRole:'celebix_saas_bootstrap',panelOrigin:scope.panelOrigin,adminOriginEnvironment:'staging_net'};
  const completion=createPersistentRegistrationCompletionService({workflowStore:f.store,tenantCore:createOwnerTenantCoreAdapter(createStarterTenantService({diagnostic:(stage,type)=>console.info('Synthetic tenant stage',stage,'type',type),repository:new PostgresSaaSDataRepository(tenantOptions),platformDomainSuffix:scope.platformDomainSuffix,panelBaseUrl:scope.panelOrigin,adminOriginEnvironment:'staging_net'})),recovery:new PostgresTenantOperationRecovery(tenantOptions),panelOrigin:scope.panelOrigin,platformDomainSuffix:scope.platformDomainSuffix,clock:()=>new Date(),audit:()=>{}});
  const created=await completion.resumeTenantCreation(f.attemptId);assert.ok('result' in created,`synthetic tenant completion required: ${created.kind}:${created.error?.code??''}`);
  assert.equal((await reader.readStatus({digest:status.digest,scope,now:new Date()})).projection.stage,'checking_access');
  const jobs=new PostgresOnboardingJobRepository(deps);const current=new Date();const job=(await jobs.claim({scope,now:current,limit:25})).find(job=>job.attemptId===f.attemptId);assert.ok(job);
  await jobs.finish({scope,attemptId:f.attemptId,leaseToken:job.leaseToken,now:current,state:'ready',safeCode:'access_ready',snapshot:{attemptId:f.attemptId,storeId:created.result.store.id,checkedAt:current.toISOString(),state:'ready',safeCodes:['access_ready']}});
  const ready=await reader.readStatus({digest:status.digest,scope,now:new Date()});assert.equal(ready.projection.stage,'ready');assert.equal(ready.projection.storeSlug,created.result.store.slug);
  const cachedAt=new Date();assert.equal((await admin.query('SELECT saas.read_registration_callback_access_ready($1,$2,$3,$4,$5::timestamptz) AS ready',[stateDigester.digest(f.input.rawState),scope.ownerOrigin,scope.panelOrigin,scope.platformDomainSuffix,cachedAt.toISOString()])).rows[0].ready,true);
  assert.equal((await admin.query('SELECT saas.read_registration_callback_access_ready($1,$2,$3,$4,$5::timestamptz) AS ready',[stateDigester.digest(f.input.rawState),site.ownerOrigin,site.panelOrigin,site.platformDomainSuffix,new Date().toISOString()])).rows[0].ready,false);
  const cachedStarted=performance.now();const cachedReady=await reader.readCachedReady({rawState:f.input.rawState,scope,now:new Date()});console.info('QA bounded cached readiness',cachedReady,'elapsedMs',Math.round(performance.now()-cachedStarted));assert.equal(typeof cachedReady,'boolean');assert.equal(await reader.readCachedReady({rawState:f.input.rawState,scope:site,now:new Date()}),false);
  assert.equal((await admin.query("SELECT saas.registration_onboarding_status_projection($1,$2::timestamptz)->>'stage' AS stage",[f.attemptId,new Date(+current+300001)])).rows[0].stage,'checking_access');

  const c=await admin.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE celebix_saas_identity');await assert.rejects(()=>c.query('SELECT * FROM saas.registration_status_bindings'),{code:'42501'});}finally{await c.query('ROLLBACK');c.release();}
  await assert.rejects(()=>admin.query(sql('202609270168_registration_status_bindings.down.sql')),/STATUS_ROLLBACK_HAS_DURABLE_AUTHORITY/);await admin.query('ROLLBACK');
  // Synthetic-only timestamp edits exercise expiry without changing durable workflow data.
  await admin.query("UPDATE saas.registration_status_bindings SET issued_at=statement_timestamp()-interval '24 hours 1 second',expires_at=statement_timestamp()-interval '1 second' WHERE attempt_id=$1",[f.attemptId]);
  assert.equal((await reader.readStatus({digest:status.digest,scope,now:new Date()})).kind,'expired');assert.equal(await reader.cleanup(new Date(),1),0);
  await admin.query("UPDATE saas.registration_status_bindings SET issued_at=statement_timestamp()-interval '26 hours',expires_at=statement_timestamp()-interval '2 hours' WHERE attempt_id=$1",[f.attemptId]);
  assert.equal(await reader.cleanup(new Date(),1),1);assert.equal(Number((await admin.query('SELECT count(*) AS n FROM saas.registration_workflows WHERE attempt_id=$1',[f.attemptId])).rows[0].n),1);
  console.info('PG16 status PASS: atomic rollback, exact scope, repeated reads, expiry, restricted roles, guarded down and bounded digest-only cleanup');
 }finally{await admin.end();}
});
