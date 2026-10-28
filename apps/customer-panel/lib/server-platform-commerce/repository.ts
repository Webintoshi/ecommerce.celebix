import 'server-only';
import {createHash,createHmac} from 'node:crypto';
import {COMMERCIAL_PACKAGES,STORE_TOOL_OFFERS,TOSHI_CREDIT_OFFERS,commercialUuid,type TenantContext} from '@celebix/saas-contracts';
import {merchantAuthority} from '../../../../packages/saas-data/src/orders/validation.ts';
import {acquirePostgresClient,type PostgresPoolLike,type PostgresTimeoutOptions} from '../../../../packages/saas-data/src/postgres/pool.ts';

export type PlatformCheckoutIntent=Readonly<{kind:'package'|'tool'|'toshi_credit';offerId:string;term:'monthly'|'annual'|'once';operationId:string}>;
export type PlatformCheckoutHandoff=Readonly<{orderId:string;handoff:string;checkoutUrl:'https://celebix.net/api/platform-checkout/handoff'}>;
export interface PlatformCommerceRepository{createCheckout(input:Readonly<{tenantContext:TenantContext;now:Date;intent:PlatformCheckoutIntent}>):Promise<PlatformCheckoutHandoff>}
export const PLATFORM_CHECKOUT_ERROR_CODES=['invalid_input','unauthenticated','durable_authority_invalid','membership_denied','store_inactive','feature_not_enabled','subscription_denied','operation_mismatch','already_covered','already_owned','purchase_pending','checkout_expired','unavailable','commit_unknown']as const;
export class PlatformCommerceRepositoryError extends Error{constructor(readonly code:typeof PLATFORM_CHECKOUT_ERROR_CODES[number]){super(code);this.name='PlatformCommerceRepositoryError';}}
function fail(code:typeof PLATFORM_CHECKOUT_ERROR_CODES[number]='unavailable'):never{throw new PlatformCommerceRepositoryError(code);}
export function parsePlatformCheckoutIntent(value:unknown):PlatformCheckoutIntent{
 try{
  if(!value||typeof value!=='object'||Array.isArray(value))fail('invalid_input');
  const r=value as Record<string,unknown>;if(Object.keys(r).length!==4||Object.keys(r).some(k=>!['kind','offerId','term','operationId'].includes(k)))fail('invalid_input');
  const operationId=commercialUuid(r.operationId);
  if(r.kind==='package'){
   if(!['monthly','annual'].includes(r.term as string)||!COMMERCIAL_PACKAGES.some(p=>p.id===r.offerId&&p.monthlyPriceCents>0))fail('invalid_input');
  }else if(r.kind==='tool'){
   if(r.term!=='once'||!STORE_TOOL_OFFERS.some(o=>o.id===r.offerId))fail('invalid_input');
  }else if(r.kind==='toshi_credit'){
   if(r.term!=='once'||!TOSHI_CREDIT_OFFERS.some(o=>o.id===r.offerId))fail('invalid_input');
  }else fail('invalid_input');
  return Object.freeze({kind:r.kind,offerId:r.offerId as string,term:r.term as PlatformCheckoutIntent['term'],operationId});
 }catch(error){if(error instanceof PlatformCommerceRepositoryError)throw error;return fail('invalid_input');}
}
export function createPostgresPlatformCommerceRepository(options:Readonly<{pool:PostgresPoolLike;timeouts:PostgresTimeoutOptions;handoffKey:Uint8Array}>):PlatformCommerceRepository{
 if(typeof options?.pool?.connect!=='function'||!(options.handoffKey instanceof Uint8Array)||options.handoffKey.byteLength!==32||['poolCheckoutMs','statementMs','lockMs','idleTransactionMs'].some(k=>{const n=options.timeouts?.[k as keyof PostgresTimeoutOptions];return !Number.isSafeInteger(n)||n<1||n>60000;}))throw TypeError('platform_commerce_runtime_invalid');
 const secret=new Uint8Array(options.handoffKey),timeouts={...options.timeouts};
 return Object.freeze({async createCheckout(input:Parameters<PlatformCommerceRepository['createCheckout']>[0]):Promise<PlatformCheckoutHandoff>{
  let a:ReturnType<typeof merchantAuthority>,intent:PlatformCheckoutIntent;
  try{
   if(Object.keys(input).length!==3||Object.keys(input).some(k=>!['tenantContext','now','intent'].includes(k)))fail('invalid_input');
   intent=parsePlatformCheckoutIntent(input.intent);
   if(!['store_owner','admin'].includes(input.tenantContext.membership.role)||intent.kind==='package'&&input.tenantContext.membership.role!=='store_owner')fail('membership_denied');
   a=merchantAuthority(input.tenantContext,input.now,'catalog');
  }catch(error){if(error instanceof PlatformCommerceRepositoryError)throw error;return fail('invalid_input');}
  const canonical={kind:intent.kind,offerId:intent.offerId,term:intent.term};
  const handoff=createHmac('sha256',secret).update(`platform-commerce:v1:${a.storeId}:${a.principalId}:${intent.operationId}:${JSON.stringify(canonical)}`,'utf8').digest('base64url');
  const digest=createHash('sha256').update(handoff,'utf8').digest('hex');
  let client;try{client=await acquirePostgresClient(options.pool,timeouts.poolCheckoutMs);}catch{return fail();}
  let began=false,terminal=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;
   for(const[name,ms]of [['statement_timeout',timeouts.statementMs],['lock_timeout',timeouts.lockMs],['idle_in_transaction_session_timeout',timeouts.idleTransactionMs]]as const)await client.query(`SELECT pg_catalog.set_config('${name}',$1,true)`,[`${ms}ms`]);
   await client.query('SET LOCAL ROLE celebix_saas_app');
   const result=await client.query('SELECT outcome,result_payload FROM saas.platform_checkout_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::jsonb,$10::text)',[a.storeId,a.principalId,a.membershipId,a.planId,a.planCode,a.planVersion,a.now,intent.operationId,JSON.stringify(canonical),digest]);
   if(result.rows.length!==1)fail();const row=result.rows[0]!;
   if(!['created','operation_replayed'].includes(row.outcome as string))fail(PLATFORM_CHECKOUT_ERROR_CODES.includes(row.outcome as never)?row.outcome as typeof PLATFORM_CHECKOUT_ERROR_CODES[number]:'unavailable');
   const order=row.result_payload as Record<string,unknown>;
   if(!order||typeof order!=='object'||Array.isArray(order)||order.storeId!==a.storeId||order.kind!==intent.kind||order.offerId!==intent.offerId||order.term!==intent.term||order.currency!=='TRY')fail();
   const orderId=commercialUuid(order.orderId);
   if(!['netCents','vatCents','totalCents','vatBps'].every(k=>typeof order[k]==='number'&&Number.isSafeInteger(order[k])&&(order[k]as number)>=0)||order.vatBps!==2000||order.netCents===0||BigInt(order.netCents as number)+BigInt(order.vatCents as number)!==BigInt(order.totalCents as number)||(BigInt(order.netCents as number)*2000n+5000n)/10000n!==BigInt(order.vatCents as number))fail();
   try{await client.query('COMMIT');terminal=true;client.release();}catch{terminal=true;client.release(true);fail('commit_unknown');}
   return Object.freeze({orderId,handoff,checkoutUrl:'https://celebix.net/api/platform-checkout/handoff'});
  }catch(error){if(!terminal){try{if(began)await client.query('ROLLBACK');client.release();}catch{client.release(true);}}if(error instanceof PlatformCommerceRepositoryError)throw error;return fail();}
 }});
}
