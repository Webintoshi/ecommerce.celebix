import {isLuckyWheelPromotionEligible,parsePromotionCreateRequest} from '@celebix/saas-contracts';
import {PromotionApiClient,promotionErrorMessage} from '../promotion-ui/client.ts';
import {promotionDraftFromDetail,promotionRuleDocument,type PromotionDraft} from '../promotion-ui/model.ts';
import {LuckyWheelApiError} from './client.ts';
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
type Payload=ReturnType<typeof parsePromotionCreateRequest>;
type Fence=Readonly<{operationId:string;payload:Payload;fingerprint:string}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFINITIVE=new Set(['invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','origin_denied','not_found']);
function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value)}
async function fingerprint(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),byte=>byte.toString(16).padStart(2,'0')).join('')}
function parsePayload(value:unknown){const parsed=parsePromotionCreateRequest(value);if(!isLuckyWheelPromotionEligible(parsed.ruleDocument)||parsed.ruleDocument.trigger.kind!=='code')throw Error('invalid_input');return parsed}
/** Keeps the existing promotion apply API's exact create payload and operation identity across reloads. */
export function createLuckyWheelPromotionApi(options:Readonly<{scope:string;fetch?:typeof fetch;randomUUID?:()=>string;storage?:Storage}>){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.scope))throw new LuckyWheelApiError('invalid_input',400);
 const key=`celebix.wheel.source-create.v1:${options.scope}`,fetcher=options.fetch??((url,init)=>fetch(url,init)),uuid=options.randomUUID??(()=>crypto.randomUUID());
 let storage=options.storage,fence:Fence|undefined,storageFailed=false,pending=false;
 try{storage??=typeof window==='undefined'?undefined:window.sessionStorage;if(!storage&&typeof window!=='undefined')throw Error();const raw=storage?.getItem(key);if(raw){if(raw.length>24000)throw Error();const row=JSON.parse(raw);if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='fingerprint,operationId,payload'||typeof row.operationId!=='string'||!UUID.test(row.operationId)||typeof row.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(row.fingerprint))throw Error();fence={operationId:row.operationId,fingerprint:row.fingerprint,payload:parsePayload(row.payload)}}}catch{storageFailed=true}
 async function verify(){if(storageFailed)throw new LuckyWheelApiError('storage_unavailable');if(fence&&await fingerprint(fence.payload)!==fence.fingerprint){storageFailed=true;throw new LuckyWheelApiError('storage_unavailable')}}
 function persist(value:Fence){if(storageFailed)throw new LuckyWheelApiError('storage_unavailable');try{if(storage){const raw=JSON.stringify(value);storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error()}fence=value}catch{storageFailed=true;throw new LuckyWheelApiError('storage_unavailable')}}
 function clear(){try{storage?.removeItem(key);if(storage&&storage.getItem(key)!==null)throw Error();fence=undefined}catch{storageFailed=true}}
 return Object.freeze({
  hasUnresolved:()=>Boolean(fence)||storageFailed,
  async pendingDraft():Promise<PromotionDraft|null>{await verify();return fence?promotionDraftFromDetail(fence.payload):null},
  async apply(draft:PromotionDraft){
   if(pending)throw new LuckyWheelApiError('unresolved');pending=true;const wasUnresolved=Boolean(fence);
   try{
    await verify();const payload=parsePayload({name:draft.name,ruleDocument:promotionRuleDocument(draft)}),hash=await fingerprint(payload);
    if(fence&&fence.fingerprint!==hash)throw new LuckyWheelApiError('unresolved');const operationId=fence?.operationId??uuid();if(!UUID.test(operationId))throw new LuckyWheelApiError('invalid_input',400);
    persist({operationId,payload,fingerprint:hash});
    // The store-scoped fence owns persistence. This instance retains the established HTTP and response checks.
    const client=new PromotionApiClient(fetcher,()=>operationId,{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
    const result=await client.apply(promotionDraftFromDetail(payload));
    if(result.kind==='conflict'&&result.message===promotionErrorMessage('operation_mismatch'))throw Error('operation_mismatch');
    if(result.kind==='saved'&&!isLuckyWheelPromotionEligible(result.promotion.ruleDocument))throw Error('promotion_unavailable');
    clear();return result;
   }catch(error){if(!wasUnresolved&&error instanceof Error&&DEFINITIVE.has(error.message))clear();throw error}finally{pending=false}
  },
 });
}
