import {createHash} from 'node:crypto';
import {hasCommercialCapability,isMerchantActionAllowed,parseTrendyolOverview,parseTrendyolOrderIssues,parseTrendyolProducts,parseTrendyolTaxProducts,parseTrendyolPricingRule,parseTrendyolSaveResult,parseTrendyolSellerId,TRENDYOL_ERROR_CODES,trendyolInteger,trendyolUuid,type TenantContext,type TrendyolErrorCode,type TrendyolOverview,type TrendyolOrderIssues,type TrendyolProducts,type TrendyolTaxProducts,type TrendyolSaveResult,type TrendyolPricingRule} from '@celebix/saas-contracts';
import {acquirePostgresClient,type PostgresPoolLike,type PostgresTimeoutOptions} from '../postgres/pool.ts';
import {parseTrendyolSealedCredential} from './credential.ts';
import type {SealedMerchantProviderCredential} from '../provider-execution/credential-crypto.ts';

export class TrendyolRepositoryError extends Error{readonly code:TrendyolErrorCode;constructor(code:TrendyolErrorCode){super(code);this.code=code;this.name='TrendyolRepositoryError';}}
export function trendyolFailure(code:TrendyolErrorCode='unavailable'):never{throw new TrendyolRepositoryError(code);}
export function trendyolErrorCode(error:unknown):TrendyolErrorCode{
  if(error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'&&(TRENDYOL_ERROR_CODES as readonly string[]).includes(error.code))return error.code as TrendyolErrorCode;
  return 'unavailable';
}
export function trendyolFingerprint(value:unknown):string{
  function stable(v:unknown):string{if(v===null||typeof v!=='object'){const s=JSON.stringify(v);if(s===undefined)trendyolFailure('invalid_input');return s;}if(Array.isArray(v))return'['+v.map(stable).join(',')+']';const o=v as Record<string,unknown>;return'{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+stable(o[k])).join(',')+'}';}
  return createHash('sha256').update(stable(value)).digest('hex');
}
export type TrendyolAuthority=Readonly<{tenantContext:TenantContext;now:Date}>;
export type TrendyolConnectionSecret=Readonly<{sellerId:string;credential:SealedMerchantProviderCredential;credentialVersion:number;connectionVersion:number;generation:number}>;
export type TrendyolFence=Readonly<{jobId:string;leaseId:string;generation:number;connectionVersion:number}>;
export type TrendyolJob=Readonly<{id:string;storeId:string;sellerId:string;connectionVersion:number;credentialVersion:number;generation:number;leaseId:string;kind:'catalog'|'orders'|'order'|'batch'|'setup';payload:Readonly<Record<string,unknown>>;credential:SealedMerchantProviderCredential;pricing:TrendyolPricingRule}>;
export interface TrendyolRepository{
  overview(input:TrendyolAuthority):Promise<TrendyolOverview>;
  orderIssues(input:TrendyolAuthority):Promise<TrendyolOrderIssues>;
  products(input:TrendyolAuthority&Readonly<{cursor?:string;limit?:number}>):Promise<TrendyolProducts>;
  productsTax(input:TrendyolAuthority&Readonly<{cursor?:string;limit?:number}>):Promise<TrendyolTaxProducts>;
  credential(input:TrendyolAuthority):Promise<TrendyolConnectionSecret>;
  receipt(input:TrendyolAuthority&Readonly<{action:'connect'|'settings'|'map'|'sync'|'disconnect';operationId:string;fingerprint:string}>):Promise<TrendyolSaveResult|null>;
  command(input:TrendyolAuthority&Readonly<{action:'connect'|'settings'|'map'|'sync'|'disconnect';payload:Readonly<Record<string,unknown>>}>):Promise<TrendyolSaveResult>;
}
export interface TrendyolWorkflowRepository{
  claim(now:Date,limit?:number):Promise<readonly TrendyolJob[]>;
  read(fence:TrendyolFence,now:Date):Promise<TrendyolJob|null>;
  beginDispatch(fence:TrendyolFence,now:Date):Promise<boolean>;
  complete(fence:TrendyolFence,result:Readonly<Record<string,unknown>>,now:Date):Promise<Readonly<Record<string,unknown>>>;
  defer(fence:TrendyolFence,code:string,now:Date,retryAfterSeconds?:number):Promise<void>;
  importPackages(fence:TrendyolFence,packages:readonly unknown[],now:Date):Promise<Readonly<Record<string,unknown>>>;
  webhook(storeId:string,webhookHash:string,now:Date):Promise<void>;
}
type Options=Readonly<{pool:PostgresPoolLike;timeouts?:PostgresTimeoutOptions}>;
function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))trendyolFailure();return v as Record<string,unknown>;}
function timestamp(now:Date){if(!(now instanceof Date)||!Number.isFinite(now.getTime()))trendyolFailure('invalid_input');return now.toISOString();}
function checked<T>(fn:()=>T):T{try{return fn();}catch(error){if(error instanceof TrendyolRepositoryError)throw error;trendyolFailure('invalid_input');}}
function authority(input:TrendyolAuthority,write=false):unknown[]{
  const t=input.tenantContext;
  if(!t||t.schemaVersion!==1||t.store?.status!=='active'||t.membership?.status!=='active'||t.entitlements?.status!=='active'||!isMerchantActionAllowed(t.membership.role,write?'integrations.manage':'integrations.read'))trendyolFailure('membership_denied');
  if(!hasCommercialCapability(t.entitlements,'marketplaces'))trendyolFailure('feature_not_enabled');
  return checked(()=>[trendyolUuid(t.store.id),trendyolUuid(t.principal.id),trendyolUuid(t.membership.id),trendyolUuid(t.entitlements.planId),t.entitlements.planCode,trendyolInteger(t.entitlements.version,1,Number.MAX_SAFE_INTEGER),timestamp(input.now)]);
}
function executor(options:Options,role:'celebix_saas_app'|'celebix_saas_workflow'){
  if(typeof window!=='undefined'||!options.pool||typeof options.pool.connect!=='function')trendyolFailure();
  const limits={poolCheckoutMs:3000,statementMs:10000,lockMs:3000,idleTransactionMs:10000,...options.timeouts};for(const v of Object.values(limits))trendyolInteger(v,1,60000);
  return async function execute<T>(sql:string,values:unknown[],success:readonly string[],parse:(v:unknown,outcome:string)=>T):Promise<T>{
    const client=await acquirePostgresClient(options.pool,limits.poolCheckoutMs);let terminal=false;
    try{
      await client.query('BEGIN');
      await client.query("SELECT pg_catalog.set_config('statement_timeout',$1,true)",[limits.statementMs+'ms']);
      await client.query("SELECT pg_catalog.set_config('lock_timeout',$1,true)",[limits.lockMs+'ms']);
      await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout',$1,true)",[limits.idleTransactionMs+'ms']);
      await client.query('SET LOCAL ROLE '+role);
      const response=await client.query(sql,values);if(response.rowCount!==1||response.rows.length!==1)trendyolFailure();
      const row=record(response.rows[0]);if(typeof row.outcome!=='string')trendyolFailure();
      if(!success.includes(row.outcome))trendyolFailure(row.outcome==='denied'||row.outcome==='durable_authority_invalid'?'membership_denied':row.outcome==='seller_change_blocked'?'provider_rejected':(TRENDYOL_ERROR_CODES as readonly string[]).includes(row.outcome)?row.outcome as TrendyolErrorCode:'unavailable');
      let result:T;try{result=parse(row.result_payload,row.outcome);}catch(error){if(error instanceof TrendyolRepositoryError)throw error;trendyolFailure();}
      try{await client.query('COMMIT');terminal=true;client.release();}catch{terminal=true;client.release(true);trendyolFailure('commit_unknown');}
      return result;
    }catch(error){if(!terminal){try{await client.query('ROLLBACK');client.release();}catch{client.release(true);}}if(error instanceof TrendyolRepositoryError)throw error;trendyolFailure();}
  };
}
export function createPostgresTrendyolRepository(options:Options):TrendyolRepository{
  const execute=executor(options,'celebix_saas_app');
  const run=<T>(input:TrendyolAuthority,action:string,payload:unknown,success:readonly string[],parse:(value:unknown)=>T,write=false)=>execute('SELECT outcome,result_payload FROM saas.trendyol_command($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::jsonb)',[...authority(input,write),action,JSON.stringify(payload)],success,parse);
  return{
    overview:async input=>run(input,'overview',{},['found','ok'],parseTrendyolOverview),
    orderIssues:async input=>run(input,'order_issues',{},['found','ok'],parseTrendyolOrderIssues),
    products:async input=>{const payload=checked(()=>({limit:trendyolInteger(input.limit??25,1,50),cursor:input.cursor===undefined?null:trendyolUuid(input.cursor)}));return run(input,'products',payload,['found','ok'],parseTrendyolProducts);},
    productsTax:async input=>{const payload=checked(()=>({limit:trendyolInteger(input.limit??25,1,50),cursor:input.cursor===undefined?null:trendyolUuid(input.cursor)}));return run(input,'products_tax',payload,['found','ok'],parseTrendyolTaxProducts);},
    credential:async input=>run(input,'credential',{},['found','ok'],v=>{const c=record(v);return Object.freeze({sellerId:parseTrendyolSellerId(c.sellerId),credential:parseTrendyolSealedCredential(c.credential),credentialVersion:trendyolInteger(c.credentialVersion,1,Number.MAX_SAFE_INTEGER),connectionVersion:trendyolInteger(c.connectionVersion,1,Number.MAX_SAFE_INTEGER),generation:trendyolInteger(c.generation,1,Number.MAX_SAFE_INTEGER)});}),
    receipt:async input=>run(input,'receipt',{targetAction:input.action,operationId:trendyolUuid(input.operationId),fingerprint:input.fingerprint},['found','not_found'],value=>value===null||!Object.keys(record(value)).length?null:parseTrendyolSaveResult(value),true),
    command:async input=>{if(!['connect','settings','map','sync','disconnect'].includes(input.action))trendyolFailure('invalid_input');return run(input,input.action,input.payload,['saved','queued','ok','replayed'],parseTrendyolSaveResult,true);},
  };
}
export function trendyolFence(job:TrendyolJob):TrendyolFence{return{jobId:job.id,leaseId:job.leaseId,generation:job.generation,connectionVersion:job.connectionVersion};}
function parseFence(value:TrendyolFence):TrendyolFence{return checked(()=>({jobId:trendyolUuid(value.jobId),leaseId:trendyolUuid(value.leaseId),generation:trendyolInteger(value.generation,1,Number.MAX_SAFE_INTEGER),connectionVersion:trendyolInteger(value.connectionVersion,1,Number.MAX_SAFE_INTEGER)}));}
function parseJob(value:unknown):TrendyolJob{
  const v=record(value);if(!['catalog','orders','order','batch','setup'].includes(v.kind as string))trendyolFailure();
  return Object.freeze({id:trendyolUuid(v.id),storeId:trendyolUuid(v.storeId),sellerId:parseTrendyolSellerId(v.sellerId),connectionVersion:trendyolInteger(v.connectionVersion,1,Number.MAX_SAFE_INTEGER),credentialVersion:trendyolInteger(v.credentialVersion,1,Number.MAX_SAFE_INTEGER),generation:trendyolInteger(v.generation,1,Number.MAX_SAFE_INTEGER),leaseId:trendyolUuid(v.leaseId),kind:v.kind as TrendyolJob['kind'],payload:record(v.payload),credential:parseTrendyolSealedCredential(v.credential),pricing:parseTrendyolPricingRule(v.pricing)});
}
export function createPostgresTrendyolWorkflowRepository(options:Options):TrendyolWorkflowRepository{
  const execute=executor(options,'celebix_saas_workflow');
  const run=<T>(action:string,payload:unknown,now:Date,success:readonly string[],parse:(value:unknown,outcome:string)=>T)=>execute('SELECT outcome,result_payload FROM saas.trendyol_workflow($1::text,$2::jsonb,$3::timestamptz)',[action,JSON.stringify(payload),timestamp(now)],success,parse);
  return{
    claim:(now,limit=2)=>run('claim',{limit:trendyolInteger(limit,1,2)},now,['claimed','ok'],v=>{const jobs=record(v).jobs;if(!Array.isArray(jobs)||jobs.length>limit)trendyolFailure();return Object.freeze(jobs.map(parseJob));}),
    read:(fence,now)=>run('read',parseFence(fence),now,['found','ok','stale'],(v,outcome)=>outcome==='stale'?null:record(v).job===null?null:parseJob(record(v).job)),
    beginDispatch:(fence,now)=>run('dispatch',parseFence(fence),now,['saved','ok','stale'],(_v,outcome)=>outcome!=='stale'),
    complete:(fence,result,now)=>run('complete',{...parseFence(fence),...result},now,['completed','finished','ok','stale'],v=>record(v??{})),
    async defer(fence,code,now,retryAfterSeconds=60){if(!/^[a-z0-9_]{1,80}$/.test(code))trendyolFailure('invalid_input');await run('defer',{...parseFence(fence),code,retryAfterSeconds:trendyolInteger(retryAfterSeconds,1,86400)},now,['retry','deferred','failed','ok','stale'],()=>undefined);},
    importPackages:(fence,packages,now)=>{if(!Array.isArray(packages)||packages.length>1000)trendyolFailure('invalid_input');return run('import',{...parseFence(fence),packages,completeOrder:true},now,['imported','updated','unchanged','action_required','ignored_stale','ok','stale'],v=>record(v??{}));},
    async webhook(storeId,webhookHash,now){trendyolUuid(storeId);if(!/^[a-f0-9]{64}$/.test(webhookHash))trendyolFailure('invalid_input');await run('webhook',{storeId,webhookHash},now,['accepted','ok'],()=>undefined);},
  };
}
