import {randomUUID,randomBytes} from 'node:crypto';
import {createMerchantInternalTransport} from '../../../owner/lib/merchant-whatsapp/internal.ts';
import type {MerchantCompletion,MerchantInternalInput,MerchantInternalResult} from '../../../owner/lib/merchant-whatsapp/service.ts';
import {createAdminIngressVerifier} from '../../../../packages/saas-data/src/admin-login-security/ingress.ts';
import {CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS,parseCustomerPanelStagingAuthConfig,resolveCustomerPanelStagingAuthMode,type CustomerPanelStagingAuthConfig} from '../panel-auth-authority/config.ts';
import {validatePersistentPanelSessionCredential} from '../panel-session-completion/cookie.ts';
import type {ServerPanelAccessResult} from '../server-panel-access/access.ts';
import {createMerchantPhoneHandlers,MerchantActorUnavailable,isMerchantInternalListener} from './handler.ts';
type Environment=Readonly<Record<string,string|undefined>>;
type ActorInput=Readonly<{credential:string|null;hostname:string;requestId:string;now:Date}>;
type ActorResolver=(input:ActorInput)=>Promise<ServerPanelAccessResult>;
type Transport=Readonly<{command(input:MerchantInternalInput):Promise<MerchantInternalResult>}>;
type HandoffRepository=Pick<import('../cross-host-session-handoff/postgres-repository.ts').PreparedPostgresCrossHostSessionHandoffRepository,'issuePreparedHandoff'|'recoverIssuedHandoff'>;
type Config=Readonly<{auth:CustomerPanelStagingAuthConfig;ingressSecret:Uint8Array}>;
export type MerchantPhoneAction=keyof ReturnType<typeof createMerchantPhoneHandlers>;
const INGRESS_PATHS=Object.freeze(['/api/merchant-login/start','/api/merchant-login/resend','/api/merchant-login/bind/start','/api/merchant-login/bind/resend']);
function invalid():never{throw Error('merchant_phone_runtime_unavailable');}
function unavailable(){return Response.json({code:'unavailable'},{status:503,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});}
function denied(){return Response.json({code:'request_invalid'},{status:403,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});}
export function resolveMerchantPhoneConfig(source:Environment):Config|null{
 if(source.CELEBIX_MERCHANT_WHATSAPP_ENABLED!=='true'||resolveCustomerPanelStagingAuthMode(source)!=='approved_staging')return null;
 const auth=parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map(name=>[name,source[name]])));
 const ingress=source.CELEBIX_ADMIN_LOGIN_INGRESS_KEY_HEX;if(typeof ingress!=='string'||!/^[a-f0-9]{64}$/u.test(ingress))invalid();
 return Object.freeze({auth,ingressSecret:new Uint8Array(Buffer.from(ingress,'hex'))});
}
/** Public Host is the routed destination. Forwarded headers never establish an
 * origin; an absolute public HTTPS URL must match that Host exactly. */
