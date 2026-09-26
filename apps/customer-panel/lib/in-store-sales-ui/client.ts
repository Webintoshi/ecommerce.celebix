import {
  parseInStoreBootstrap, parseInStoreProduct, parseInStoreSale, parseInStoreSaleIntent,
  parseInStoreSalePage, parseInStoreSaleResult, parseInStoreStaffGrant,
  type InStoreSaleIntent, type InStoreSaleResult,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const CODES = ["invalid_input","unauthenticated","membership_denied","store_inactive","feature_not_enabled","origin_denied","not_found","ambiguous_barcode","version_conflict","operation_mismatch","invalid_transition","inventory_conflict","pricing_unavailable","discount_denied","discount_invalid","unavailable"] as const;
export type InStoreSalesUiErrorCode = typeof CODES[number];
const MESSAGES:Record<InStoreSalesUiErrorCode,string> = {
  invalid_input:"Bilgileri kontrol edip yeniden dene.", unauthenticated:"Oturumun sona erdi. Yeniden giriş yap.",
  membership_denied:"Bu satış işlemi için yetkin bulunmuyor.", store_inactive:"Mağaza şu anda satışa açık değil.",
  feature_not_enabled:"Mağaza satışı henüz etkin değil.", origin_denied:"İşlem bu panelden doğrulanamadı. Sayfayı yenile.",
  not_found:"Satış kaydı bulunamadı veya erişilemiyor.", ambiguous_barcode:"Bu barkod birden fazla varyanta ait. Doğru ürünü seç.",
  version_conflict:"Satış başka bir işlemle güncellendi. Güncel kaydı kontrol et.", operation_mismatch:"İşlem aynı bilgilerle doğrulanamadı. Satış durumunu kontrol et.",
  invalid_transition:"Satışın mevcut durumunda bu işlem yapılamıyor.", inventory_conflict:"Seçilen depoda yeterli satılabilir stok yok. Sepeti kontrol et.",
  pricing_unavailable:"Güvenilir ürün fiyatı alınamadı. Ödemeye geçmeden yeniden dene.", discount_denied:"Bu indirim yetki sınırını aşıyor.",
  discount_invalid:"İndirim tutarı uygun değil. İndirimi düzenle.", unavailable:"Hizmete ulaşılamadı. Satışın durumunu kontrol ederek yeniden dene.",
};
export class InStoreSalesUiError extends Error {
  readonly code:InStoreSalesUiErrorCode; readonly status:number; readonly unknownResult:boolean;
  constructor(code:InStoreSalesUiErrorCode,status:number,unknownResult=false) { super(MESSAGES[code]); this.name="InStoreSalesUiError";this.code=code;this.status=status;this.unknownResult=unknownResult; }
}
function invalid():never { throw new TypeError("in_store_ui_invalid"); }
function object(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown> {
  if (!value||typeof value!=="object"||Array.isArray(value)) invalid();
  const descriptors=Object.getOwnPropertyDescriptors(value),allowed=new Set([...required,...optional]);
  if(required.some(key=>!Object.hasOwn(descriptors,key))||Reflect.ownKeys(descriptors).some(key=>typeof key!=="string"||!allowed.has(key)||!("value" in descriptors[key])||!descriptors[key].enumerable)) invalid();
  return value as Record<string,unknown>;
}
function id(value:unknown):string { if(typeof value!=="string"||!UUID.test(value)) invalid();return value; }
function integer(value:unknown,min=1,max=Number.MAX_SAFE_INTEGER):number { if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)invalid();return value as number; }
function plainText(value:unknown,max:number):string { if(typeof value!=="string"||!value.trim()||value!==value.trim()||value.length>max||CONTROL.test(value))invalid();return value; }
function isAbort(error:unknown):boolean { return error instanceof Error&&error.name==="AbortError"; }
export type InStoreSearchInput = Readonly<{locationId:string;barcode?:string;query?:string;limit?:number}>;
type Fetch=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
export function createInStoreSalesUiClient(options:Readonly<{fetch?:Fetch;randomUUID?:()=>string}>={}) {
  object(options,[],["fetch","randomUUID"]);
  const fetchImpl=options.fetch??((input,init)=>fetch(input,init));
  const randomUUID=options.randomUUID??(()=>crypto.randomUUID());
  async function request(path:string,init:RequestInit,mutation=false):Promise<unknown> {
    let response:Response;
    try { response=await fetchImpl(`/api/orders/in-store${path}`,{credentials:"same-origin",cache:"no-store",...init}); }
    catch(error) { if(!mutation&&isAbort(error))throw error;throw new InStoreSalesUiError("unavailable",503,mutation); }
    let body:unknown;
    try {
      if(response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")throw new Error("invalid_json");
      const reader=response.body?.getReader(); if(!reader)throw new Error("missing_json");
      const chunks:Uint8Array[]=[];let size=0;
      for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1_048_576){void reader.cancel();throw new Error("large_json");}chunks.push(part.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
      body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    } catch(error) { if(!mutation&&isAbort(error))throw error;throw new InStoreSalesUiError("unavailable",response.status||503,mutation); }
    if(!response.ok){
      let code:InStoreSalesUiErrorCode="unavailable";
      try{const error=object(body,["code"]);if(typeof error.code==="string"&&CODES.includes(error.code as InStoreSalesUiErrorCode))code=error.code as InStoreSalesUiErrorCode;}catch{}
      throw new InStoreSalesUiError(code,response.status,mutation&&(response.status>=500||code==="unavailable"));
    }
    try{return object(body,["data"]).data;}catch{throw new InStoreSalesUiError("unavailable",503,mutation);}
  }
  async function read<T>(path:string,parser:(value:unknown)=>T,signal?:AbortSignal):Promise<T>{
    const value=await request(path,{method:"GET",...(signal?{signal}:{})});
    try{return parser(value);}catch{throw new InStoreSalesUiError("unavailable",503);}
  }
  async function mutate(path:string,body:unknown,operationId:string,method="POST",saleId?:string):Promise<InStoreSaleResult>{
    const operation=id(operationId);
    const value=await request(path,{method,headers:{"content-type":"application/json","idempotency-key":operation},body:JSON.stringify(body)},true);
    try{const result=parseInStoreSaleResult(value);if(saleId&&result.sale.id!==saleId)throw new Error("wrong_sale");return result;}
    catch{throw new InStoreSalesUiError("unavailable",503,true);}
  }
  function versionBody(input:unknown,extra:readonly string[]=[]) { const body=object(input,["expectedVersion",...extra]);integer(body.expectedVersion);return body; }
  return Object.freeze({
    newId():string { return id(randomUUID()); },
    bootstrap(signal?:AbortSignal){return read("/bootstrap",parseInStoreBootstrap,signal);},
    async searchProducts(input:InStoreSearchInput,signal?:AbortSignal){
      const selected=object(input,["locationId"],["barcode","query","limit"]);id(selected.locationId);
      if((selected.barcode===undefined)===(selected.query===undefined))invalid();
      const query=new URLSearchParams({locationId:input.locationId,limit:String(integer(selected.limit??20,1,20))});
      if(selected.barcode!==undefined)query.set("barcode",plainText(selected.barcode,128));else query.set("query",plainText(selected.query,100));
      return read(`/products?${query}`,value=>{const list=object(value,["products"]).products;if(!Array.isArray(list)||list.length>20)invalid();return Object.freeze(list.map(parseInStoreProduct));},signal);
    },
    async listSales(input:Readonly<{status:"draft"|"held"|"pending"|"completed";pageSize?:number;cursor?:string}>){
      const body=object(input,["status"],["pageSize","cursor"]);if(!["draft","held","pending","completed"].includes(String(body.status)))invalid();
      const query=new URLSearchParams({status:input.status,pageSize:String(integer(input.pageSize??20,1,50))});if(input.cursor!==undefined)query.set("cursor",plainText(input.cursor,1024));
      return read(`/sales?${query}`,parseInStoreSalePage);
    },
    getSale(saleId:string){return read(`/sales/${id(saleId)}`,value=>{const sale=parseInStoreSale(value);if(sale.id!==saleId)invalid();return sale;});},
    getOperation(operationId:string){return read(`/operations/${id(operationId)}`,value=>value===null?null:parseInStoreSaleResult(value));},
    async createSale(input:Readonly<{saleId:string;intent:InStoreSaleIntent}>,operationId:string){const body=object(input,["saleId","intent"]);const sale=id(body.saleId);const intent=parseInStoreSaleIntent(body.intent);return mutate("/sales",{saleId:sale,intent},operationId,"POST",sale);},
    async updateSale(saleId:string,input:Readonly<{expectedVersion:number;intent:InStoreSaleIntent}>,operationId:string){const body=versionBody(input,["intent"]);return mutate(`/sales/${id(saleId)}`,{expectedVersion:body.expectedVersion,intent:parseInStoreSaleIntent(body.intent)},operationId,"PATCH",saleId);},
    async holdSale(saleId:string,input:Readonly<{expectedVersion:number;held:boolean}>,operationId:string){const body=versionBody(input,["held"]);if(typeof body.held!=="boolean")invalid();return mutate(`/sales/${id(saleId)}/hold`,body,operationId,"POST",saleId);},
    async prepareSale(saleId:string,input:Readonly<{expectedVersion:number;expectedTotalCents:number}>,operationId:string){const body=versionBody(input,["expectedTotalCents"]);integer(body.expectedTotalCents,1);return mutate(`/sales/${id(saleId)}/prepare`,body,operationId,"POST",saleId);},
    async confirmPayment(saleId:string,input:Readonly<{expectedVersion:number;slipReference:string|null}>,operationId:string){const body=versionBody(input,["slipReference"]);if(body.slipReference!==null)plainText(body.slipReference,100);return mutate(`/sales/${id(saleId)}/payment`,body,operationId,"POST",saleId);},
    async completeSale(saleId:string,input:Readonly<{expectedVersion:number}>,operationId:string){const body=versionBody(input);return mutate(`/sales/${id(saleId)}/complete`,body,operationId,"POST",saleId);},
    async cancelSale(saleId:string,input:Readonly<{expectedVersion:number;confirmUnpaid:true}>,operationId:string){const body=versionBody(input,["confirmUnpaid"]);if(body.confirmUnpaid!==true)invalid();return mutate(`/sales/${id(saleId)}/cancel`,body,operationId,"POST",saleId);},
    async takeoverSale(saleId:string,input:Readonly<{expectedVersion:number}>,operationId:string){return mutate(`/sales/${id(saleId)}/takeover`,versionBody(input),operationId,"POST",saleId);},
    listStaff(){return read("/staff",value=>{const list=object(value,["staff"]).staff;if(!Array.isArray(list)||list.length>100)invalid();return Object.freeze(list.map(parseInStoreStaffGrant));});},
    async setStaffGrant(membershipId:string,input:Readonly<{expectedVersion:number;enabled:boolean;locationIds:readonly string[];discountLimitBps:number}>,operationId:string){
      const body=object(input,["expectedVersion","enabled","locationIds","discountLimitBps"]);integer(body.expectedVersion,0);if(typeof body.enabled!=="boolean"||!Array.isArray(body.locationIds)||body.locationIds.length>100||new Set(body.locationIds).size!==body.locationIds.length)invalid();body.locationIds.forEach(id);integer(body.discountLimitBps,0,9999);
      const value=await request(`/staff/${id(membershipId)}`,{method:"POST",headers:{"content-type":"application/json","idempotency-key":id(operationId)},body:JSON.stringify(body)},true);
      try{return parseInStoreStaffGrant(value);}catch{throw new InStoreSalesUiError("unavailable",503,true);}
    },
  });
}
export type InStoreSalesUiClient=ReturnType<typeof createInStoreSalesUiClient>;
export const inStoreSalesUi=createInStoreSalesUiClient();
