import { hasCommercialCapability, isMerchantActionAllowed, emailMarketingObject, emailMarketingUuid, type TenantContext } from '@celebix/saas-contracts';
import { NativeMarketingError, type NativeMarketingContent, type NativeMarketingTemplateId } from '@celebix/saas-data';
import {parseNativeMarketingContent,isNativeMarketingBlockContent,nativeMarketingProductIds} from '@celebix/saas-data/native-marketing-document';
import { renderNativeMarketingEmail } from '@celebix/saas-data/native-marketing-templates';
import { readOrderPanelSessionCookie } from '../order-http/request-input.ts';
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from '../panel-origin-authority.ts';
import { emailMarketingRequestBody, emailMarketingOperation } from '../email-marketing-http/request-input.ts';
import type { ServerNativeMarketingRuntime } from '../server-native-marketing/runtime.ts';

export const NATIVE_MARKETING_ROOT='/api/marketing/native-email';
type GetArea='overview'|'products';
type PostArea='preview'|'test'|'send'|'schedule'|'cancel'|'settings'|'template';
type Dependencies=Readonly<{resolveRuntime():Promise<ServerNativeMarketingRuntime|null>;now():Date;requestId():string}>;
type Authorized=Readonly<{runtime:ServerNativeMarketingRuntime;tenantContext:TenantContext;now:Date}>;
function scope(a:Authorized){return{tenantContext:a.tenantContext,now:a.now};}
const STATUS:Readonly<Record<string,number>>=Object.freeze({invalid_input:400,unauthorized:401,forbidden:403,feature_not_enabled:403,version_conflict:409,operation_conflict:409,quota_exceeded:409,no_recipients:409,image_unavailable:409,product_unavailable:409,campaign_not_found:404,not_found:404,already_sent:409,invalid_schedule:400,address_required:409,rate_limited:429,not_configured:503,unavailable:503,outcome_unknown:503});
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});}
function error(code:string,status:number){return json({code},status);}
function requestUrl(request:Request,path:string,query=false):URL {
  const u=new URL(request.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||u.pathname!==path||!query&&u.search)throw Error('invalid');
  for(const [h]of request.headers)if(h==='authorization'||h.startsWith('x-celebix')||['x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-url'].includes(h))throw Error('invalid');
  return u;
}
function text(value:unknown,max:number,multiline=false):string {
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u:/[\u0000-\u001f\u007f-\u009f]/u).test(value))throw Error('invalid');return value;
}
function integer(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<0)throw Error('invalid');return Number(value);}
function bool(value:unknown):boolean{if(typeof value!=='boolean')throw Error('invalid');return value;}
function template(value:unknown):NativeMarketingTemplateId{if(!['cart','new_products','offer','welcome'].includes(String(value)))throw Error('invalid');return value as NativeMarketingTemplateId;}
function content(value:unknown):NativeMarketingContent {
  const v=parseNativeMarketingContent(value);
  const buttonPath=text(v.buttonPath,512);if(!buttonPath.startsWith('/')||buttonPath.startsWith('//')||/[\\\s]/u.test(buttonPath)||/%(?:2f|5c|0[ad])/i.test(buttonPath))throw Error('invalid');
  text(v.subject,160);text(v.heading,160);text(v.body,4000,true);text(v.buttonLabel,80);
  return v;
}
function draft(value:unknown,required:readonly string[],optional:readonly string[]) {
  const v=emailMarketingObject(value,required,optional),templateId=template(v.templateId);
  let productIds:readonly string[]|undefined;
  if(Object.hasOwn(v,'productIds')){if(!Array.isArray(v.productIds)||v.productIds.length>8)throw Error('invalid');productIds=Object.freeze(v.productIds.map(emailMarketingUuid));if(new Set(productIds).size!==productIds.length)throw Error('invalid');}
  const parsed=Object.hasOwn(v,'content')?content(v.content):undefined;
  if(parsed&&isNativeMarketingBlockContent(parsed)){
    if(templateId==='cart')throw Error('invalid');
    const derived=nativeMarketingProductIds(parsed);
    if(JSON.stringify(derived)!==JSON.stringify(productIds??[]))throw Error('invalid');
    productIds=derived;
  }
  return {v,templateId,...(parsed?{content:parsed}:{}),...(productIds?{productIds}:{})};
}
async function authorize(deps:Dependencies,request:Request,method:'GET'|'POST',path:string,query=false,effect=true):Promise<Authorized|Response> {
  if(request.method!==method)return error('invalid_input',405);
  try{requestUrl(request,path,query);}catch{return error('invalid_input',400);}
  let runtime:ServerNativeMarketingRuntime|null;try{runtime=await deps.resolveRuntime();}catch{return error('not_configured',503);}if(!runtime)return error('not_configured',503);
  if(method==='POST'&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return error('forbidden',403);
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return error('unauthorized',401);
  let now:Date,access;try{now=deps.now();if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error();access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId:emailMarketingUuid(deps.requestId()),now});}catch{return error('unavailable',503);}
  if(access.kind==='unauthenticated')return error('unauthorized',401);if(access.kind==='unauthorized')return error('forbidden',403);if(access.kind!=='authenticated')return error('unavailable',503);
  const t=access.tenantContext;
  if(method==='POST'&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,t.store.slug))return error('forbidden',403);
  if(t.store.status!=='active'||t.membership.status!=='active'||!isMerchantActionAllowed(t.membership.role,method==='POST'&&effect?'integrations.manage':'integrations.read')||!hasCommercialCapability(t.entitlements,'email_marketing'))return error('forbidden',403);
  return{runtime,tenantContext:t,now};
}
async function execute(run:()=>Promise<unknown>){try{return json(await run());}catch(caught){const code=caught instanceof NativeMarketingError&&Object.hasOwn(STATUS,caught.code)?caught.code:'unavailable';return error(code,STATUS[code]!);}}

