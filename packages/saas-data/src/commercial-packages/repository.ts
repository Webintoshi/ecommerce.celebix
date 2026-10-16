import {COMMERCIAL_PACKAGES,getCommercialPackage,parseCommercialPlanOverview,parseCommercialUpgradeIntent,parseCommercialUpgradeRequest,type CommercialPlanOverview,type CommercialUpgradeIntent,type CommercialUpgradeRequest,type TenantContext} from '@celebix/saas-contracts';
import {merchantAuthority,type ValidatedOrderAuthority} from '../orders/validation.ts';
import {acquirePostgresClient,type PostgresPoolLike,type PostgresTimeoutOptions} from '../postgres/pool.ts';

export type CommercialPlanAuthority=Readonly<{tenantContext:TenantContext;now:Date}>;
export interface CommercialPlanRepository{
 read(input:CommercialPlanAuthority):Promise<CommercialPlanOverview>;
 request(input:CommercialPlanAuthority&Readonly<{intent:CommercialUpgradeIntent}>):Promise<CommercialUpgradeRequest>;
}
const CODES=['invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','version_conflict','operation_mismatch','unavailable','commit_unknown'] as const;
export class CommercialPlanRepositoryError extends Error{
 constructor(readonly code:typeof CODES[number]){super(code);this.name='CommercialPlanRepositoryError';}
}
function fail(code:typeof CODES[number]='unavailable'):never{throw new CommercialPlanRepositoryError(code);}
const CASTS=['uuid','uuid','uuid','uuid','text','bigint','timestamptz'];
export class PostgresCommercialPlanRepository implements CommercialPlanRepository{
 constructor(private readonly options:Readonly<{pool:PostgresPoolLike;role:'celebix_saas_app';timeouts:PostgresTimeoutOptions}>){
  if(options.role!=='celebix_saas_app'||!options.pool||Object.values(options.timeouts).some(v=>!Number.isSafeInteger(v)||v<1||v>60_000))throw TypeError('commercial_plan_runtime_invalid');
 }
 private authority(input:CommercialPlanAuthority,write=false):ValidatedOrderAuthority{
  try{
   const keys=Object.keys(input),allowed=write?['tenantContext','now','intent']:['tenantContext','now'];
   if(keys.length!==allowed.length||keys.some(k=>!allowed.includes(k)))fail('invalid_input');
   if(write&&input.tenantContext.membership.role!=='store_owner')fail('membership_denied');
   return merchantAuthority(input.tenantContext,input.now,'orders');
  }catch(error){if(error instanceof CommercialPlanRepositoryError)throw error;fail('invalid_input');}
 }
 private async execute<T>(a:ValidatedOrderAuthority,name:'commercial_plan_read'|'commercial_upgrade_request',args:unknown[],parse:(value:unknown)=>T):Promise<T>{
  const write=name==='commercial_upgrade_request';let client;
  try{client=await acquirePostgresClient(this.options.pool,this.options.timeouts.poolCheckoutMs);}catch{fail();}
  let began=false,terminal=false;
  try{
   await client.query(write?'BEGIN ISOLATION LEVEL READ COMMITTED':'BEGIN READ ONLY');began=true;
   for(const [name,ms]of [['statement_timeout',this.options.timeouts.statementMs],['lock_timeout',this.options.timeouts.lockMs],['idle_in_transaction_session_timeout',this.options.timeouts.idleTransactionMs]]as const)await client.query(`SELECT pg_catalog.set_config('${name}', $1, true)`,[`${ms}ms`]);
   await client.query('SET LOCAL ROLE celebix_saas_app');
   const casts=[...CASTS,...write?['uuid','text']:[]];
   const result=await client.query(`SELECT saas.${name}(${casts.map((cast,i)=>`$${i+1}::${cast}`).join(',')}) AS result`,[a.storeId,a.principalId,a.membershipId,a.planId,a.planCode,a.planVersion,a.now,...args]);
   if(result.rows.length!==1||Object.keys(result.rows[0]!).join()!=='result')fail();
   const raw=result.rows[0]!.result;
   if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).join()==='code'){
    const code=(raw as {code:unknown}).code;if((CODES as readonly unknown[]).includes(code))fail(code as typeof CODES[number]);fail();
   }
   let value:T;try{value=parse(raw);}catch(error){if(error instanceof CommercialPlanRepositoryError)throw error;fail();}
   try{await client.query('COMMIT');}catch{terminal=true;client.release(true);fail(write?'commit_unknown':'unavailable');}
   terminal=true;client.release();return value;
  }catch(error){
   if(!terminal){try{if(began)await client.query('ROLLBACK');client.release();}catch{client.release(true);}}
   if(error instanceof CommercialPlanRepositoryError)throw error;fail();
  }
 }
 async read(input:CommercialPlanAuthority):Promise<CommercialPlanOverview>{
  const a=this.authority(input);return this.execute(a,'commercial_plan_read',[],raw=>{
   const result=parseCommercialPlanOverview(raw);
   if(result.plan.planId!==a.planId||result.plan.planCode!==a.planCode||result.plan.version!==a.planVersion||result.request&&result.request.storeId!==a.storeId)fail();
   return result;
  });
 }
 async request(input:CommercialPlanAuthority&Readonly<{intent:CommercialUpgradeIntent}>):Promise<CommercialUpgradeRequest>{
  const a=this.authority(input,true);let intent;
  try{intent=parseCommercialUpgradeIntent(input.intent);}catch{fail('invalid_input');}
  const current=getCommercialPackage(input.tenantContext.entitlements),target=COMMERCIAL_PACKAGES.find(p=>p.id===intent.planId)!;
  if(current&&target.monthlyPriceCents<=current.monthlyPriceCents)fail('invalid_input');
  return this.execute(a,'commercial_upgrade_request',[intent.planId,intent.operationId],raw=>{
   const result=parseCommercialUpgradeRequest(raw);
   if(result.storeId!==a.storeId||result.planId!==intent.planId||typeof result.replayed!=='boolean')fail();
   return result;
  });
 }
}
