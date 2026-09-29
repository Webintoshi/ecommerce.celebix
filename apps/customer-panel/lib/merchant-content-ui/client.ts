import {parseMerchantContentDocument,parseMerchantContentOrigins,parseSaveMerchantContentRequest,type MerchantContentDocument,type MerchantContentKind,type MerchantContentVersion,type SaveMerchantContentRequest} from '@celebix/saas-contracts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODES=['invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','record_not_found','invalid_transition','version_conflict','operation_mismatch','operation_not_found','durable_authority_invalid','unavailable','history_unavailable','commit_unknown'] as const;
type Code=typeof CODES[number];
const MESSAGES:Readonly<Record<Code,string>>={invalid_input:'Gönderilen içerik geçersiz.',unauthenticated:'Oturum açmanız gerekiyor.',membership_denied:'Bu içeriğe erişim izniniz yok.',store_inactive:'Mağaza şu anda kullanılamıyor.',feature_not_enabled:'İçerik özelliği kullanılamıyor.',record_not_found:'İçerik bulunamadı.',invalid_transition:'Bu yayın durumu kullanılamıyor.',version_conflict:'İçerik başka bir yerde değişti. Taslağınız korunuyor.',operation_mismatch:'Kaydetme işlemi çakıştı. Taslağınız korunuyor.',operation_not_found:'Kaydetme işlemi bulunamadı.',durable_authority_invalid:'İçerik yetkisi değişti.',unavailable:'İçerik hizmetine ulaşılamıyor.',history_unavailable:'Bu sürümün eski metni geri getirilemiyor.',commit_unknown:'Kaydın sonucu doğrulanamadı. Yeniden göndermeden önce içeriği kontrol edin.'};
export class MerchantContentApiError extends Error{constructor(readonly code:Code,readonly status:number){super(MESSAGES[code]);this.name='MerchantContentApiError';}}
function invalid():never{throw new TypeError('merchant_content_client_invalid');}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();const actual=Reflect.ownKeys(value);if(actual.length!==keys.length||actual.some(key=>typeof key!=='string'||!keys.includes(key as string))||keys.some(key=>!Object.hasOwn(value,key)))invalid();return value as Record<string,unknown>;}
function exactResponse(value:unknown,keys:readonly string[]){try{return exact(value,keys);}catch{throw new MerchantContentApiError('unavailable',503);}}
function kind(value:MerchantContentKind){if(value!=='blog_post'&&value!=='page')invalid();return value;}
function id(value:string){if(typeof value!=='string'||!UUID.test(value))invalid();return value;}
function positive(value:number,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(value)||value<1||value>max)invalid();return value;}
async function json(response:Response){if(response.headers.get('content-type')?.split(';',1)[0]!=='application/json')throw new MerchantContentApiError('unavailable',503);try{return await response.json() as unknown;}catch{throw new MerchantContentApiError('unavailable',503);}}
function parsedDocument(value:unknown,expected?:Readonly<{kind:MerchantContentKind;id?:string}>):MerchantContentDocument{let result;try{result=parseMerchantContentDocument(value);}catch{throw new MerchantContentApiError('unavailable',503);}if(expected&&(result.kind!==expected.kind||(expected.id!==undefined&&result.id!==expected.id)))throw new MerchantContentApiError('unavailable',503);return result;}
function version(value:unknown,expected:Readonly<{kind:MerchantContentKind;id:string}>):MerchantContentVersion{
  try{
    const r=exact(value,['recordId','kind','version','values','status','bodyFormat','origins','savedAt']);
    if(r.recordId!==expected.id||r.kind!==expected.kind||typeof r.version!=='number')invalid();
    const fields=exact(r.values,['name','slug','locale','body','excerpt','seoTitle','seoDescription','published']);
    const savedAt=r.savedAt;
    const doc=parseMerchantContentDocument({...fields,id:r.recordId,kind:r.kind,status:r.status,version:r.version,publishedAt:null,createdAt:savedAt,updatedAt:savedAt,bodyFormat:r.bodyFormat,bodyDigest:`sha256:${'0'.repeat(64)}`,origins:r.origins});
    return Object.freeze({recordId:doc.id,kind:doc.kind,version:doc.version,values:Object.freeze({name:doc.name,slug:doc.slug,locale:doc.locale,body:doc.body,excerpt:doc.excerpt,seoTitle:doc.seoTitle,seoDescription:doc.seoDescription,published:doc.published}),status:doc.status,bodyFormat:doc.bodyFormat,origins:parseMerchantContentOrigins(r.origins),savedAt:doc.updatedAt});
  }catch{throw new MerchantContentApiError('unavailable',503);}
}
export function createMerchantContentApi(fetcher:typeof fetch=fetch,uuid:()=>string=crypto.randomUUID.bind(crypto)){
  async function request(path:string,init?:RequestInit){let response:Response;try{response=await fetcher(path,{credentials:'same-origin',cache:'no-store',...init});}catch{throw new MerchantContentApiError('unavailable',503);}const value=await json(response);if(!response.ok){const candidate=exactError(value);throw new MerchantContentApiError(candidate,response.status);}return value;}
  return Object.freeze({
    async get(recordKind:MerchantContentKind,recordId:string){const selected=kind(recordKind),selectedId=id(recordId);return parsedDocument(await request(`/api/merchant-content/${selected}/${selectedId}`),{kind:selected,id:selectedId});},
    async save(value:SaveMerchantContentRequest,operationId?:string){const input=parseSaveMerchantContentRequest(value),op=id(operationId??uuid());const response=exactResponse(await request(`/api/merchant-content/${input.kind}`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':op},body:JSON.stringify(input)}),['document','replayed']);if(typeof response.replayed!=='boolean')throw new MerchantContentApiError('unavailable',503);return Object.freeze({document:parsedDocument(response.document,{kind:input.kind,...(input.recordId===null?{}:{id:input.recordId})}),replayed:response.replayed});},
    async versions(recordKind:MerchantContentKind,recordId:string,options:Readonly<{limit:number;beforeVersion?:number}>){const selected=kind(recordKind),selectedId=id(recordId),limit=positive(options.limit,50);const query=new URLSearchParams({limit:String(limit)});if(options.beforeVersion!==undefined)query.set('beforeVersion',String(positive(options.beforeVersion)));const response=exactResponse(await request(`/api/merchant-content/${selected}/${selectedId}/versions?${query}`),['items']);if(!Array.isArray(response.items)||response.items.length>limit)throw new MerchantContentApiError('unavailable',503);return Object.freeze(response.items.map(item=>version(item,{kind:selected,id:selectedId})));},
  });
}
function exactError(value:unknown):Code{try{const code=exact(value,['code']).code;return typeof code==='string'&&(CODES as readonly string[]).includes(code)?code as Code:'unavailable';}catch{return 'unavailable';}}
export const merchantContentApi=createMerchantContentApi();