export function merchantPhoneRequestOrigin(request:Request):URL{
 const url=new URL(request.url),raw=request.headers.get('host')??url.host;
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)invalid();
 const publicUrl=new URL('https://'+raw);
 if(publicUrl.host!==raw||publicUrl.port||publicUrl.username||publicUrl.password||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(publicUrl.hostname))invalid();
 if(url.protocol==='https:'&&!isMerchantInternalListener(url)&&url.origin!==publicUrl.origin)invalid();return publicUrl;
}
function panelCredential(request:Request):string{
 const header=request.headers.get('cookie');if(!header||header.length>24576||/[\u0000-\u001f\u007f]/u.test(header))invalid();
 const rows=header.split(';').map(row=>row.trim());if(rows.some(row=>row.startsWith('__Host-celebix_support=')))invalid();
 const values=rows.filter(row=>row.startsWith('__Host-celebix_panel='));if(values.length!==1)invalid();return validatePersistentPanelSessionCredential(values[0]!.slice('__Host-celebix_panel='.length));
}
export async function resolveMerchantPhoneActor(request:Request,options:Readonly<{resolve:ActorResolver;clock?:()=>Date}>):Promise<string>{
 const hostname=merchantPhoneRequestOrigin(request).hostname,credential=panelCredential(request),now=(options.clock??(()=>new Date()))();
 let access:ServerPanelAccessResult;try{access=await options.resolve({credential,hostname,requestId:randomUUID(),now});}catch{throw new MerchantActorUnavailable();}
 if(access.kind==='unavailable')throw new MerchantActorUnavailable();
 if(access.kind!=='authenticated'||access.support||access.tenantContext.store.status!=='active'||access.tenantContext.membership.status!=='active'||!['store_owner','admin','editor','analyst','cashier'].includes(access.tenantContext.membership.role)||access.session.activeStoreId!==access.tenantContext.store.id||access.session.principal.id!==access.tenantContext.principal.id)invalid();
 // The durable resolver verifies actual hostname -> active store. Its context
 // may carry a canonical alias, so it is not compared to the requested alias.
 return credential;
}
async function defaultActor(input:ActorInput){const {resolveDefaultServerPanelAccess}=await import('../server-panel-access/default.ts');return resolveDefaultServerPanelAccess(input);}
export function createMerchantPhoneRuntime(options:Readonly<{source:Environment;clock?:()=>Date;resolveActor?:ActorResolver;createTransport?:(config:CustomerPanelStagingAuthConfig)=>Transport;getHandoffRepository?:()=>Promise<HandoffRepository>}>){
 const clock=options.clock??(()=>new Date());
 return async(action:MerchantPhoneAction,request:Request,staffId?:string):Promise<Response>=>{
  let config:Config|null;try{config=resolveMerchantPhoneConfig(options.source);}catch{return unavailable();}if(!config)return unavailable();
  let origin:URL;try{origin=merchantPhoneRequestOrigin(request);}catch{return denied();}
  try{
   const transport=options.createTransport?.(config.auth)??createMerchantInternalTransport({ownerOrigin:config.auth.authority.ownerOrigin,keyId:config.auth.keys.callbackInternalKeyId,secret:config.auth.keys.callbackInternal,clock});
   const authenticateIngress=createAdminIngressVerifier({secret:config.ingressSecret,centralOrigin:origin.origin,allowedPaths:INGRESS_PATHS,clock});
   const completeSession=async(completion:MerchantCompletion,completedRequest:Request):Promise<Response>=>{
    if(merchantPhoneRequestOrigin(completedRequest).origin!==config.auth.authority.panelOrigin||completion.purpose!=='login')return denied();
    let repository:HandoffRepository;
    if(options.getHandoffRepository)repository=await options.getHandoffRepository();
    else{const {resolveDefaultServerAdminHostAuthRuntime}=await import('../server-admin-host-auth/default.ts');const runtime=await resolveDefaultServerAdminHostAuthRuntime();if(!runtime||runtime.access.panelOrigin!==config.auth.authority.panelOrigin)invalid();repository=runtime.handoffs;}
    const {createMerchantSessionCompletion}=await import('../../../owner/lib/merchant-whatsapp/completion.ts');
    const transfer=createMerchantSessionCompletion({repository,clock,randomBytes:size=>new Uint8Array(randomBytes(size)),secret:config.auth.keys.callbackInternal,handoffKeyId:config.auth.keys.handoffKeyId,allowedPurpose:'login'});
    return transfer({request:completedRequest,completion,operationId:completion.sessionId});
   };
   const handlers=createMerchantPhoneHandlers({transport,clock,authenticateIngress,completeSession,requireActor:()=>resolveMerchantPhoneActor(request,{resolve:options.resolveActor??defaultActor,clock})});
   return action==='staff'?await handlers.staff(request,staffId):await handlers[action](request);
  }catch{return unavailable();}
 };
}
const defaultRun=createMerchantPhoneRuntime({source:process.env});
export function runMerchantPhoneRoute(action:MerchantPhoneAction,request:Request,staffId?:string){return defaultRun(action,request,staffId);}
export function retireMerchantPasswordEntry(request:Request):Response|null{
 if(process.env.CELEBIX_MERCHANT_WHATSAPP_ENABLED!=='true')return null;
 try{merchantPhoneRequestOrigin(request);}catch{return denied();}
 return new Response(null,{status:303,headers:{location:'/login','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
}
