import type {CreateStarterTenantResult} from '@celebix/saas-contracts';
import { withIdentityTransaction, type IdentityPostgresClient, type IdentityStoreDependencies } from '../saas-persistence/postgres-identity-common.ts';
import { normalizeOnboardingScope, SAFE_CODES, type RegistrationAuthorityScope, type OnboardingAccessSnapshot, type OnboardingJobRepository, type FinishOnboardingJob, type OnboardingSafeCode } from './types.ts';
function args(scope:RegistrationAuthorityScope){const s=normalizeOnboardingScope(scope);return [s.ownerOrigin,s.panelOrigin,s.platformDomainSuffix];}
function timestamp(value:unknown){if(value instanceof Date)return value.toISOString();if(typeof value==='string'&&Number.isFinite(Date.parse(value)))return new Date(value).toISOString();throw new Error('onboarding_persistence_invalid');}
export async function bindOriginalRegistrationScope(client:Pick<IdentityPostgresClient,'query'>,attemptId:string,scope:RegistrationAuthorityScope,createdAt:string):Promise<void>{
 await client.query('SELECT saas.bind_registration_onboarding_scope($1,$2,$3,$4,$5::timestamptz)',[attemptId,...args(scope),createdAt]);
}
export class PostgresOnboardingJobRepository implements OnboardingJobRepository {
 private readonly dependencies:IdentityStoreDependencies;
 constructor(dependencies:IdentityStoreDependencies){
  if(Object.values(dependencies.timeouts).some(n=>!Number.isInteger(n)||n<1||n>5000))throw new Error('onboarding_timeout_invalid');
  this.dependencies=dependencies;
 }
 async claim(input:{scope:RegistrationAuthorityScope;now:Date;limit:number}){
  return withIdentityTransaction(this.dependencies,'registration',async client=>{
   await client.query('SELECT saas.backfill_registration_onboarding_jobs($1,$2,$3,$4::timestamptz,$5)',[...args(input.scope),input.now.toISOString(),input.limit]);
   const result=await client.query('SELECT * FROM saas.claim_registration_onboarding_jobs($1,$2,$3,$4::timestamptz,$5)',[...args(input.scope),input.now.toISOString(),input.limit]);
   return result.rows.map(row=>({attemptId:String(row.attempt_id),leaseToken:String(row.lease_token),failureCount:Number(row.failure_count),createdAt:timestamp(row.created_at)}));
  });
 }
 async finish(input:FinishOnboardingJob){
  if(!SAFE_CODES.includes(input.safeCode)||input.snapshot&&(input.snapshot.attemptId!==input.attemptId||input.snapshot.safeCodes.some(code=>!SAFE_CODES.includes(code))))throw new Error('onboarding_snapshot_invalid');
  return withIdentityTransaction(this.dependencies,'registration',async client=>{
   const result=await client.query('SELECT saas.finish_registration_onboarding_job($1,$2,$3,$4,$5::uuid,$6::timestamptz,$7,$8,$9::uuid,$10::timestamptz,$11) AS applied',[input.attemptId,...args(input.scope),input.leaseToken,input.now.toISOString(),input.state,input.safeCode,input.snapshot?.storeId??null,input.snapshot?.checkedAt??null,input.snapshot?.state??null]);
   return result.rows[0]?.applied===true;
  });
 }
 async heartbeat(scope:RegistrationAuthorityScope,now:Date){await withIdentityTransaction(this.dependencies,'registration',async client=>{await client.query('SELECT saas.touch_registration_onboarding_heartbeat($1,$2,$3,$4::timestamptz)',[...args(scope),now.toISOString()]);});}
 async readSnapshot(input:{scope:RegistrationAuthorityScope;attemptId:string;storeId?:string;now:Date}):Promise<OnboardingAccessSnapshot|undefined>{
  return withIdentityTransaction(this.dependencies,'registration',async client=>{
   const result=await client.query('SELECT * FROM saas.read_registration_onboarding_access($1,$2,$3,$4,$5::timestamptz,$6::uuid)',[input.attemptId,...args(input.scope),input.now.toISOString(),input.storeId??null]);
   const row=result.rows[0];if(!row)return undefined;
   if(!['ready','pending','unavailable'].includes(String(row.state))||!SAFE_CODES.includes(row.safe_code as OnboardingSafeCode))throw new Error('onboarding_snapshot_invalid');
   return {attemptId:String(row.attempt_id),storeId:String(row.store_id),checkedAt:timestamp(row.checked_at),state:row.state as OnboardingAccessSnapshot['state'],safeCodes:[row.safe_code as OnboardingSafeCode]};
  });
 }
 async readCompletedTenant(scope:RegistrationAuthorityScope,attemptId:string):Promise<CreateStarterTenantResult|undefined>{
  return withIdentityTransaction(this.dependencies,'registration',async client=>{
   const result=(await client.query('SELECT saas.read_registration_onboarding_tenant($1,$2,$3,$4) AS result',[attemptId,...args(scope)])).rows[0]?.result;
   if(result===null||result===undefined)return undefined;
   if(typeof result!=='object'||(result as CreateStarterTenantResult).schemaVersion!==1||(result as CreateStarterTenantResult).provisioningStatus!=='ready')throw new Error('onboarding_committed_result_invalid');
   return result as CreateStarterTenantResult;
  });
 }
 async readHealth(scope:RegistrationAuthorityScope,now:Date){return withIdentityTransaction(this.dependencies,'registration',async client=>(await client.query('SELECT saas.read_registration_onboarding_health($1,$2,$3,$4::timestamptz) AS health',[...args(scope),now.toISOString()])).rows[0]?.health);}
 async verifyTenantProof(scope:RegistrationAuthorityScope,attemptId:string,storeId:string,adminHost:string,storefrontHost:string,now:Date):Promise<boolean>{
  return withIdentityTransaction(this.dependencies,'registration',async client=>(await client.query('SELECT saas.verify_registration_onboarding_access_proof($1,$2,$3,$4,$5::uuid,$6,$7,$8::timestamptz) AS valid',[attemptId,...args(scope),storeId,adminHost,storefrontHost,now.toISOString()])).rows[0]?.valid===true);
 }
}
