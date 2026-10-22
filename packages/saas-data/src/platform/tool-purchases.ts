import {parsePlatformToolPurchases,parseStoreToolPurchase,type StoreToolPurchase} from '@celebix/saas-contracts';
import {acquirePostgresClient,type PostgresPoolLike,type PostgresTimeoutOptions} from '../postgres/pool.ts';

const codes=['invalid_input','operator_denied','record_not_found','version_conflict','operation_mismatch','amount_mismatch','already_settled','receipt_used','store_inactive','already_owned','unavailable','commit_unknown'] as const;
export type PlatformToolPurchaseErrorCode=typeof codes[number];
export class PlatformToolPurchaseError extends Error{constructor(readonly code:PlatformToolPurchaseErrorCode){super(code);this.name='PlatformToolPurchaseError';}}
export interface PlatformToolReceipt{storeId:string;amountCents:number;method:'bank_transfer'|'cash'|'card';reference:string;reason:string}
export interface PlatformToolPurchasesQuery{storeId?:string;status?:'pending'|'settled'}
export interface PlatformToolSettlementResult{ok:true;purchase:StoreToolPurchase;replayed:boolean}
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function fail(code:PlatformToolPurchaseErrorCode='invalid_input'):never{throw new PlatformToolPurchaseError(code);}
function uuid(value:unknown):string{if(typeof value!=='string'||!uuidPattern.test(value))fail();return value;}
function text(value:unknown,max:number):string{if(typeof value!=='string'||!value||value.length>max||value!==value.trim()||/[\x00-\x1f\x7f]/.test(value))fail();return value;}
function record(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
 const descriptors=Object.getOwnPropertyDescriptors(value),allowed=[...required,...optional];
 if(required.some(key=>!Object.hasOwn(descriptors,key))||Reflect.ownKeys(descriptors).some(key=>typeof key!=='string'||!allowed.includes(key)||!Object.hasOwn(descriptors[key]!,'value')))fail();
 return value as Record<string,unknown>;
}
export class PostgresPlatformToolPurchasesRepository{
 constructor(private readonly options:{pool:PostgresPoolLike;role:'celebix_saas_platform_operator';timeouts:PostgresTimeoutOptions}){
  if(options.role!=='celebix_saas_platform_operator'||!options.pool||typeof options.pool.connect!=='function'||Object.values(options.timeouts).some(value=>!Number.isSafeInteger(value)||value<1||value>60000))fail();
 }
 private async execute<T>(write:boolean,sql:string,values:unknown[],parse:(value:unknown)=>T):Promise<T>{
  let client;try{client=await acquirePostgresClient(this.options.pool,this.options.timeouts.poolCheckoutMs);}catch{fail('unavailable');}
  let began=false,terminal=false;
  try{
   await client.query(write?'BEGIN ISOLATION LEVEL READ COMMITTED':'BEGIN READ ONLY');began=true;
   for(const[name,value]of [['statement_timeout',this.options.timeouts.statementMs],['lock_timeout',this.options.timeouts.lockMs],['idle_in_transaction_session_timeout',this.options.timeouts.idleTransactionMs]]as const)await client.query(`SELECT pg_catalog.set_config('${name}',$1,true)`,[`${value}ms`]);
   await client.query('SET LOCAL ROLE celebix_saas_platform_operator');
   const output=await client.query(sql,values);if(output.rows.length!==1||Object.keys(output.rows[0]!).join()!=='result')fail('unavailable');
   let result:T;try{result=parse(output.rows[0]!.result);}catch{fail('unavailable');}
   try{await client.query('COMMIT');}catch{terminal=true;client.release(true);fail(write?'commit_unknown':'unavailable');}
   terminal=true;client.release();return result;
  }catch(cause){
   if(!terminal){try{if(began)await client.query('ROLLBACK');client.release();}catch{client.release(true);}}
   if(cause instanceof PlatformToolPurchaseError)throw cause;
   const message=(cause as {message?:unknown})?.message;if(typeof message==='string'&&(codes as readonly string[]).includes(message))fail(message as PlatformToolPurchaseErrorCode);fail('unavailable');
  }
 }
 async read(operatorId:string,query:PlatformToolPurchasesQuery={}):Promise<ReturnType<typeof parsePlatformToolPurchases>>{
  uuid(operatorId);const input=record(query,[],['storeId','status']);if(Object.hasOwn(input,'storeId'))uuid(input.storeId);if(Object.hasOwn(input,'status')&&!['pending','settled'].includes(input.status as string))fail();
  return this.execute(false,'SELECT saas.platform_tool_purchases_read($1::uuid,$2::jsonb) AS result',[operatorId,JSON.stringify(input)],value=>{
   const result=parsePlatformToolPurchases(value);if(result.items.some(row=>input.storeId&&row.storeId!==input.storeId||input.status&&row.status!==input.status))fail('unavailable');return result;
  });
 }
 async settle(operatorId:string,purchaseId:string,receipt:PlatformToolReceipt,expectedVersion:number,idempotencyKey:string):Promise<PlatformToolSettlementResult>{
  uuid(operatorId);uuid(purchaseId);const input=record(receipt,['storeId','amountCents','method','reference','reason']);uuid(input.storeId);text(input.reference,200);text(input.reason,500);text(idempotencyKey,128);
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1||!Number.isSafeInteger(input.amountCents)||(input.amountCents as number)<1||!['bank_transfer','cash','card'].includes(input.method as string))fail();
  return this.execute(true,'SELECT saas.platform_tool_purchase_settle($1::uuid,$2::uuid,$3::bigint,$4::text,$5::jsonb) AS result',[operatorId,purchaseId,expectedVersion,idempotencyKey,JSON.stringify(input)],value=>{
   const result=record(value,['ok','purchase','replayed']);if(result.ok!==true||typeof result.replayed!=='boolean')fail('unavailable');const purchase=parseStoreToolPurchase(result.purchase);
   if(purchase.id!==purchaseId||purchase.storeId!==input.storeId||purchase.status!=='settled'||purchase.totalCents!==input.amountCents||!purchase.receipt||purchase.receipt.amountCents!==input.amountCents||purchase.receipt.method!==input.method||purchase.receipt.reference!==input.reference||purchase.version!==expectedVersion+1)fail('unavailable');
   return{ok:true,purchase,replayed:result.replayed};
  });
 }
}