export function createNativeMarketingHttpHandlers(deps:Dependencies){return Object.freeze({
  async get(request:Request,area:GetArea){
    const path=area==='overview'?NATIVE_MARKETING_ROOT:NATIVE_MARKETING_ROOT+'/products';
    const a=await authorize(deps,request,'GET',path,area==='products');if(a instanceof Response)return a;
    if(area==='overview')return execute(async()=>({...await a.runtime.email.overview(scope(a)),configured:true,senderEmail:a.runtime.senderEmail,storeId:a.tenantContext.store.id}));
    let query:string|undefined;try{const p=new URL(request.url).searchParams;if([...p.keys()].some(k=>!['q','cursor'].includes(k)||p.getAll(k).length!==1)||p.has('cursor')&&p.get('cursor')!=='')throw Error();if(p.get('q'))query=text(p.get('q'),120);}catch{return error('invalid_input',400);}
    return execute(async()=>({items:await a.runtime.email.products({...scope(a),query,limit:20}),nextCursor:null}));
  },
  async post(request:Request,area:PostArea,campaignId?:string){
    const path=area==='preview'||area==='test'?NATIVE_MARKETING_ROOT+'/'+area:area==='settings'?NATIVE_MARKETING_ROOT+'/cart-settings':area==='template'?NATIVE_MARKETING_ROOT+'/templates':area==='cancel'?NATIVE_MARKETING_ROOT+'/campaigns/'+campaignId+'/cancel':NATIVE_MARKETING_ROOT+'/campaigns/'+(area==='send'?'send':'schedule');
    const a=await authorize(deps,request,'POST',path,false,area!=='preview');if(a instanceof Response)return a;
    let run:()=>Promise<unknown>;
    try{
      const body=await emailMarketingRequestBody(request);
      if(area==='preview'){
        const d=draft(body,['templateId'],['content','productIds']);
        run=async()=>{const projection=await a.runtime.email.preview({...scope(a),templateId:d.templateId,content:d.content,productIds:d.productIds});const unsubscribeUrl=a.runtime.publicOrigin+'/api/marketing/unsubscribe?token='+'p'.repeat(43);const recoveryUrl=projection.recoveryNeeded?projection.storefrontOrigin+'/cart/recover#token='+'p'.repeat(43):undefined;
          return{...renderNativeMarketingEmail({storeId:a.tenantContext.store.id,projection,unsubscribeUrl,recoveryUrl,postalAddress:projection.postalAddress??'Mağazanın kayıtlı işletme adresi'}),from:`${projection.senderLabel} <${a.runtime.senderEmail}>`,...(d.templateId==='cart'?{}:{products:projection.items.map(item=>({id:item.productId,title:item.productName,url:item.url,...(item.imageUrl?{imageUrl:item.imageUrl}:{}),priceCents:item.unitPriceCents,currency:item.currency}))})};};
      }else{
        const operationId=emailMarketingOperation(request);
        if(area==='template'){
          const v=emailMarketingObject(body,['expectedVersion','template']);
          const t=emailMarketingObject(v.template,['id','version','subject','heading','body','buttonLabel','buttonPath'],['schemaVersion','blocks']);
          const id=template(t.id),version=integer(t.version),expectedVersion=integer(v.expectedVersion);
          if(id==='cart'||version<1||version!==expectedVersion)throw Error('invalid');
          const {id:ignoredId,version:ignoredVersion,...fields}=t;
          const input={...scope(a),operationId,expectedVersion,template:{...content(fields),id,version}};
          run=()=>a.runtime.email.saveTemplate(input);
        }else if(area==='settings'){
          const v=emailMarketingObject(body,['expectedVersion','enabled','cartReminderEnabled','secondCartReminderEnabled']);
          const input={...scope(a),operationId,expectedVersion:integer(v.expectedVersion),enabled:bool(v.enabled),cartReminderEnabled:bool(v.cartReminderEnabled),secondCartReminderEnabled:bool(v.secondCartReminderEnabled)};
          if(!input.cartReminderEnabled&&input.secondCartReminderEnabled)throw Error();run=()=>a.runtime.email.saveSettings(input);
        }else if(area==='cancel'){
          const v=emailMarketingObject(body,['expectedVersion']);const input={...scope(a),operationId,campaignId:emailMarketingUuid(campaignId),expectedVersion:integer(v.expectedVersion)};run=()=>a.runtime.email.cancelCampaign(input);
        }else{
          const d=draft(body,['name','templateId',...(area==='test'?['recipient']:area==='schedule'?['scheduledAt']:[])],['content','productIds']);
          if(area!=='test'&&d.templateId==='cart')throw Error();
          const input={...scope(a),operationId,name:text(d.v.name,120),templateId:d.templateId,...(d.content?{content:d.content}:{}),...(d.productIds?{productIds:d.productIds}:{})};
          if(area==='test'){
            const recipient=text(d.v.recipient,254).toLowerCase();if(!/^[^@\s,;<>]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,63}$/.test(recipient))throw Error();run=()=>a.runtime.email.testCampaign({...input,recipient});
          }else if(area==='schedule'){
            const scheduledAt=text(d.v.scheduledAt,32),n=Date.parse(scheduledAt);if(!Number.isFinite(n)||new Date(n).toISOString()!==scheduledAt||n<a.now.getTime()+60000||n>a.now.getTime()+30*86400000)throw Error();run=()=>a.runtime.email.queueCampaign({...input,scheduledAt});
          }else run=()=>a.runtime.email.queueCampaign(input);
        }
      }
    }catch{return error('invalid_input',400);}
    return execute(run!);
  },
});}
