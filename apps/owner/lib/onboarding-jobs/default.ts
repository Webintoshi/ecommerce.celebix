import {randomUUID} from 'node:crypto';
import type {CreateStarterTenantResult} from '@celebix/saas-contracts';
import pg from 'pg';
import {adminOriginEnvironmentFromPanelOrigin,createCanonicalAdminOriginFromPanelOrigin,PostgresSaaSDataRepository,PostgresTenantOperationRecovery} from '@celebix/saas-data';
import {createStarterTenantService} from '@celebix/saas-tenant-core';
import {createAes256GcmPayloadCipher,createOpaqueStateDigester} from '../saas-persistence/identity-crypto.ts';
import {PostgresRegistrationAttemptStore} from '../saas-persistence/postgres-registration-attempt-store.ts';
import {createOwnerTenantCoreAdapter} from '../saas-tenant-core/adapter.ts';
import {createPersistentRegistrationCompletionService,createPersistentRegistrationRecoveryService,type PersistentRegistrationCompletionService,type PersistentRegistrationRecoveryPort,type ResumeTenantResult} from '../self-serve-registration-completion.ts';
import {createOwnerStagingDatabasePoolConfig,parseOwnerStagingAuthConfig,OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS} from '../self-serve-auth-authority/config.ts';
import {PostgresOnboardingJobRepository} from './postgres-repository.ts';
import {PostgresOnboardingStatusRepository} from '../self-serve-status/postgres-repository.ts';
import {createBoundedPlatformGet,probeTenantAccess} from './access-probe.ts';
import {runOnboardingTick,type CompletionOutcome,type OnboardingTickDependencies} from './worker.ts';
import {normalizeOnboardingScope,type RegistrationAuthorityScope} from './types.ts';
import {createOnboardingAudit,createRegistrationCompletionAudit} from './audit.ts';
type CompletionPort=Pick<PersistentRegistrationCompletionService,'resumeTenantCreation'|'reconcileUnknownCommit'>;
function mapResume(result:ResumeTenantResult):CompletionOutcome{
 if('result' in result)return {kind:'completed',result:result.result};
 if(result.kind==='rejected')return {kind:result.error.code==='registration_workflow_conflict'?'pending':result.error.retryable?'retry':'attention_required'};
 return {kind:'pending'};
}
export async function completeOnboardingAttempt(attemptId:string,completion:CompletionPort,recovery:PersistentRegistrationRecoveryPort):Promise<CompletionOutcome>{
 const resumed=await completion.resumeTenantCreation(attemptId);
 if(['commit_unknown','reconciliation_required','completion_state_unknown'].includes(resumed.kind)){
  const reconciled=await completion.reconcileUnknownCommit(attemptId);
  if(reconciled.kind==='tenant_recovered')return {kind:'completed',result:reconciled.result};
  if(reconciled.kind==='recovery_absent')return mapResume(await recovery.resumeRecoveredTenantCreation(attemptId));
  if(reconciled.kind==='failed')return {kind:'attention_required'};
  if(reconciled.kind==='rejected')return {kind:reconciled.error.code==='registration_workflow_conflict'?'pending':reconciled.error.retryable?'retry':'attention_required'};
  return {kind:'pending'};
 }
 return mapResume(resumed);
}
export function createDefaultOnboardingWorker(input:Omit<OnboardingTickDependencies,'complete'> & {scope:RegistrationAuthorityScope;completion:CompletionPort;recovery:PersistentRegistrationRecoveryPort;readCompletedTenant?:(attemptId:string)=>Promise<CreateStarterTenantResult|undefined>;cleanup?:()=>Promise<void>;diagnostic?:(code:string)=>void}){
 const scope=normalizeOnboardingScope(input.scope);const clock=input.clock??(()=>new Date());
 return {async tick(){
  const counts=await runOnboardingTick({scope,now:clock()},{...input,clock,complete:async attempt=>{const result=await input.readCompletedTenant?.(attempt);return result?{kind:'completed',result}:completeOnboardingAttempt(attempt,input.completion,input.recovery);}});
  try{await input.cleanup?.();}catch{try{input.diagnostic?.('onboarding_housekeeping_unavailable');}catch{/* Diagnostics never change the durable outcome. */}}
  return counts;
 }};
}
export async function initializeDefaultOnboardingWorker(source:Record<string,string|undefined>){
 const config=parseOwnerStagingAuthConfig(Object.fromEntries(OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS.map(name=>[name,source[name]])));
 const addresses=source.CELEBIX_ONBOARDING_EDGE_ADDRESSES?.split(',');
 if(!addresses?.length||addresses.some(value=>value.trim()!==value))throw new Error('onboarding_edge_allowlist_required');
 // Validate network policy before any database work. Exact tenant hosts are added per proven result.
 createBoundedPlatformGet({allowedHosts:[],allowedAddresses:addresses});
 const pool=new pg.Pool({...createOwnerStagingDatabasePoolConfig(config.database),max:6,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,statement_timeout:5000,lock_timeout:5000,idle_in_transaction_session_timeout:5000,application_name:'celebix-onboarding-worker'});
 pool.on('error',()=>undefined);
 const timeouts={poolCheckoutMs:2000,statementMs:5000,lockMs:5000,idleTransactionMs:5000};const clock=()=>new Date();
 try{
  const preflight=await pool.query(`SELECT current_setting('server_version_num')::integer/10000 AS major,current_database() AS database,
  r.rolsuper AS superuser,pg_has_role(current_user,'celebix_saas_identity','MEMBER') AS identity_member,
  pg_has_role(current_user,'celebix_saas_bootstrap','MEMBER') AS bootstrap_member,
  to_regprocedure('saas.claim_registration_onboarding_jobs(text,text,text,timestamp with time zone,integer)') IS NOT NULL AS jobs
  FROM pg_roles r WHERE r.rolname=current_user`);
  const row=preflight.rows[0];if(!row||row.major!==16||row.database!==config.database.name||row.superuser!==false||row.identity_member!==true||row.bootstrap_member!==true||row.jobs!==true)throw new Error('onboarding_preflight_failed');
  const identity={pool,timeouts,clock,audit:()=>undefined,identityRole:'celebix_saas_identity' as const,
   stateDigester:createOpaqueStateDigester({key:config.keys.identityHmac,context:'registration-attempt-state'}),
   payloadCipher:createAes256GcmPayloadCipher({currentKeyId:config.keys.identityEncryptionKeyId,resolveKey:key=>key===config.keys.identityEncryptionKeyId?config.keys.identityEncryption:undefined})};
  const scope=normalizeOnboardingScope(config.authority);
  const store=new PostgresRegistrationAttemptStore(identity,{panelOrigin:scope.panelOrigin,platformDomainSuffix:scope.platformDomainSuffix},undefined,scope);
  const repository=new PostgresOnboardingJobRepository(identity);
  const adminOriginEnvironment=adminOriginEnvironmentFromPanelOrigin(scope.panelOrigin);
  const options={pool,generateId:()=>randomUUID(),audit:()=>undefined,timeouts,bootstrapRole:'celebix_saas_bootstrap' as const,panelOrigin:scope.panelOrigin,adminOriginEnvironment};
  const writeAudit=(event:Readonly<Record<string,string|number>>)=>console.info(JSON.stringify(event));
  const completionDependencies={workflowStore:store,tenantCore:createOwnerTenantCoreAdapter(createStarterTenantService({repository:new PostgresSaaSDataRepository(options),platformDomainSuffix:scope.platformDomainSuffix,panelBaseUrl:scope.panelOrigin,adminOriginEnvironment})),recovery:new PostgresTenantOperationRecovery(options),panelOrigin:scope.panelOrigin,platformDomainSuffix:scope.platformDomainSuffix,clock,audit:createRegistrationCompletionAudit(writeAudit)};
  const statusRepository=new PostgresOnboardingStatusRepository(identity);
  const worker=createDefaultOnboardingWorker({scope,repository,clock,audit:createOnboardingAudit({key:config.keys.identityHmac,write:writeAudit}),cleanup:source.CELEBIX_ONBOARDING_STATUS_ENABLED==='true'?async()=>{await statusRepository.cleanup(clock(),100);}:undefined,diagnostic:code=>console.error(code),readCompletedTenant:attemptId=>repository.readCompletedTenant(scope,attemptId),completion:createPersistentRegistrationCompletionService(completionDependencies),recovery:createPersistentRegistrationRecoveryService(completionDependencies),
   probe:(authority,result,attemptId)=>probeTenantAccess(authority,result,{attemptId,now:clock(),verifyProof:proof=>repository.verifyTenantProof(proof.scope,proof.attemptId,proof.storeId,proof.adminHost,proof.storefrontHost,proof.now),get:createBoundedPlatformGet({allowedHosts:[new URL(scope.panelOrigin).hostname,new URL(createCanonicalAdminOriginFromPanelOrigin(scope.panelOrigin,result.store.slug)).hostname,`${result.store.slug}.${scope.platformDomainSuffix}`],allowedAddresses:addresses})})});
  return {...worker,heartbeat:()=>repository.heartbeat(scope,clock()),close:()=>pool.end()};
 }catch(error){await pool.end().catch(()=>undefined);throw error;}
}
