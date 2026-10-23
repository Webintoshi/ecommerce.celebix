import { parseTrendyolOverview, parseTrendyolProducts, parseTrendyolOrderIssues, parseTrendyolPricingRule, parseTrendyolListingInput, parseTrendyolSaveResult, parseTrendyolSellerId, parseTrendyolSecret, TRENDYOL_ERROR_CODES, type TrendyolPricingRule, type TrendyolListingInput } from '@celebix/saas-contracts';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE:ReadonlySet<string> = new Set(TRENDYOL_ERROR_CODES);
export class TrendyolApiError extends Error { readonly code: string; constructor(code: string) { super(SAFE.has(code) ? code : 'unavailable'); this.name = 'TrendyolApiError'; this.code = this.message; } }
export type TrendyolOption = Readonly<{ id: number | string; name: string; parentId?: number; required?: boolean; allowCustom?: boolean; varianter?: boolean; slicer?: boolean; allowMultipleAttributeValues?: boolean; values?: readonly Readonly<{id:number;name:string}>[] }>;
export type TrendyolOptions = Readonly<{ items: readonly TrendyolOption[] }>;
export type TrendyolOptionQuery = Readonly<{kind:'categories'|'brands'|'attributes'|'cargo';categoryId?:number;search?:string}>;
export type TrendyolSettingsInput = Readonly<{expectedVersion:number;pricing:TrendyolPricingRule}>;
export type TrendyolConnectInput = TrendyolSettingsInput & Readonly<{sellerId:string;apiKey:string;apiSecret:string}>;
function invalid(): never { throw new TrendyolApiError('invalid_input'); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value,key)) || Object.keys(value).some(key => ![...required,...optional].includes(key))) throw new TrendyolApiError('unavailable');
  return value as Record<string, unknown>;
}
function name(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.length > 300 || /[\x00-\x1f\x7f]/.test(value)) throw new TrendyolApiError('unavailable'); return value; }
function id(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TrendyolApiError('unavailable'); return value as number; }
function parseOptions(value: unknown, kind: TrendyolOptionQuery['kind']): TrendyolOptions {
  const root = object(value,['items']);
  if (!Array.isArray(root.items) || root.items.length > (kind === 'categories' ? 20000 : 1000)) throw new TrendyolApiError('unavailable');
  return {items:root.items.map(item => {
    const row = object(item,['id','name'],['parentId','required','allowCustom','varianter','slicer','allowMultipleAttributeValues','values']);
    const optionId = kind === 'cargo' ? typeof row.id === 'string' && /^[A-Z0-9_]{1,50}$/.test(row.id) ? row.id : (()=>{throw new TrendyolApiError('unavailable');})() : id(row.id);
    for (const key of ['required','allowCustom','varianter','slicer','allowMultipleAttributeValues']) if (Object.hasOwn(row,key) && typeof row[key] !== 'boolean') throw new TrendyolApiError('unavailable');
    let values: {id:number;name:string}[] | undefined;
    if (Object.hasOwn(row,'values')) { if (!Array.isArray(row.values) || row.values.length > 5000) throw new TrendyolApiError('unavailable'); values = row.values.map(entry => { const v=object(entry,['id','name']); return {id:id(v.id),name:name(v.name)}; }); }
    return {id:optionId,name:name(row.name),...(row.parentId===undefined?{}:{parentId:id(row.parentId)}),...(row.required===undefined?{}:{required:row.required as boolean}),...(row.allowCustom===undefined?{}:{allowCustom:row.allowCustom as boolean}),...(row.varianter===undefined?{}:{varianter:row.varianter as boolean}),...(row.slicer===undefined?{}:{slicer:row.slicer as boolean}),...(row.allowMultipleAttributeValues===undefined?{}:{allowMultipleAttributeValues:row.allowMultipleAttributeValues as boolean}),...(values?{values}:{})};
  })};
}
function version(value: number): number { if (!Number.isSafeInteger(value) || value < 0) invalid(); return value; }
export function createTrendyolClient(fetcher: typeof fetch = fetch) {
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),30000);
    try {
      const response = await fetcher(`/api/marketplaces/trendyol${path}`,{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if (!response.body) throw new TrendyolApiError('unavailable');
      const reader=response.body.getReader(), decoder=new TextDecoder('utf-8',{fatal:true});let result='',bytes=0;
      try { for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>4_194_304){await reader.cancel();throw new TrendyolApiError('unavailable');}result+=decoder.decode(chunk.value,{stream:true});}result+=decoder.decode(); } finally { reader.releaseLock(); }
      const value=JSON.parse(result);
      if(!response.ok)throw new TrendyolApiError(value && typeof value==='object' && typeof value.code==='string'?value.code:'unavailable');
      return value;
    } catch(error){if(error instanceof TrendyolApiError)throw error;throw new TrendyolApiError('unavailable');} finally {clearTimeout(timer);}
  }
  async function parsed<T>(run:()=>Promise<unknown>,parser:(value:unknown)=>T):Promise<T>{try{return parser(await run());}catch(error){if(error instanceof TrendyolApiError)throw error;throw new TrendyolApiError('unavailable');}}
  async function write(path:string,body:unknown,operationId:string){if(!UUID.test(operationId))invalid();return parsed(()=>request(path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':operationId},body:JSON.stringify(body)}),parseTrendyolSaveResult);}
  function settings(input:TrendyolSettingsInput){try{return {expectedVersion:version(input.expectedVersion),pricing:parseTrendyolPricingRule(input.pricing)};}catch{invalid();}}
  return Object.freeze({
    overview:()=>parsed(()=>request(''),parseTrendyolOverview),
    orderIssues:()=>parsed(()=>request('/order-issues'),parseTrendyolOrderIssues),
    products(cursor?:string){if(cursor&&!UUID.test(cursor))return Promise.reject(new TrendyolApiError('invalid_input'));const query=new URLSearchParams({limit:'25'});if(cursor)query.set('cursor',cursor);return parsed(()=>request(`/products?${query}`),parseTrendyolProducts);},
    async options(input:TrendyolOptionQuery){if(!['categories','brands','attributes','cargo'].includes(input.kind)||input.categoryId!==undefined&&(!Number.isSafeInteger(input.categoryId)||input.categoryId<1)||input.search!==undefined&&(typeof input.search!=='string'||input.search.length>200))invalid();const query=new URLSearchParams({kind:input.kind});if(input.categoryId!==undefined)query.set('categoryId',String(input.categoryId));if(input.search?.trim())query.set('search',input.search.trim());return parsed(()=>request(`/options?${query}`),value=>parseOptions(value,input.kind));},
    async connect(input:TrendyolConnectInput,operationId:string){let sellerId:string,apiKey:string,apiSecret:string;try{sellerId=parseTrendyolSellerId(input.sellerId);apiKey=parseTrendyolSecret(input.apiKey);apiSecret=parseTrendyolSecret(input.apiSecret);}catch{invalid();}return write('/connect',{...settings(input),sellerId,apiKey,apiSecret},operationId);},
    async settings(input:TrendyolSettingsInput,operationId:string){return write('/settings',settings(input),operationId);},
    async map(input:TrendyolListingInput,operationId:string){let body:TrendyolListingInput;try{body=parseTrendyolListingInput(input);}catch{invalid();}return write('/products',body,operationId);},
    sync:(operationId:string)=>write('/sync',{},operationId),
    async disconnect(input:Readonly<{expectedVersion:number}>,operationId:string){return write('/disconnect',{expectedVersion:version(input.expectedVersion)},operationId);},
  });
}
export type TrendyolClient = ReturnType<typeof createTrendyolClient>;
export const trendyolClient = createTrendyolClient();
