import {parseNativeMarketingContent,parseNativeMarketingDraftContent,isNativeMarketingBlockContent,nativeMarketingProductIds,legacyNativeMarketingBlocks} from '@celebix/saas-data/native-marketing-document';
import type { NativeMarketingBlock, NativeMarketingBlockContent, NativeMarketingContent, NativeMarketingTemplateId } from '@celebix/saas-data';

export type MarketingCommandKind='send'|'schedule'|'test'|'cancel'|'cart-settings'|'template';
export type MarketingCommand=Readonly<{kind:MarketingCommandKind;operationId:string;body:Readonly<Record<string,unknown>>;campaignId?:string}>;
export type MarketingDraft=Readonly<NativeMarketingContent & {templateId:Exclude<NativeMarketingTemplateId,'cart'>;name:string;productIds:readonly string[];scheduledAt:string;recipient:string}>;
export type MarketingCheckpoint=Readonly<{schemaVersion:1;savedAt:number;pending?:MarketingCommand;draft?:MarketingDraft}>;
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const MARKETING_TEMPLATE_LABELS={new_products:'Yeni ürünler',offer:'Kampanya',welcome:'Hoş geldin',cart:'Sepet hatırlatması'} as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGE=86_400_000;
const key=(scope:string)=>{if(!scope||scope.length>256)throw TypeError('invalid_scope');return `celebix:native-marketing:v1:${scope}`;};
export function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw TypeError('invalid_input');return value as Record<string,unknown>;}
export function text(value:unknown,max=2000):string{if(typeof value!=='string'||value.length>max)throw TypeError('invalid_input');return value;}
export function uuid(value:unknown):string{const valueText=text(value,36);if(!UUID.test(valueText))throw TypeError('invalid_input');return valueText;}
function freezeSnapshot<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freezeSnapshot);Object.freeze(value);}return value;}
function contentFields(value:unknown){const v=record(value);return {subject:v.subject,heading:v.heading,body:v.body,buttonLabel:v.buttonLabel,buttonPath:v.buttonPath,...(Object.hasOwn(v,'schemaVersion')?{schemaVersion:v.schemaVersion,blocks:v.blocks}:{})};}
export function campaignContent(value:unknown):NativeMarketingContent{const v=contentFields(value);if(v.schemaVersion===2){text(v.subject,160);return parseNativeMarketingContent(v);}return parseNativeMarketingContent({...v,subject:text(v.subject,160).trim(),heading:text(v.heading,160).trim(),body:text(v.body,4000).trim(),buttonLabel:text(v.buttonLabel,80).trim()});}
export function asMarketingBlockDraft(draft:MarketingDraft,id:()=>string=()=>crypto.randomUUID()):MarketingDraft & NativeMarketingBlockContent{if(isNativeMarketingBlockContent(draft))return draft;return {...draft,schemaVersion:2,blocks:[...legacyNativeMarketingBlocks(draft,id),...(draft.productIds.length?[{id:id(),type:'products' as const,productIds:draft.productIds,columns:2 as const}]:[])]};}
export function editMarketingBlocks(draft:MarketingDraft,blocks:readonly NativeMarketingBlock[]):MarketingDraft & NativeMarketingBlockContent{const content={...asMarketingBlockDraft(draft),blocks};return {...content,productIds:nativeMarketingProductIds(content)};}
export function createMarketingBlock(type:NativeMarketingBlock['type'],id:string,color:string):NativeMarketingBlock{switch(type){case 'heading':return {id,type,text:'Yeni başlık',align:'left',color,size:'large'};case 'text':return {id,type,text:'Mesajınızı yazın.',align:'left',color:'#292524'};case 'image':return {id,type,assetId:'',alt:'',linkPath:''};case 'image_text':return {id,type,assetId:'',alt:'',heading:'Yeni başlık',text:'Mesajınızı yazın.',buttonLabel:'İncele',buttonPath:'/products',imagePosition:'left'};case 'products':return {id,type,productIds:[],columns:2};case 'button':return {id,type,label:'Ürünleri incele',path:'/products',color,align:'left'};case 'banner':return {id,type,heading:'Size özel',text:'Duyurunuzu yazın.',backgroundColor:color,textColor:'#FFFFFF'};case 'divider':return {id,type,color:'#E7E5E4'};case 'spacer':return {id,type,height:24};}}
export function parseMarketingCommand(value:unknown):MarketingCommand{
 const v=record(value);const kind=text(v.kind,20) as MarketingCommandKind;if(!['send','schedule','test','cancel','cart-settings','template'].includes(kind))throw TypeError('invalid_input');
 const body=record(v.body),operationId=uuid(v.operationId);let campaignId:string|undefined;
 if(kind==='template'){
  const template=record(body.template);if(!['new_products','offer','welcome'].includes(String(template.id))||!Number.isSafeInteger(body.expectedVersion)||Number(body.expectedVersion)<1||template.version!==body.expectedVersion)throw TypeError('invalid_input');campaignContent(template);
 }else if(kind==='cart-settings'){
  if(!Number.isSafeInteger(body.expectedVersion)||Number(body.expectedVersion)<0||typeof body.enabled!=='boolean'||typeof body.cartReminderEnabled!=='boolean'||typeof body.secondCartReminderEnabled!=='boolean')throw TypeError('invalid_input');
 }else if(kind==='cancel'){
  campaignId=uuid(v.campaignId);if(!Number.isSafeInteger(body.expectedVersion)||Number(body.expectedVersion)<1)throw TypeError('invalid_input');
 }else{
  const template=text(body.templateId,30);if(!['new_products','offer','welcome',...(kind==='test'?['cart']:[])].includes(template)||!text(body.name,120).trim())throw TypeError('invalid_input');
  if(body.content!==undefined){const content=campaignContent(body.content);if(template==='cart'&&isNativeMarketingBlockContent(content))throw TypeError('invalid_input');if(isNativeMarketingBlockContent(content)&&JSON.stringify(nativeMarketingProductIds(content))!==JSON.stringify(body.productIds??[]))throw TypeError('invalid_input');}
  if(body.productIds!==undefined){if(!Array.isArray(body.productIds)||body.productIds.length>8||new Set(body.productIds).size!==body.productIds.length)throw TypeError('invalid_input');body.productIds.forEach(uuid);}
  if(kind==='schedule'&&(typeof body.scheduledAt!=='string'||!Number.isFinite(Date.parse(body.scheduledAt))))throw TypeError('invalid_input');
  if(kind==='test'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(body.recipient,254)))throw TypeError('invalid_input');
 }
 // Freeze a detached JSON snapshot so form changes can never rewrite an in-flight intent.
 return Object.freeze({kind,operationId,body:freezeSnapshot(JSON.parse(JSON.stringify(body))),...(campaignId?{campaignId}:{})});
}
export function draftInput(draft:MarketingDraft){return {name:draft.name.trim()||draft.subject.trim().slice(0,120),templateId:draft.templateId,content:campaignContent(draft),productIds:[...(isNativeMarketingBlockContent(draft)?nativeMarketingProductIds(draft):draft.productIds)]};}
export function writeMarketingCheckpoint(scope:string,value:MarketingCheckpoint,storage:StorageLike):boolean{
 try{const selected=key(scope);const encoded=JSON.stringify(value);if(encoded.length>48_000)return false;storage.setItem(selected,encoded);return storage.getItem(selected)===encoded;}catch{return false;}
}
export function readMarketingCheckpoint(scope:string,storage:StorageLike,now:number):MarketingCheckpoint|null{
 try{const encoded=storage.getItem(key(scope));if(!encoded||encoded.length>48_000)return null;const v=record(JSON.parse(encoded));if(v.schemaVersion!==1||typeof v.savedAt!=='number'||!Number.isFinite(v.savedAt)||(v.pending===undefined&&(v.savedAt>now+60_000||now-v.savedAt>MAX_AGE)))return null;
  const pending=v.pending===undefined?undefined:parseMarketingCommand(v.pending);let draft:MarketingDraft|undefined;
  if(v.draft!==undefined){try{const d=record(v.draft);if(!['new_products','offer','welcome'].includes(String(d.templateId))||!Array.isArray(d.productIds)||d.productIds.length>8)throw TypeError('invalid_input');draft={...parseNativeMarketingDraftContent(contentFields(d)),name:text(d.name,120),templateId:d.templateId as MarketingDraft['templateId'],productIds:d.productIds.map(uuid),scheduledAt:text(d.scheduledAt,80),recipient:text(d.recipient,254)};}catch{/* A damaged draft must never discard a valid pending operation. */}}
  return {schemaVersion:1,savedAt:v.savedAt,...(pending?{pending}:{}),...(draft?{draft}:{})};
 }catch{return null;}
}
export function clearMarketingCheckpoint(scope:string,storage:StorageLike):boolean{try{storage.removeItem(key(scope));return storage.getItem(key(scope))===null;}catch{return false;}}
export function marketingSessionStorage():StorageLike|null{try{return typeof window==='undefined'?null:window.sessionStorage;}catch{return null;}}
export function marketingErrorCode(error:unknown):string{return error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'?error.code:'unavailable';}
const MESSAGES:Record<string,string>={product_unavailable:'Seçili ürün artık kullanılamıyor. Ürün seçimini güncelleyin.',image_unavailable:'Seçili görsel artık kullanılamıyor. Yeni bir görsel seçin.',address_required:'Gönderim için mağazanızın posta adresini Genel ayarlardan tamamlayın.',invalid_schedule:'1 dakika ile 30 gün arasında bir gönderim zamanı seçin.',rate_limited:'Çok sık işlem yapıldı. Biraz bekleyip aynı işlemi kontrol edin.',already_sent:'Kampanya gönderilmeye başlandı. Artık iptal edilemez.',invalid_input:'Alanları kontrol edin. Girdiğiniz bilgiler korundu.',unauthorized:'Oturumunuz sona erdi. Yeniden giriş yapın.',unauthenticated:'Oturumunuz sona erdi. Yeniden giriş yapın.',forbidden:'Bu işlem için yetkiniz bulunmuyor.',feature_not_enabled:'Bu özellik mevcut paketinizde kullanılamıyor.',quota_exceeded:'E-posta gönderim sınırınız bu işlem için yeterli değil.',quota_reached:'E-posta gönderim sınırınız doldu.',not_configured:'E-posta gönderimi şu anda kullanılamıyor. Daha sonra tekrar deneyin.',version_conflict:'Ayarlar başka bir işlemde değişti. Güncel durumu yükleyip tekrar uygulayın.',operation_conflict:'İşlem bilgileri eşleşmedi. Son durumu kontrol edin.',outcome_unknown:'İşlemin sonucu henüz doğrulanamadı. Aynı işlemi tekrar kontrol edin; yeni gönderim başlatmayın.',storage_unavailable:'Güvenli işlem kaydı oluşturulamadı. Tarayıcıda oturum depolamasına izin verip tekrar deneyin.',invalid_response:'Güncel bilgiler alınamadı. Tekrar deneyin.',no_recipients:'Gönderime uygun e-posta abonesi bulunmuyor.',campaign_not_cancellable:'Bu kampanya artık iptal edilemiyor. Güncel durumu kontrol edin.'};
export function marketingErrorMessage(error:unknown):string{return MESSAGES[typeof error==='string'?error:marketingErrorCode(error)]??'İşlem tamamlanamadı. Bilgileriniz korundu; tekrar deneyin.';}
export function marketingDate(value:string):string{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(date):'—';}
export const MARKETING_STATUS_LABELS={scheduled:'Planlandı',queued:'Sırada',sending:'Gönderiliyor',completed:'Tamamlandı',cancelled:'İptal edildi'} as const;
