export type StoreEngagementCampaignKind = 'popup' | 'cart_capture';
export type StoreEngagementImageReference = Readonly<{kind:'media';mediaId:string}> | Readonly<{kind:'asset';assetId:string}>;
export type StoreEngagementConfig = Readonly<{
  schemaVersion:1; template:'minimal'|'image_left'|'discount'; heading:string; body:string; buttonLabel:string;
  delaySeconds:number; repeatDays:number; devices:Readonly<{desktop:boolean;mobile:boolean}>;
  collectMode:'email'|'phone'|'either'; image?:StoreEngagementImageReference; marketingOptInLabel?:string; promotionId?:string;
}>;
export type StoreEngagementCampaign = Readonly<{id:string;kind:StoreEngagementCampaignKind;name:string;enabled:boolean;version:number;config:StoreEngagementConfig;updatedAt:string}>;
export type StoreEngagementPublicCampaign = StoreEngagementCampaign & Readonly<{imageUrl:string|null;couponCode:string|null}>;
export type StoreEngagementPublicSettings = Readonly<{popups:readonly StoreEngagementPublicCampaign[];cartCapture:StoreEngagementPublicCampaign|null}>;
export type StoreEngagementCaptureRequest = Readonly<{operationId:string;campaignId:string;email?:string;phone?:string;marketingConsent:boolean}>;
export type StoreEngagementCaptureResult = Readonly<{contactCaptured:boolean;couponCode:string|null}>;
export class StoreEngagementContractError extends Error {constructor(){super('store_engagement_contract_invalid');this.name='StoreEngagementContractError';}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function invalid():never{throw new StoreEngagementContractError();}
function exact(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(typeof value!=='object'||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();
  const record=value as Record<string,unknown>,allowed=new Set([...required,...optional]);
  if(required.some(key=>!Object.hasOwn(record,key))||Object.keys(record).some(key=>!allowed.has(key)))invalid();return record;
}
function text(value:unknown,min:number,max:number):string{if(typeof value!=='string'||value!==value.trim()||value.length<min||value.length>max||/[\u0000-\u001f\u007f-\u009f]/u.test(value))invalid();return value;}
function integer(value:unknown,min:number,max:number):number{if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)invalid();return value as number;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')invalid();return value;}
export function storeEngagementUuid(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))invalid();return value;}
function choice<T extends string>(value:unknown,values:readonly T[]):T{if(typeof value!=='string'||!values.includes(value as T))invalid();return value as T;}
function timestamp(value:unknown):string{const parsed=text(value,24,24);try{if(new Date(parsed).toISOString()!==parsed)invalid();}catch{invalid();}return parsed;}
export function normalizeStoreEngagementEmail(value:unknown):string{
  if(typeof value!=='string'||value.length>320||/[\u0000-\u001f\u007f-\u009f]/u.test(value))invalid();
  const parsed=value.trim().toLowerCase();if(parsed.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(parsed))invalid();return parsed;
}
export function normalizeStoreEngagementPhone(value:unknown):string{
  if(typeof value!=='string'||value.length>40||!/^\+?[\d ()-]+$/u.test(value.trim()))invalid();
  let parsed=value.trim().replace(/[ ()-]/gu,'');
  if(!parsed.startsWith('+')){if(/^0\d{10}$/u.test(parsed))parsed='+9'+parsed;else if(/^[2-5]\d{9}$/u.test(parsed))parsed='+90'+parsed;else if(/^90\d{10}$/u.test(parsed))parsed='+'+parsed;else invalid();}
  if(!/^\+[1-9]\d{7,14}$/u.test(parsed)||parsed.startsWith('+90')&&!/^\+90[2-5]\d{9}$/u.test(parsed))invalid();return parsed;
}
export function parseStoreEngagementConfig(value:unknown):StoreEngagementConfig{
  const row=exact(value,['schemaVersion','template','heading','body','buttonLabel','delaySeconds','repeatDays','devices','collectMode'],['image','marketingOptInLabel','promotionId']);
  if(row.schemaVersion!==1)invalid();const devices=exact(row.devices,['desktop','mobile']);
  const desktop=bool(devices.desktop),mobile=bool(devices.mobile);if(!desktop&&!mobile)invalid();
  let image:StoreEngagementImageReference|undefined;
  if(Object.hasOwn(row,'image')){const ref=exact(row.image,['kind'],['mediaId','assetId']);if(ref.kind==='media'){if(Object.keys(ref).length!==2||!Object.hasOwn(ref,'mediaId'))invalid();image=Object.freeze({kind:'media',mediaId:storeEngagementUuid(ref.mediaId)});}else if(ref.kind==='asset'){if(Object.keys(ref).length!==2||!Object.hasOwn(ref,'assetId'))invalid();image=Object.freeze({kind:'asset',assetId:storeEngagementUuid(ref.assetId)});}else invalid();}
  return Object.freeze({schemaVersion:1,template:choice(row.template,['minimal','image_left','discount']),heading:text(row.heading,1,120),body:text(row.body,0,1000),buttonLabel:text(row.buttonLabel,1,40),delaySeconds:integer(row.delaySeconds,0,120),repeatDays:integer(row.repeatDays,1,90),devices:Object.freeze({desktop,mobile}),collectMode:choice(row.collectMode,['email','phone','either']),...(image?{image}:{}),...(Object.hasOwn(row,'marketingOptInLabel')?{marketingOptInLabel:text(row.marketingOptInLabel,1,240)}:{}),...(Object.hasOwn(row,'promotionId')?{promotionId:storeEngagementUuid(row.promotionId)}:{})});
}
export function createDefaultStoreEngagementConfig(kind:StoreEngagementCampaignKind='popup'):StoreEngagementConfig{
  return parseStoreEngagementConfig({schemaVersion:1,template:'minimal',heading:kind==='cart_capture'?'Sepetinizi hatırlayalım':'Mağazamıza hoş geldiniz',body:'',buttonLabel:kind==='cart_capture'?'Kaydet':'Devam et',delaySeconds:kind==='cart_capture'?0:5,repeatDays:7,devices:{desktop:true,mobile:true},collectMode:'either'});
}
export function parseStoreEngagementCampaign(value:unknown):StoreEngagementCampaign{
  const row=exact(value,['id','kind','name','enabled','version','config','updatedAt']);
  return Object.freeze({id:storeEngagementUuid(row.id),kind:choice(row.kind,['popup','cart_capture']),name:text(row.name,1,160),enabled:bool(row.enabled),version:integer(row.version,1,Number.MAX_SAFE_INTEGER),config:parseStoreEngagementConfig(row.config),updatedAt:timestamp(row.updatedAt)});
}
function publicCampaign(value:unknown):StoreEngagementPublicCampaign{
  const row=exact(value,['id','kind','name','enabled','version','config','updatedAt','imageUrl','couponCode']);const {imageUrl,couponCode,...base}=row;
  const campaign=parseStoreEngagementCampaign(base);if(!campaign.enabled)invalid();
  if(imageUrl!==null){const url=text(imageUrl,1,2048);try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.hash)invalid();}catch{invalid();}}
  if(couponCode!==null&&(typeof couponCode!=='string'||!/^[A-Z0-9][A-Z0-9_-]{0,63}$/u.test(couponCode)))invalid();
  if(campaign.kind==='cart_capture'&&couponCode!==null)invalid();return Object.freeze({...campaign,imageUrl:imageUrl as string|null,couponCode:couponCode as string|null});
}
export function parseStoreEngagementPublicSettings(value:unknown):StoreEngagementPublicSettings{
  const row=exact(value,['popups','cartCapture']);if(!Array.isArray(row.popups)||row.popups.length>20)invalid();const popups=row.popups.map(publicCampaign);
  if(popups.some(item=>item.kind!=='popup')||new Set(popups.map(item=>item.id)).size!==popups.length)invalid();
  const cartCapture=row.cartCapture===null?null:publicCampaign(row.cartCapture);if(cartCapture&&cartCapture.kind!=='cart_capture')invalid();return Object.freeze({popups:Object.freeze(popups),cartCapture});
}
export function parseStoreEngagementCaptureRequest(value:unknown):StoreEngagementCaptureRequest{
  const row=exact(value,['operationId','campaignId','marketingConsent'],['email','phone']);if(!Object.hasOwn(row,'email')&&!Object.hasOwn(row,'phone'))invalid();
  return Object.freeze({operationId:storeEngagementUuid(row.operationId),campaignId:storeEngagementUuid(row.campaignId),marketingConsent:bool(row.marketingConsent),...(Object.hasOwn(row,'email')?{email:normalizeStoreEngagementEmail(row.email)}:{}),...(Object.hasOwn(row,'phone')?{phone:normalizeStoreEngagementPhone(row.phone)}:{})});
}
export function parseStoreEngagementCaptureResult(value:unknown):StoreEngagementCaptureResult{
  const row=exact(value,['contactCaptured','couponCode']);if(row.couponCode!==null&&(typeof row.couponCode!=='string'||!/^[A-Z0-9][A-Z0-9_-]{0,63}$/u.test(row.couponCode)))invalid();return Object.freeze({contactCaptured:bool(row.contactCaptured),couponCode:row.couponCode as string|null});
}
