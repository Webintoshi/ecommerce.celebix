import {parseStorefrontAsset} from '@celebix/saas-contracts';
import type { NativeMarketingTemplate, NativeMarketingCampaign, NativeMarketingOverview, NativeMarketingProduct, NativeMarketingSettings } from '@celebix/saas-data';
import { campaignContent,parseMarketingCommand,record,text,uuid,type MarketingCommand } from './model.ts';
const ROOT='/api/marketing/native-email';
export class NativeMarketingUiError extends Error{constructor(readonly code:string){super(code);this.name='NativeMarketingUiError';}}
const integer=(v:unknown)=>{if(!Number.isSafeInteger(v)||Number(v)<0)throw TypeError('invalid_input');return Number(v);};
const boolean=(v:unknown)=>{if(typeof v!=='boolean')throw TypeError('invalid_input');return v;};
const date=(v:unknown)=>{const result=text(v,80);if(!Number.isFinite(Date.parse(result)))throw TypeError('invalid_input');return result;};
const url=(v:unknown)=>{const result=text(v,2048);if(!/^https?:\/\//i.test(result))throw TypeError('invalid_input');return result;};
function settings(value:unknown):NativeMarketingSettings{const v=record(value);if(v.firstDelayMinutes!==60||v.secondDelayMinutes!==1440)throw TypeError('invalid_input');return {enabled:boolean(v.enabled),cartReminderEnabled:boolean(v.cartReminderEnabled),secondCartReminderEnabled:boolean(v.secondCartReminderEnabled),firstDelayMinutes:60,secondDelayMinutes:1440,version:integer(v.version)};}
function campaign(value:unknown):NativeMarketingCampaign{const v=record(value);if(!['cart','new_products','offer','welcome'].includes(String(v.templateId))||!['scheduled','queued','sending','completed','cancelled'].includes(String(v.status)))throw TypeError('invalid_input');return {id:uuid(v.id),name:text(v.name,200),templateId:v.templateId as NativeMarketingCampaign['templateId'],status:v.status as NativeMarketingCampaign['status'],scheduledAt:date(v.scheduledAt),recipientCount:integer(v.recipientCount),sentCount:integer(v.sentCount),failedCount:integer(v.failedCount),version:integer(v.version),isTest:boolean(v.isTest)};}
function product(value:unknown):NativeMarketingProduct{const v=record(value);return {id:uuid(v.id),title:text(v.title,500),url:url(v.url),...(v.imageUrl?{imageUrl:url(v.imageUrl)}:{}),priceCents:integer(v.priceCents),currency:text(v.currency,3)};}
export type NativeMarketingWorkspace = NativeMarketingOverview & Readonly<{configured:true;senderEmail:string;storeId?:string}>;
export function parseNativeMarketingOverview(value:unknown):NativeMarketingWorkspace{
 const v=record(value),b=record(v.branding),q=record(v.quota),s=record(v.summary),skips=record(v.skippedReasonCounts);
 if(!Array.isArray(v.templates)||v.templates.length>4||!Array.isArray(v.campaigns)||v.campaigns.length>200||!/^#[\da-f]{6}$/i.test(String(b.accentColor)))throw TypeError('invalid_input');
 if(v.configured!==true||!/^noreply@[^\s@]+\.[^\s@]+$/.test(String(v.senderEmail)))throw TypeError('invalid_input');
 return {configured:true,senderEmail:String(v.senderEmail),...(v.storeId===undefined?{}:{storeId:uuid(v.storeId)}),settings:settings(v.settings),branding:{storeName:text(b.storeName,200),...(b.logoUrl?{logoUrl:url(b.logoUrl)}:{}),accentColor:String(b.accentColor),storeUrl:url(b.storeUrl),supportUrl:url(b.supportUrl),...(b.postalAddress?{postalAddress:text(b.postalAddress,1000)}:{})},quota:{limit:integer(q.limit),used:integer(q.used),reserved:integer(q.reserved),remaining:integer(q.remaining),periodEndsAt:date(q.periodEndsAt)},eligibleRecipientCount:integer(v.eligibleRecipientCount),skippedReasonCounts:Object.fromEntries(Object.entries(skips).map(([k,n])=>[k,integer(n)])),templates:v.templates.map(item=>{const t=record(item);if(!['cart','new_products','offer','welcome'].includes(String(t.id)))throw TypeError('invalid_input');return {...campaignContent(t),id:t.id as NativeMarketingOverview['templates'][number]['id'],version:integer(t.version)};}),campaigns:v.campaigns.map(campaign),summary:{queued:integer(s.queued),sent:integer(s.sent),failed:integer(s.failed),suppressed:integer(s.suppressed)}};
}
function template(value:unknown):NativeMarketingTemplate{const v=record(value);if(!['cart','new_products','offer','welcome'].includes(String(v.id)))throw TypeError('invalid_input');return {...campaignContent(v),id:v.id as NativeMarketingTemplate['id'],version:integer(v.version)};}
export type NativeMarketingPreview=Readonly<{subject:string;html:string;text:string;from:string;products?:readonly NativeMarketingProduct[]}>;
export function createNativeMarketingApi(fetcher:typeof fetch=fetch){
 async function request<T>(path:string,parse:(v:unknown)=>T,body?:unknown,operationId?:string):Promise<T>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30_000);
  try{let response:Response;try{response=await fetcher(`${ROOT}${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,headers:body===undefined?{}:{'content-type':'application/json',...(operationId?{'idempotency-key':uuid(operationId)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}catch{throw new NativeMarketingUiError(operationId?'outcome_unknown':'unavailable');}
   let value:unknown;try{value=await response.json();}catch{throw new NativeMarketingUiError(operationId?'outcome_unknown':'invalid_response');}
   if(!response.ok){const code=value&&typeof value==='object'&&'code' in value?value.code:undefined;throw new NativeMarketingUiError(typeof code==='string'&&/^[a-z_]{1,80}$/.test(code)?code:operationId?'outcome_unknown':'unavailable');}
   try{return parse(value);}catch{throw new NativeMarketingUiError(operationId?'outcome_unknown':'invalid_response');}
  }finally{clearTimeout(timeout);}
 }
 return {
  overview:()=>request('',parseNativeMarketingOverview),
  assets:async()=>{const response=await fetcher('/api/storefront-assets?kind=hero',{credentials:'same-origin',cache:'no-store',redirect:'error'});if(!response.ok)throw new NativeMarketingUiError('unavailable');const value=record(await response.json());if(!Array.isArray(value.assets))throw new NativeMarketingUiError('invalid_response');return value.assets.map(parseStorefrontAsset).filter(asset=>asset.kind==='hero'&&asset.status==='active');},
  products:(query='',cursor?:string)=>request(`/products?${new URLSearchParams({q:query.trim().slice(0,120),...(cursor?{cursor}:{})})}`,value=>{const v=record(value);if(!Array.isArray(v.items)||v.items.length>20)throw TypeError('invalid_input');return {items:v.items.map(product),nextCursor:v.nextCursor==null?null:text(v.nextCursor,2048)};}),
  preview:(body:Readonly<Record<string,unknown>>)=>request('/preview',value=>{const v=record(value);return {subject:text(v.subject,200),html:text(v.html,512_000),text:text(v.text,30_000),from:text(v.from,500),...(v.products===undefined?{}:{products:Array.isArray(v.products)&&v.products.length<=8?v.products.map(product):(()=>{throw TypeError('invalid_input');})()})} as NativeMarketingPreview;},body),
  execute:(input:MarketingCommand)=>{const command=parseMarketingCommand(input);const path=command.kind==='template'?'/templates':command.kind==='cart-settings'?'/cart-settings':command.kind==='cancel'?`/campaigns/${uuid(command.campaignId)}/cancel`:command.kind==='test'?'/test':`/campaigns/${command.kind}`;return request<NativeMarketingSettings|NativeMarketingCampaign|NativeMarketingTemplate>(path,command.kind==='template'?template:command.kind==='cart-settings'?settings:campaign,command.body,command.operationId);},
 };
}
export type NativeMarketingApi=ReturnType<typeof createNativeMarketingApi>;
