import 'server-only';
import pg from 'pg';
import {parseOwnerStagingAuthConfig,createOwnerStagingDatabasePoolConfig} from '../self-serve-auth-authority/config.ts';
import {createAes256GcmPayloadCipher,createOpaqueStateDigester} from '../saas-persistence/identity-crypto.ts';
import {PostgresRegistrationAttemptStore} from '../saas-persistence/postgres-registration-attempt-store.ts';
import {PostgresOnboardingJobRepository} from '../onboarding-jobs/postgres-repository.ts';
import {createOnboardingAudit} from '../onboarding-jobs/audit.ts';
import {createOnboardingOperationsService,type OnboardingOperationsService} from './service.ts';
let cached:Promise<OnboardingOperationsService>|undefined;
let retryAfter=0;
export function configuredOperationsOrigin():string|null{try{return parseOwnerStagingAuthConfig(process.env).authority.ownerOrigin;}catch{return null;}}
async function initialize():Promise<OnboardingOperationsService>{
 const config=parseOwnerStagingAuthConfig(process.env);
 const timeouts={poolCheckoutMs:2000,statementMs:5000,lockMs:5000,idleTransactionMs:5000};
 const pool=new pg.Pool({...createOwnerStagingDatabasePoolConfig(config.database),max:2,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,statement_timeout:5000,lock_timeout:5000,idle_in_transaction_session_timeout:5000,application_name:'celebix-onboarding-operations'});
 pool.on('error',()=>undefined);
 try{
  const row=(await pool.query("SELECT current_database() AS database,current_setting('server_version_num')::integer/10000 AS major,r.rolsuper AS superuser,pg_has_role(current_user,'celebix_saas_identity','MEMBER') AS identity_member,to_regprocedure('saas.retry_registration_onboarding_job(text,text,text,text,bigint,timestamptz)') IS NOT NULL AS retry FROM pg_roles r WHERE r.rolname=current_user")).rows[0];
  if(!row||row.database!==config.database.name||row.major!==16||row.superuser!==false||row.identity_member!==true||row.retry!==true)throw new Error('onboarding_operations_preflight_failed');
  const dependencies={pool,timeouts,clock:()=>new Date(),audit:()=>undefined,identityRole:'celebix_saas_identity' as const,stateDigester:createOpaqueStateDigester({key:config.keys.identityHmac,context:'registration-attempt-state'}),payloadCipher:createAes256GcmPayloadCipher({currentKeyId:config.keys.identityEncryptionKeyId,resolveKey:(id:string)=>id===config.keys.identityEncryptionKeyId?config.keys.identityEncryption:undefined})};
  const repository=new PostgresOnboardingJobRepository(dependencies);
  const store=new PostgresRegistrationAttemptStore(dependencies,{panelOrigin:config.authority.panelOrigin,platformDomainSuffix:config.authority.platformDomainSuffix});
  return createOnboardingOperationsService({scope:config.authority,repository,isCompletionActive:id=>store.isTenantCompletionActive(id),audit:createOnboardingAudit({key:config.keys.identityHmac,write:event=>console.info(JSON.stringify(event))})});
 }catch(error){await pool.end().catch(()=>undefined);throw error;}
}
export async function resolveDefaultOnboardingOperations():Promise<OnboardingOperationsService|null>{
 if(process.env.CELEBIX_ONBOARDING_WORKER_ENABLED!=='true'||Date.now()<retryAfter)return null;
 try{cached??=initialize();return await cached;}catch{cached=undefined;retryAfter=Date.now()+15000;return null;}
}
