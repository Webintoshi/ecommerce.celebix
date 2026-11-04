import {loyaltyExact,loyaltyInteger,loyaltyUuid,parseLoyaltyAdminPayload,parseLoyaltyAdminResult,parseLoyaltyCustomerPayload,parseLoyaltyCustomerResult,type LoyaltyAdminAction,type LoyaltyAdminPayloadMap,type LoyaltyAdminResultMap,type LoyaltyCustomerAction,type LoyaltyCustomerPayloadMap,type LoyaltyCustomerResultMap} from '@celebix/saas-contracts';
import {acquirePostgresClient,type PostgresClientLike,type PostgresPoolLike,type PostgresTimeoutOptions} from '../postgres/pool.ts';
import {atomicNativeWrite} from '../postgres/atomic-write.ts';
import {promotionAuthority} from '../promotions/validation.ts';
import {merchantAuthority} from '../orders/validation.ts';
import {OrderRepositoryError} from '../orders/errors.ts';
import {promotionRepositoryErrorCode} from '../promotions/errors.ts';
import {commerceCandidates,commerceDate,commerceHostname} from '../storefront-commerce/validation.ts';
import type {LoyaltyRepository,LoyaltyCustomerRepository,LoyaltyAdminCommandInput,LoyaltyCustomerCommandInput,PostgresLoyaltyRepositoryOptions,PostgresLoyaltyCustomerRepositoryOptions} from './types.ts';

