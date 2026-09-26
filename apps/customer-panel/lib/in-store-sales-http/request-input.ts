import {exactInStoreRecord,parseInStoreSaleIntent,parseInStoreUuid,parseInStoreInteger,type InStoreSaleIntent} from '@celebix/saas-contracts';
import {readBoundedOrderJson} from '../order-http/request-input.ts';

export type InStoreMutationBodies = {
  create:Readonly<{saleId:string;intent:InStoreSaleIntent}>;
  update:Readonly<{expectedVersion:number;intent:InStoreSaleIntent}>;
  hold:Readonly<{expectedVersion:number;held:boolean}>;
  prepare:Readonly<{expectedVersion:number;expectedTotalCents:number}>;
  payment:Readonly<{expectedVersion:number;slipReference:string|null}>;
  complete:Readonly<{expectedVersion:number}>;
  cancel:Readonly<{expectedVersion:number;confirmUnpaid:true}>;
  takeover:Readonly<{expectedVersion:number}>;
  staff:Readonly<{expectedVersion:number;enabled:boolean;locationIds:readonly string[];discountLimitBps:number}>;
};
export type InStoreMutationKind=keyof InStoreMutationBodies;
const keys:Readonly<Record<InStoreMutationKind,readonly string[]>>={create:['saleId','intent'],update:['expectedVersion','intent'],hold:['expectedVersion','held'],prepare:['expectedVersion','expectedTotalCents'],payment:['expectedVersion','slipReference'],complete:['expectedVersion'],cancel:['expectedVersion','confirmUnpaid'],takeover:['expectedVersion'],staff:['expectedVersion','enabled','locationIds','discountLimitBps']};
export async function readInStoreMutationInput<K extends InStoreMutationKind>(request:Request,kind:K):Promise<Readonly<{operationId:string;value:InStoreMutationBodies[K]}>|null> {
  try {
    const operationId=parseInStoreUuid(request.headers.get('idempotency-key'));
    const raw=exactInStoreRecord(await readBoundedOrderJson(request),keys[kind]);
    let value:InStoreMutationBodies[InStoreMutationKind];
    if(kind==='create')value={saleId:parseInStoreUuid(raw.saleId),intent:parseInStoreSaleIntent(raw.intent)};
    else {
      const expectedVersion=parseInStoreInteger(raw.expectedVersion,kind==='staff'?0:1);
      if(kind==='update')value={expectedVersion,intent:parseInStoreSaleIntent(raw.intent)};
      else if(kind==='hold'){if(typeof raw.held!=='boolean')return null;value={expectedVersion,held:raw.held};}
      else if(kind==='prepare')value={expectedVersion,expectedTotalCents:parseInStoreInteger(raw.expectedTotalCents,1)};
      else if(kind==='payment'){if(raw.slipReference!==null&&(typeof raw.slipReference!=='string'||raw.slipReference.length<1||raw.slipReference.length>128||raw.slipReference!==raw.slipReference.trim()||/[\u0000-\u001f\u007f]/.test(raw.slipReference)))return null;value={expectedVersion,slipReference:raw.slipReference as string|null};}
      else if(kind==='cancel'){if(raw.confirmUnpaid!==true)return null;value={expectedVersion,confirmUnpaid:true};}
      else if(kind==='staff'){
        if(typeof raw.enabled!=='boolean'||!Array.isArray(raw.locationIds)||raw.locationIds.length>1000)return null;
        const locationIds=raw.locationIds.map(parseInStoreUuid);if(new Set(locationIds).size!==locationIds.length)return null;
        value={expectedVersion,enabled:raw.enabled,locationIds:Object.freeze(locationIds),discountLimitBps:parseInStoreInteger(raw.discountLimitBps,0,9999)};
      }else value={expectedVersion};
    }
    return Object.freeze({operationId,value:Object.freeze(value) as InStoreMutationBodies[K]});
  }catch{return null;}
}
function query(request:Request,allowed:readonly string[]):URLSearchParams|null {
  try{const url=new URL(request.url);const raw=url.search.slice(1);if(new TextEncoder().encode(raw).byteLength>4096||raw.startsWith('&')||raw.endsWith('&')||raw.includes('&&'))return null;
    const keys=[...url.searchParams.keys()];if(new Set(keys).size!==keys.length||keys.some(key=>!allowed.includes(key)))return null;return url.searchParams;
  }catch{return null;}
}
function searchText(value:string|null,max:number):string|null {return value!==null&&value.length>=1&&value.length<=max&&value===value.trim()&&!/[\u0000-\u001f\u007f]/.test(value)?value:null;}
export function readInStoreProductsInput(request:Request):Readonly<{locationId:string;barcode?:string;query?:string;limit:number}>|null {
  try{const q=query(request,['locationId','barcode','query','limit']);if(!q||q.has('barcode')===q.has('query'))return null;
    const key=q.has('barcode')?'barcode':'query';const value=searchText(q.get(key),key==='barcode'?128:200);if(value===null)return null;
    const raw=q.get('limit')??'20';if(!/^(?:[1-9]|1\d|20)$/.test(raw))return null;
    return Object.freeze({locationId:parseInStoreUuid(q.get('locationId')),[key]:value,limit:Number(raw)});
  }catch{return null;}
}
export function readInStoreSalesInput(request:Request):Readonly<{status:'draft'|'held'|'pending'|'completed';pageSize:number;cursor?:string}>|null {
  const q=query(request,['status','pageSize','cursor']);if(!q)return null;const status=q.get('status')??'completed';const raw=q.get('pageSize')??'20';const cursor=q.get('cursor');
  if(!['draft','held','pending','completed'].includes(status)||!/^(?:[1-9]|[1-4]\d|50)$/.test(raw)||(cursor!==null&&(searchText(cursor,512)===null||!(/^[A-Za-z0-9_:.-]+$/).test(cursor))))return null;
  return Object.freeze({status:status as 'draft'|'held'|'pending'|'completed',pageSize:Number(raw),...(cursor===null?{}:{cursor})});
}
