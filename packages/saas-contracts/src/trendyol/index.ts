/** Shared, non-secret Trendyol panel contract. Money is cents; rates are basis points. */
export type TrendyolPricingRule = Readonly<{
  commissionBps:number; commissionVatIncluded:boolean; commissionVatBps:number;
  averageShippingCents:number; otherFeeCents:number; productVatBps:number;
  withholdingBps:number; coverWithholding:boolean; rounding:'cent'|'lira'|'ninety';
}>;
export const DEFAULT_TRENDYOL_PRICING:TrendyolPricingRule=Object.freeze({commissionBps:0,commissionVatIncluded:true,commissionVatBps:2000,averageShippingCents:0,otherFeeCents:0,productVatBps:2000,withholdingBps:100,coverWithholding:false,rounding:'cent'});
export type TrendyolPrice=Readonly<{salePriceCents:number;commissionCents:number;commissionVatCents:number;withholdingCents:number;shippingCents:number;otherFeeCents:number;expectedPaymentCents:number;targetCents:number}>;
export type TrendyolAttribute=Readonly<{attributeId:number;valueId?:number;value?:string}>;
export type TrendyolListingInput=Readonly<{variantId:string;barcode:string;categoryId:number|null;brandId:number|null;vatRate:number;dimensionalWeight:number;cargoProviderCode:string|null;attributes:readonly TrendyolAttribute[];enabled:boolean;mode:'existing'|'create'}>;
export type TrendyolOverview=Readonly<{
  connection:Readonly<{connected:boolean;sellerId:string|null;status:'disconnected'|'connected'|'needs_attention';version:number;lastOrdersAt:string|null;lastErrorCode:string|null}>;
  pricing:TrendyolPricingRule;counts:Readonly<{mapped:number;pending:number;failed:number}>;webhookUrl:string|null;
}>;
export type TrendyolProduct=Readonly<{productId:string;variantId:string;title:string;sku:string|null;barcode:string|null;webPriceCents:number|null;quantity:number;mapping:TrendyolListingInput|null;status:'not_configured'|'queued'|'submitted'|'active'|'failed'|'excluded';issue:string|null;updatedAt:string}>;
export type TrendyolProducts=Readonly<{items:readonly TrendyolProduct[];nextCursor:string|null}>;
export type TrendyolSaveResult=Readonly<{saved:true;replayed:boolean}>;
export const TRENDYOL_ERROR_CODES=['invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','not_connected','needs_reconnect','operation_mismatch','version_conflict','commit_unknown','unavailable','rate_limited','provider_rejected','mapping_required','stock_conflict','quota_blocked','stale'] as const;
export type TrendyolErrorCode=typeof TRENDYOL_ERROR_CODES[number];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MONEY_MAX=999_999_999_999;
function bad():never{throw new TypeError('trendyol_invalid');}
export function trendyolObject(value:unknown,keys:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))bad();
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(keys.some(k=>!Object.hasOwn(descriptors,k))||Reflect.ownKeys(descriptors).some(k=>typeof k!=='string'||![...keys,...optional].includes(k)))bad();
  const copy:Record<string,unknown>={};for(const [key,d]of Object.entries(descriptors)){if(!d.enumerable||!('value'in d))bad();copy[key]=d.value;}return copy;
}
export function trendyolInteger(value:unknown,min=0,max=MONEY_MAX):number{if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)bad();return value as number;}
export function trendyolUuid(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))bad();return value;}
function text(value:unknown,max=300):string{if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max||/[\x00-\x1f\x7f]/u.test(value))bad();return value;}
function date(value:unknown):string{const s=text(value,40);if(!/^\d{4}-\d\d-\d\dT/.test(s)||!Number.isFinite(Date.parse(s)))bad();return s;}
export function parseTrendyolSellerId(value:unknown):string{const s=text(value,20);if(!/^[1-9][0-9]{0,19}$/.test(s))bad();return s;}
export function parseTrendyolSecret(value:unknown):string{const s=text(value,256);if(!/^[\x21-\x39\x3b-\x7e]+$/.test(s))bad();return s;}
export function parseTrendyolPricingRule(value:unknown):TrendyolPricingRule{
  const v=trendyolObject(value,Object.keys(DEFAULT_TRENDYOL_PRICING));
  for(const key of['commissionBps','commissionVatBps','productVatBps','withholdingBps'])trendyolInteger(v[key],0,key==='commissionBps'||key==='withholdingBps'?9999:10000);
  for(const key of['averageShippingCents','otherFeeCents'])trendyolInteger(v[key]);
  if(typeof v.commissionVatIncluded!=='boolean'||typeof v.coverWithholding!=='boolean'||!['cent','lira','ninety'].includes(v.rounding as string))bad();
  const commission=BigInt(v.commissionBps as number)*(v.commissionVatIncluded?10000n:10000n+BigInt(v.commissionVatBps as number));
  const vat=10000n+BigInt(v.productVatBps as number);
  if(100000000n*vat-commission*vat-BigInt(v.withholdingBps as number)*100000000n<=0n)bad();
  return Object.freeze(v) as TrendyolPricingRule;
}
/** Cash target protection. This deliberately does not label retained cash as accounting profit. */
export function calculateTrendyolPrice(webPriceCents:number,input:TrendyolPricingRule):TrendyolPrice{
  trendyolInteger(webPriceCents,1);const r=parseTrendyolPricingRule(input);
  const web=BigInt(webPriceCents),shipping=BigInt(r.averageShippingCents),fee=BigInt(r.otherFeeCents),vat=10000n+BigInt(r.productVatBps);
  const c=BigInt(r.commissionBps),cv=BigInt(r.commissionVatBps),w=BigInt(r.withholdingBps);
  const denominator=100000000n*vat-c*(r.commissionVatIncluded?10000n:10000n+cv)*vat-(r.coverWithholding?w*100000000n:0n);
  if(denominator<=0n)bad();
  const ceil=(n:bigint,d:bigint)=>(n+d-1n)/d;
  const nearest=(n:bigint,d:bigint)=>(n+d/2n)/d;
  function round(p:bigint){if(r.rounding==='lira')return ceil(p,100n)*100n;if(r.rounding==='ninety')return p<=90n?90n:ceil(p-90n,100n)*100n+90n;return p;}
  let price=round(ceil((web+shipping+fee)*100000000n*vat,denominator));
  function amounts(p:bigint){const commission=nearest(p*c,10000n),commissionVat=r.commissionVatIncluded?0n:nearest(p*c*cv,100000000n),withholding=nearest(p*w,vat),before=p-commission-commissionVat-shipping-fee;return{commission,commissionVat,withholding,before,net:before-withholding};}
  let a=amounts(price);
  // Each actual rounded deduction can differ by half a cent from its rational value.
  for(let i=0;i<10&&(r.coverWithholding?a.net:a.before)<web;i++){price=round(price+1n);a=amounts(price);}
  if((r.coverWithholding?a.net:a.before)<web||price>BigInt(MONEY_MAX)||a.net<0n)bad();
  return Object.freeze({salePriceCents:Number(price),commissionCents:Number(a.commission),commissionVatCents:Number(a.commissionVat),withholdingCents:Number(a.withholding),shippingCents:r.averageShippingCents,otherFeeCents:r.otherFeeCents,expectedPaymentCents:Number(a.net),targetCents:webPriceCents});
}
export function parseTrendyolListingInput(value:unknown):TrendyolListingInput{
  const v=trendyolObject(value,['variantId','barcode','categoryId','brandId','vatRate','dimensionalWeight','cargoProviderCode','attributes','enabled','mode']);
  trendyolUuid(v.variantId);const barcode=text(v.barcode,40);if(!/^[A-Za-z0-9._-]+$/.test(barcode))bad();
  if(v.categoryId!==null)trendyolInteger(v.categoryId,1,2147483647);if(v.brandId!==null)trendyolInteger(v.brandId,1,2147483647);
  trendyolInteger(v.vatRate,0,100);if(typeof v.dimensionalWeight!=='number'||!Number.isFinite(v.dimensionalWeight)||v.dimensionalWeight<0.01||v.dimensionalWeight>1000)bad();
  if(v.cargoProviderCode!==null&&!/^[A-Z0-9_]{1,40}$/.test(text(v.cargoProviderCode,40)))bad();
  if(typeof v.enabled!=='boolean'||!['existing','create'].includes(v.mode as string)||!Array.isArray(v.attributes)||v.attributes.length>100)bad();
  if(v.mode==='create'&&(v.categoryId===null||v.brandId===null||v.cargoProviderCode===null))bad();
  const seen=new Set<number>();const attributes=v.attributes.map(a=>{const entry=trendyolObject(a,['attributeId'],['valueId','value']);const id=trendyolInteger(entry.attributeId,1,2147483647);if(seen.has(id)||Object.hasOwn(entry,'valueId')===Object.hasOwn(entry,'value'))bad();seen.add(id);return Object.freeze({attributeId:id,...(entry.valueId===undefined?{value:text(entry.value,300)}:{valueId:trendyolInteger(entry.valueId,1,2147483647)})});});
  return Object.freeze({...v,attributes:Object.freeze(attributes)}) as TrendyolListingInput;
}
export function parseTrendyolOverview(value:unknown):TrendyolOverview{
  const v=trendyolObject(value,['connection','pricing','counts','webhookUrl']);const c=trendyolObject(v.connection,['connected','sellerId','status','version','lastOrdersAt','lastErrorCode']);const counts=trendyolObject(v.counts,['mapped','pending','failed']);
  if(typeof c.connected!=='boolean'||!['disconnected','connected','needs_attention'].includes(c.status as string))bad();
  if(c.sellerId!==null)parseTrendyolSellerId(c.sellerId);if(c.lastOrdersAt!==null)date(c.lastOrdersAt);if(c.lastErrorCode!==null&&!/^[a-z0-9_]{1,80}$/.test(text(c.lastErrorCode,80)))bad();trendyolInteger(c.version,0,Number.MAX_SAFE_INTEGER);
  for(const amount of Object.values(counts))trendyolInteger(amount,0,Number.MAX_SAFE_INTEGER);
  if(v.webhookUrl!==null){const url=new URL(text(v.webhookUrl,2048));if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||/trendyol|dolap|localhost/i.test(url.href))bad();}
  return Object.freeze({connection:Object.freeze(c),pricing:parseTrendyolPricingRule(v.pricing),counts:Object.freeze(counts),webhookUrl:v.webhookUrl}) as TrendyolOverview;
}
export function parseTrendyolProducts(value:unknown):TrendyolProducts{
  const v=trendyolObject(value,['items','nextCursor']);if(!Array.isArray(v.items)||v.items.length>50)bad();if(v.nextCursor!==null)trendyolUuid(v.nextCursor);
  const items=v.items.map(value=>{
    const p=trendyolObject(value,['productId','variantId','title','sku','barcode','webPriceCents','quantity','mapping','status','issue','updatedAt']);trendyolUuid(p.productId);trendyolUuid(p.variantId);text(p.title,500);if(p.sku!==null)text(p.sku,128);if(p.barcode!==null)text(p.barcode,100);if(p.webPriceCents!==null)trendyolInteger(p.webPriceCents,1);trendyolInteger(p.quantity,0,2147483647);date(p.updatedAt);if(p.issue!==null)text(p.issue,500);if(!['not_configured','queued','submitted','active','failed','excluded'].includes(p.status as string))bad();
    const mapping=p.mapping===null?null:parseTrendyolListingInput(p.mapping);if(mapping&&mapping.variantId!==p.variantId)bad();return Object.freeze({...p,mapping}) as TrendyolProduct;
  });return Object.freeze({items:Object.freeze(items),nextCursor:v.nextCursor as string|null});
}
export function parseTrendyolSaveResult(value:unknown):TrendyolSaveResult{const v=trendyolObject(value,['saved','replayed'],['queued']);if(v.saved!==true||typeof v.replayed!=='boolean')bad();if(v.queued!==undefined)trendyolInteger(v.queued);return Object.freeze({saved:true,replayed:v.replayed});}