export const LOYALTY_ERROR_CODES=['invalid_input','unauthenticated','membership_denied','durable_authority_invalid','store_inactive','feature_not_enabled','not_found','resource_not_found','version_conflict','operation_mismatch','idempotency_mismatch','invalid_reference','program_limit_reached','limit_exceeded','rate_limited','reward_unavailable','customer_approval_required','approval_invalid','conditions_not_met','invalid_transition','conflict','operation_result_invalid','unavailable'] as const;
export type LoyaltyErrorCode=typeof LOYALTY_ERROR_CODES[number];
export class LoyaltyRepositoryError extends Error{constructor(readonly code:LoyaltyErrorCode){super(code);this.name='LoyaltyRepositoryError';Object.freeze(this);}}
function fail(code:LoyaltyErrorCode='invalid_input'):never{throw new LoyaltyRepositoryError(code);}
function known(error:unknown):LoyaltyRepositoryError{if(error instanceof LoyaltyRepositoryError)return error;const code=error instanceof OrderRepositoryError?error.code:promotionRepositoryErrorCode(error);return new LoyaltyRepositoryError(code&&(LOYALTY_ERROR_CODES as readonly string[]).includes(code)?code as LoyaltyErrorCode:'invalid_input');}
function options(value:unknown,role:'celebix_saas_app'|'celebix_saas_host_resolver'):{pool:PostgresPoolLike;role:typeof role;timeouts:PostgresTimeoutOptions}{
 try{const x=loyaltyExact(value,['pool','role','timeouts']),t=loyaltyExact(x.timeouts,['poolCheckoutMs','statementMs','lockMs','idleTransactionMs']);if(x.role!==role||typeof(x.pool as PostgresPoolLike)?.connect!=='function')fail();return Object.freeze({pool:x.pool as PostgresPoolLike,role,timeouts:Object.freeze({poolCheckoutMs:loyaltyInteger(t.poolCheckoutMs,1,60_000),statementMs:loyaltyInteger(t.statementMs,1,60_000),lockMs:loyaltyInteger(t.lockMs,1,60_000),idleTransactionMs:loyaltyInteger(t.idleTransactionMs,1,60_000)})});}catch{fail();}
}
type Options=ReturnType<typeof options>;
function release(client:PostgresClientLike,destroy=false){try{client.release(destroy||undefined);}catch{/* Connection is terminal. */}}
async function readNative<T>(o:Options,pool:PostgresPoolLike,sql:string,values:unknown[],parse:(v:unknown)=>T,recovery=false):Promise<T|null>{
 let client:PostgresClientLike;try{client=await acquirePostgresClient(pool,o.timeouts.poolCheckoutMs);}catch{fail('unavailable');}
 let began=false,terminal=false;
 try{
  await client.query('BEGIN READ ONLY');began=true;
  for(const [setting,key]of [['statement_timeout','statementMs'],['lock_timeout','lockMs'],['idle_in_transaction_session_timeout','idleTransactionMs']] as const)await client.query(`SELECT pg_catalog.set_config('${setting}', $1, true)`,[`${o.timeouts[key]}ms`]);
  await client.query(o.role==='celebix_saas_app'?'SET LOCAL ROLE celebix_saas_app':'SET LOCAL ROLE celebix_saas_host_resolver');
  const selected=await client.query(sql,values);if(selected.rowCount!==1||selected.rows.length!==1)fail('unavailable');const row=loyaltyExact(selected.rows[0],['outcome','result_payload']);
  if(row.outcome==='not_found'&&recovery&&row.result_payload===null){await client.query('COMMIT');terminal=true;release(client);return null;}
  if((LOYALTY_ERROR_CODES as readonly unknown[]).includes(row.outcome))fail(row.outcome as LoyaltyErrorCode);
  if(!['found','committed','operation_replayed'].includes(row.outcome as string))fail('unavailable');
  let value:T;try{value=parse(row.result_payload);}catch{fail('unavailable');}
  await client.query('COMMIT');terminal=true;release(client);return value;
 }catch(error){if(!terminal){if(began)try{await client.query('ROLLBACK');}catch{release(client,true);throw error instanceof LoyaltyRepositoryError?error:new LoyaltyRepositoryError('unavailable');}release(client);}throw error instanceof LoyaltyRepositoryError?error:new LoyaltyRepositoryError('unavailable');}
}
async function execute<T>(o:Options,sql:string,values:unknown[],parse:(v:unknown)=>T,write:boolean,recoveryValues:unknown[]):Promise<T>{
 if(!write)return (await readNative(o,o.pool,sql,values,parse))!;
 try{return await atomicNativeWrite({pool:o.pool,poolCheckoutMs:o.timeouts.poolCheckoutMs,onUnknown(){},async recover(observed){const recovered=await readNative(o,o.pool,sql,recoveryValues,parse,true);if(recovered===null||JSON.stringify(recovered)!==JSON.stringify(observed))fail('unavailable');return recovered;}},async pool=>(await readNative(o,pool,sql,values,parse))!);}catch(error){throw error instanceof LoyaltyRepositoryError?error:new LoyaltyRepositoryError('unavailable');}
}
const ADMIN_SQL='SELECT outcome,result_payload FROM saas.loyalty_admin_command_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::uuid,$10::jsonb)';
const CUSTOMER_SQL='SELECT outcome,result_payload FROM saas.loyalty_customer_command_v1($1::text,$2::timestamptz,$3::jsonb,$4::text,$5::uuid,$6::jsonb)';
function adminRead(action:LoyaltyAdminAction){return action==='list'||action==='report';}
function posAction(action:LoyaltyAdminAction){return action==='approve-pos'||action==='prepare-pos-reward';}
function bindAdmin<A extends LoyaltyAdminAction>(action:A,payload:LoyaltyAdminPayloadMap[A],operation:string|null,value:LoyaltyAdminResultMap[A]):LoyaltyAdminResultMap[A]{
 const p=payload as Record<string,unknown>,v=value as unknown as Record<string,unknown>;
 if(operation!==null&&action!=='prepare-pos-reward'&&v.operationId!==operation)fail('unavailable');
 if(action==='prepare-pos-reward'&&(v.sale as {id?:unknown})?.id!==p.saleId)fail('unavailable');
 if(action==='report'&&(v.program as {id?:unknown})?.id!==p.programId)fail('unavailable');
 if(action==='adjust'&&(v.customerId!==p.customerId||v.programId!==p.programId))fail('unavailable');
 if(['save','pause'].includes(action)&&p.programId!==undefined&&(v.program as {id?:unknown})?.id!==p.programId)fail('unavailable');
 if(action==='duplicate'&&(v.program as {id?:unknown})?.id===p.programId)fail('unavailable');
 return value;
}
export class PostgresLoyaltyRepository implements LoyaltyRepository{
 private readonly options:Options;
 constructor(value:PostgresLoyaltyRepositoryOptions){this.options=options(value,'celebix_saas_app');}
 private validated<A extends LoyaltyAdminAction>(input:LoyaltyAdminCommandInput<A>){try{const x=loyaltyExact(input,['tenantContext','now','action','payload'],['operationId']),action=x.action as A,payload=parseLoyaltyAdminPayload(action,x.payload),context=x.tenantContext as LoyaltyAdminCommandInput<A>['tenantContext'],a=posAction(action)?merchantAuthority(context,x.now as Date,'promotions'):promotionAuthority(context,x.now as Date,adminRead(action)?'read':'publish'),operation=adminRead(action)?null:loyaltyUuid(x.operationId);if(posAction(action)&&!['store_owner','admin','cashier'].includes(context.membership.role))fail('membership_denied');return{a,action,payload,operation,values:[a.storeId,a.principalId,a.membershipId,a.planId,a.planCode,a.planVersion,a.now,action,operation,JSON.stringify(payload)]};}catch(error){throw known(error);}}
 async command<A extends LoyaltyAdminAction>(input:LoyaltyAdminCommandInput<A>):Promise<LoyaltyAdminResultMap[A]>{const v=this.validated(input),parse=(x:unknown)=>bindAdmin(v.action,v.payload,v.operation,parseLoyaltyAdminResult(v.action,x)),recover=[...v.values];recover[7]='recover';recover[9]=JSON.stringify({action:v.action,payload:v.payload});return execute(this.options,ADMIN_SQL,v.values,parse,!adminRead(v.action),recover);}
 async recover<A extends LoyaltyAdminAction>(input:LoyaltyAdminCommandInput<A>&Readonly<{operationId:string}>):Promise<LoyaltyAdminResultMap[A]|null>{const v=this.validated(input);if(adminRead(v.action))fail();v.values[7]='recover';v.values[9]=JSON.stringify({action:v.action,payload:v.payload});return readNative(this.options,this.options.pool,ADMIN_SQL,v.values,x=>bindAdmin(v.action,v.payload,v.operation,parseLoyaltyAdminResult(v.action,x)),true);}
}
export class PostgresLoyaltyCustomerRepository implements LoyaltyCustomerRepository{
 private readonly options:Options;
 constructor(value:PostgresLoyaltyCustomerRepositoryOptions){this.options=options(value,'celebix_saas_host_resolver');}
 private validated<A extends LoyaltyCustomerAction>(input:LoyaltyCustomerCommandInput<A>){try{const x=loyaltyExact(input,['hostname','now','candidates','action','payload'],['operationId']),action=x.action as A,payload=parseLoyaltyCustomerPayload(action,x.payload),hostname=commerceHostname(x.hostname),now=commerceDate(x.now),candidates=commerceCandidates(x.candidates,false);if(candidates.length===0)fail('unauthenticated');const operation=action==='list'?null:loyaltyUuid(x.operationId);return{action,payload,operation,values:[hostname,now,JSON.stringify(candidates),action,operation,JSON.stringify(payload)]};}catch(error){throw known(error);}}
 private parse<A extends LoyaltyCustomerAction>(action:A,payload:LoyaltyCustomerPayloadMap[A],operation:string|null,value:unknown):LoyaltyCustomerResultMap[A]{const result=parseLoyaltyCustomerResult(action,value),v=result as unknown as Record<string,unknown>;if(operation!==null&&v.operationId!==operation||action==='prepare-reward'&&v.rewardId!==(payload as {rewardId:string}).rewardId)fail('unavailable');return result;}
 async command<A extends LoyaltyCustomerAction>(input:LoyaltyCustomerCommandInput<A>):Promise<LoyaltyCustomerResultMap[A]>{const v=this.validated(input),recover=[...v.values];recover[3]='recover';recover[5]=JSON.stringify({action:v.action,payload:v.payload});return execute(this.options,CUSTOMER_SQL,v.values,x=>this.parse(v.action,v.payload,v.operation,x),v.action!=='list',recover);}
 async recover<A extends LoyaltyCustomerAction>(input:LoyaltyCustomerCommandInput<A>&Readonly<{operationId:string}>):Promise<LoyaltyCustomerResultMap[A]|null>{const v=this.validated(input);if(v.action==='list')fail();v.values[3]='recover';v.values[5]=JSON.stringify({action:v.action,payload:v.payload});return readNative(this.options,this.options.pool,CUSTOMER_SQL,v.values,x=>this.parse(v.action,v.payload,v.operation,x),true);}
}
