import {withIdentityTransaction,type IdentityStoreDependencies} from "../saas-persistence/postgres-identity-common.ts";
import {normalizeOnboardingScope,type RegistrationAuthorityScope} from "../onboarding-jobs/types.ts";
import {parseStatusProjection} from "./presentation.ts";
import type {OnboardingStatusRead,OnboardingStatusReader} from "./types.ts";
function scopeArgs(scope:RegistrationAuthorityScope){const s=normalizeOnboardingScope(scope);return [s.ownerOrigin,s.panelOrigin,s.platformDomainSuffix];}
export class PostgresOnboardingStatusRepository implements OnboardingStatusReader {
 constructor(private readonly dependencies:IdentityStoreDependencies) {}
 async readStatus(input:{digest:string;scope:RegistrationAuthorityScope;now:Date}):Promise<OnboardingStatusRead>{
  if(!/^[a-f0-9]{64}$/.test(input.digest))return {kind:"unauthorized"};
  try{return await withIdentityTransaction(this.dependencies,"registration",async client=>{
   const result=await client.query("SELECT outcome,authority FROM saas.read_registration_status($1,$2,$3,$4,$5::timestamptz)",[input.digest,...scopeArgs(input.scope),input.now.toISOString()]);
   if(result.rows.length!==1)throw new Error("onboarding_status_read_invalid");const row=result.rows[0];
   if(row.outcome==="status")return {kind:"status",projection:parseStatusProjection(row.authority)};
   if((row.outcome==="expired"||row.outcome==="unauthorized")&&row.authority===null)return {kind:row.outcome};
   throw new Error("onboarding_status_read_invalid");
  });}catch{return {kind:"unavailable"};}
 }
 async readCachedReady(input:{rawState:string;scope:RegistrationAuthorityScope;now:Date}):Promise<boolean>{
  const digest=this.dependencies.stateDigester.digest(input.rawState);if(!/^[a-f0-9]{64}$/.test(digest))return false;
  // Separate bounded read connection: a timed-out cache read eventually rolls back/releases itself.
  const deps={...this.dependencies,timeouts:{poolCheckoutMs:50,statementMs:50,lockMs:50,idleTransactionMs:100}};
  try{return await withIdentityTransaction(deps,"registration",async client=>(await client.query("SELECT saas.read_registration_callback_access_ready($1,$2,$3,$4,$5::timestamptz) AS ready",[digest,...scopeArgs(input.scope),input.now.toISOString()])).rows[0]?.ready===true);}catch{return false;}
 }
 async cleanup(now:Date,limit:number):Promise<number>{
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error("onboarding_status_cleanup_invalid");
  return withIdentityTransaction(this.dependencies,"cleanup",async client=>Number((await client.query("SELECT saas.cleanup_registration_status_bindings($1::timestamptz,$2) AS count",[now.toISOString(),limit])).rows[0]?.count??0));
 }
}
