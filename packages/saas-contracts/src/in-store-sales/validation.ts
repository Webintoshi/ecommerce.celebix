import {IN_STORE_SALE_STATUSES,type InStoreDiscount,type InStoreSaleIntent,type InStoreProduct,type InStoreSaleLine,type InStoreSale,type InStoreSaleResult,type InStoreBootstrap,type InStoreSalePage,type InStoreStaffGrant} from './types.ts';
import {calculateInStoreTotals} from './calculation.ts';

export function inStoreContractInvalid():never {throw new TypeError('in_store_contract_invalid');}
function bad():never {return inStoreContractInvalid();}
export function exactInStoreRecord(value:unknown, keys:readonly string[]):Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) bad();
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length!==keys.length || keys.some(key=>!Object.hasOwn(descriptors,key) || !('value' in descriptors[key]!))) bad();
  return value as Record<string,unknown>;
}
function text(value:unknown,min:number,max:number,multiline=false):string {
  if(typeof value!=='string'||value.length<min||value.length>max||value!==value.trim()||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(value))bad();
  return value;
}
export function parseInStoreUuid(value:unknown):string {
  const result=text(value,36,36); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result))bad(); return result;
}
export function parseInStoreInteger(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number {
  if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)bad();return value as number;
}
function bool(value:unknown):boolean {if(typeof value!=='boolean')bad();return value;}
function nullable<T>(value:unknown,parse:(value:unknown)=>T):T|null {return value===null?null:parse(value);}
function freeze<T>(value:T):Readonly<T>{if(value&&typeof value==='object'){Object.values(value).forEach(item=>{if(item&&typeof item==='object'&&!Object.isFrozen(item))freeze(item);});Object.freeze(value);}return value;}
function array<T>(value:unknown,max:number,parse:(entry:unknown)=>T):readonly T[] {
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)bad();
  const result:T[]=[];
  for(let i=0;i<value.length;i++){const descriptor=Object.getOwnPropertyDescriptor(value,String(i));if(!descriptor||!('value'in descriptor))bad();result.push(parse(descriptor.value));}
  return freeze(result);
}
function time(value:unknown):string {
  const result=text(value,24,27); if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(result))bad();
  const normalized=result.replace(/(\.\d{3})\d{3}Z$/,'$1Z');const date=new Date(normalized);if(!Number.isFinite(date.getTime())||date.toISOString()!==normalized)bad();return result;
}
function image(value:unknown):string {const result=text(value,1,2048);if(!/^https:\/\//.test(result)&&!/^\/(?!\/)/.test(result))bad();return result;}
export function parseInStoreDiscount(value:unknown):InStoreDiscount|null {
  if(value===null)return null;
  if(!value||typeof value!=='object')bad();
  const kind=Object.getOwnPropertyDescriptor(value,'kind');if(!kind||!('value'in kind))bad();
  if(kind.value==='percentage'){const d=exactInStoreRecord(value,['kind','percentageBps']);return freeze({kind:'percentage',percentageBps:parseInStoreInteger(d.percentageBps,1,9999)});}
  if(kind.value==='fixed_amount'){const d=exactInStoreRecord(value,['kind','amountCents']);return freeze({kind:'fixed_amount',amountCents:parseInStoreInteger(d.amountCents,1)});}
  return bad();
}
export function parseInStoreSaleIntent(value:unknown):Readonly<InStoreSaleIntent> {
  const r=exactInStoreRecord(value,['locationId','items','discount','customerName','note']);
  const items=array(r.items,100,value=>{const item=exactInStoreRecord(value,['variantId','quantity']);return freeze({variantId:parseInStoreUuid(item.variantId),quantity:parseInStoreInteger(item.quantity,1,9999)});});
  if(new Set(items.map(item=>item.variantId)).size!==items.length)bad();
  return freeze({locationId:parseInStoreUuid(r.locationId),items,discount:parseInStoreDiscount(r.discount),customerName:nullable(r.customerName,v=>text(v,1,200)),note:nullable(r.note,v=>text(v,1,2000,true))});
}
export function parseInStoreProduct(value:unknown):Readonly<InStoreProduct> {
  const r=exactInStoreRecord(value,['productId','variantId','productName','variantName','sku','barcode','imageUrl','unitPriceCents','pricingUnavailable','availableQuantity','stockTracking','discountEligible']);
  const unitPriceCents=nullable(r.unitPriceCents,v=>parseInStoreInteger(v));const pricingUnavailable=bool(r.pricingUnavailable);
  if(pricingUnavailable!==(unitPriceCents===null))bad();
  return freeze({productId:parseInStoreUuid(r.productId),variantId:parseInStoreUuid(r.variantId),productName:text(r.productName,1,200),variantName:text(r.variantName,0,200),sku:nullable(r.sku,v=>text(v,1,128)),barcode:nullable(r.barcode,v=>text(v,1,128)),imageUrl:nullable(r.imageUrl,image),unitPriceCents,pricingUnavailable,availableQuantity:parseInStoreInteger(r.availableQuantity),stockTracking:bool(r.stockTracking),discountEligible:bool(r.discountEligible)});
}
function parseLine(value:unknown):Readonly<InStoreSaleLine> {
  const r=exactInStoreRecord(value,['productId','variantId','productName','variantName','sku','barcode','imageUrl','unitPriceCents','quantity','discountEligible','lineSubtotalCents','allocatedDiscountCents','lineNetCents']);
  const unitPriceCents=parseInStoreInteger(r.unitPriceCents);const quantity=parseInStoreInteger(r.quantity,1,9999);const lineSubtotalCents=parseInStoreInteger(r.lineSubtotalCents);const allocatedDiscountCents=parseInStoreInteger(r.allocatedDiscountCents);const lineNetCents=parseInStoreInteger(r.lineNetCents);const discountEligible=bool(r.discountEligible);
  if(BigInt(unitPriceCents)*BigInt(quantity)!==BigInt(lineSubtotalCents)||lineNetCents!==lineSubtotalCents-allocatedDiscountCents||(!discountEligible&&allocatedDiscountCents!==0))bad();
  return freeze({productId:parseInStoreUuid(r.productId),variantId:parseInStoreUuid(r.variantId),productName:text(r.productName,1,200),variantName:text(r.variantName,0,200),sku:nullable(r.sku,v=>text(v,1,128)),barcode:nullable(r.barcode,v=>text(v,1,128)),imageUrl:nullable(r.imageUrl,image),unitPriceCents,quantity,discountEligible,lineSubtotalCents,allocatedDiscountCents,lineNetCents});
}
export function parseInStoreSale(value:unknown):Readonly<InStoreSale> {
  const r=exactInStoreRecord(value,['id','saleNumber','status','version','locationId','locationName','ownerMembershipId','ownerLabel','customerName','note','discount','items','totals','createdAt','updatedAt','paymentReceivedAt','completedAt','orderId','orderNumber']);
  const status=text(r.status,1,32);if(!IN_STORE_SALE_STATUSES.includes(status as never))bad();
  const items=array(r.items,100,parseLine);if(new Set(items.map(item=>item.variantId)).size!==items.length)bad();
  const discount=parseInStoreDiscount(r.discount);const totals=calculateInStoreTotals(items,discount);
  const rawTotals=exactInStoreRecord(r.totals,['subtotalCents','eligibleSubtotalCents','discountCents','totalCents']);
  if(Object.entries(totals).some(([key,total])=>rawTotals[key]!==total)||items.reduce((sum,item)=>sum+BigInt(item.allocatedDiscountCents),0n)!==BigInt(totals.discountCents))bad();
  const createdAt=time(r.createdAt);const updatedAt=time(r.updatedAt);const paymentReceivedAt=nullable(r.paymentReceivedAt,time);const completedAt=nullable(r.completedAt,time);const orderId=nullable(r.orderId,parseInStoreUuid);const orderNumber=nullable(r.orderNumber,v=>text(v,1,64));
  const paid=status==='payment_received'||status==='completed';const completed=status==='completed';
  if(new Date(updatedAt)<new Date(createdAt)||paid!==(paymentReceivedAt!==null)||completed!==(completedAt!==null)||completed!==(orderNumber!==null)||(!completed&&orderId!==null)||(paid&&totals.totalCents===0)||(['payment_pending','payment_received','completed'].includes(status)&&items.length===0))bad();
  if((paymentReceivedAt!==null&&(new Date(paymentReceivedAt)<new Date(createdAt)||new Date(paymentReceivedAt)>new Date(updatedAt)))||(completedAt!==null&&(new Date(completedAt)<new Date(paymentReceivedAt!)||new Date(completedAt)>new Date(updatedAt))))bad();
  return freeze({id:parseInStoreUuid(r.id),saleNumber:text(r.saleNumber,1,64),status:status as InStoreSale['status'],version:parseInStoreInteger(r.version,1),locationId:parseInStoreUuid(r.locationId),locationName:text(r.locationName,1,200),ownerMembershipId:parseInStoreUuid(r.ownerMembershipId),ownerLabel:text(r.ownerLabel,1,320),customerName:nullable(r.customerName,v=>text(v,1,200)),note:nullable(r.note,v=>text(v,1,2000,true)),discount,items,totals,createdAt,updatedAt,paymentReceivedAt,completedAt,orderId,orderNumber});
}
export function parseInStoreSaleResult(value:unknown):Readonly<InStoreSaleResult> {
  const r=exactInStoreRecord(value,['sale','replayed','priceChanged']);return freeze({sale:parseInStoreSale(r.sale),replayed:bool(r.replayed),priceChanged:bool(r.priceChanged)});
}
export function parseInStoreBootstrap(value:unknown):Readonly<InStoreBootstrap> {
  const r=exactInStoreRecord(value,['scopeKey','locations','permissions','activeDraft','heldSales','pendingSales','recentSales','summary']);
  const p=exactInStoreRecord(r.permissions,['canSell','canDiscount','discountLimitBps','canResolve','canManageStaff']);
  const permissions={canSell:bool(p.canSell),canDiscount:bool(p.canDiscount),discountLimitBps:parseInStoreInteger(p.discountLimitBps,0,9999),canResolve:bool(p.canResolve),canManageStaff:bool(p.canManageStaff)};
  const locations=array(r.locations,1000,v=>{const l=exactInStoreRecord(v,['id','name','isDefault']);return freeze({id:parseInStoreUuid(l.id),name:text(l.name,1,200),isDefault:bool(l.isDefault)});});if(new Set(locations.map(l=>l.id)).size!==locations.length)bad();
  const summary=exactInStoreRecord(r.summary,['completedCount','grossCents','discountCents','netCents','pendingPaymentCount']);
  const parsedSummary={completedCount:parseInStoreInteger(summary.completedCount),grossCents:parseInStoreInteger(summary.grossCents),discountCents:parseInStoreInteger(summary.discountCents),netCents:parseInStoreInteger(summary.netCents),pendingPaymentCount:parseInStoreInteger(summary.pendingPaymentCount)};
  if(parsedSummary.netCents!==parsedSummary.grossCents-parsedSummary.discountCents)bad();
  const activeDraft=nullable(r.activeDraft,parseInStoreSale);const heldSales=array(r.heldSales,100,parseInStoreSale);const pendingSales=array(r.pendingSales,100,parseInStoreSale);const recentSales=array(r.recentSales,100,parseInStoreSale);
  if((activeDraft&&activeDraft.status!=='draft')||heldSales.some(s=>s.status!=='held')||pendingSales.some(s=>!['payment_pending','payment_received'].includes(s.status))||recentSales.some(s=>s.status!=='completed'))bad();
  return freeze({scopeKey:text(r.scopeKey,1,256),locations,permissions,activeDraft,heldSales,pendingSales,recentSales,summary:parsedSummary});
}
export function parseInStoreSalePage(value:unknown):Readonly<InStoreSalePage> {const r=exactInStoreRecord(value,['sales','nextCursor']);return freeze({sales:array(r.sales,50,parseInStoreSale),nextCursor:nullable(r.nextCursor,v=>text(v,1,512))});}
export function parseInStoreStaffGrant(value:unknown):Readonly<InStoreStaffGrant> {
  const r=exactInStoreRecord(value,['membershipId','label','role','enabled','locationIds','discountLimitBps','version']);const locationIds=array(r.locationIds,1000,parseInStoreUuid);if(new Set(locationIds).size!==locationIds.length)bad();
  return freeze({membershipId:parseInStoreUuid(r.membershipId),label:text(r.label,1,320),role:text(r.role,1,32),enabled:bool(r.enabled),locationIds,discountLimitBps:parseInStoreInteger(r.discountLimitBps,0,9999),version:parseInStoreInteger(r.version,0)});
}
