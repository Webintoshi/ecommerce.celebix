import { randomBytes } from "node:crypto";
import { STORE_ADMIN_SESSION_MAX_AGE_MS } from "@celebix/saas-contracts";
import { parseExactAdminHttpsOrigin } from "@celebix/saas-data";
import { CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS, parseCustomerPanelStagingAuthConfig, resolveCustomerPanelStagingAuthMode, type CustomerPanelStagingAuthConfig } from "../panel-auth-authority/config.ts";
import { createCrossHostHandoffAutoPostResponse } from "../cross-host-handoff-auto-post.ts";
import { validatePersistentPanelSessionCredential, serializePersistentPanelSessionCookie } from "../panel-session-completion/cookie.ts";
import {createAdminSecurityBridge} from "../../../../packages/saas-data/src/admin-login-security/bridge.ts";
import {createAdminIngressVerifier} from "../../../../packages/saas-data/src/admin-login-security/ingress.ts";
import { createAdminSecurityBridgeHandlers, createAdminLoginSecurityHandlers } from "./handler.ts";
import { createAdminLoginSecurityTransport } from "./transport.ts";
import { merchantPurchaseSearch, type MerchantPurchaseHint } from '../merchant-phone/purchase-hint.ts';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMEOUTS=Object.freeze({poolCheckoutMs:2000,statementMs:5000,lockMs:5000,idleTransactionMs:5000});
function invalid():never {throw new Error("admin_login_security_unavailable");}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))invalid();const row=value as Record<string,unknown>;if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key)))invalid();return row;}
export function resolveAdminLoginSecurityConfig(source:Record<string,string|undefined>):CustomerPanelStagingAuthConfig|null {
 if(resolveCustomerPanelStagingAuthMode(source)!=="approved_staging")return null;
 return parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map(name=>[name,source[name]])));
}
export function resolveAdminLoginIngress(source:Record<string,string|undefined>,options:Readonly<{centralOrigin:string;clock?:()=>Date}>){
 const key=source.CELEBIX_ADMIN_LOGIN_INGRESS_KEY_HEX;if(key===undefined)return undefined;
 if(!/^[a-f0-9]{64}$/u.test(key))invalid();
 return createAdminIngressVerifier({secret:new Uint8Array(Buffer.from(key,"hex")),centralOrigin:options.centralOrigin,clock:options.clock});
}
export function createAdminSecurityCompletionTransfer(options:Readonly<{
 sessionPolicy?:'store_whatsapp';
 purchaseHint?:MerchantPurchaseHint;
 clock:()=>Date;
 randomBytes:(size:number)=>Uint8Array;
 repository:{
  issuePreparedHandoff(input:{currentCredential:string;operationId:string;destinationStoreId:string;destinationHostname:string;now:Date;candidateCredential:string;handoffId:string}):Promise<unknown>;
  recoverIssuedHandoff(input:{operationId:string;credential:string;destinationHostname:string;now:Date}):Promise<unknown>;
 };
}>){
 if(merchantPurchaseSearch(options.purchaseHint)&&options.sessionPolicy!=='store_whatsapp')invalid();
 const maximumSessionMs=options.sessionPolicy==='store_whatsapp'?STORE_ADMIN_SESSION_MAX_AGE_MS:8*60*60_000;
 return async(completion:unknown,_request:Request):Promise<Response>=>{
 const row=exact(completion,["sessionCredential","sessionIssuedAt","sessionExpiresAt","destinationStoreId","destinationOrigin","handoffCredential","handoffId","handoffOperationId"]),now=options.clock();
 // Legacy MFA retains its eight-hour authority; WhatsApp opts in at factory creation.
 if(Date.parse(String(row.sessionExpiresAt))>Date.parse(String(row.sessionIssuedAt))+maximumSessionMs)invalid();
 serializePersistentPanelSessionCookie({credential:String(row.sessionCredential),issuedAt:String(row.sessionIssuedAt),expiresAt:String(row.sessionExpiresAt),now});
 if(typeof row.destinationStoreId!=="string"||!UUID.test(row.destinationStoreId))invalid();
 const destinationOrigin=parseExactAdminHttpsOrigin(row.destinationOrigin).origin,destinationHostname=new URL(destinationOrigin).hostname;
 const operationId=row.handoffOperationId,handoffId=row.handoffId;
 if(typeof operationId!=="string"||!UUID.test(operationId)||typeof handoffId!=="string"||!UUID.test(handoffId))invalid();
 const candidate=String(row.handoffCredential);validatePersistentPanelSessionCredential(candidate);
 const recover=()=>options.repository.recoverIssuedHandoff({operationId,credential:candidate,destinationHostname,now});
 let result=await recover();
 const kind=(value:unknown)=>value&&typeof value==="object"?(value as Record<string,unknown>).kind:undefined;
 if(kind(result)==="unauthenticated"||kind(result)==="unknown"||kind(result)==="unavailable"){
  result=await options.repository.issuePreparedHandoff({currentCredential:String(row.sessionCredential),operationId,destinationStoreId:row.destinationStoreId,destinationHostname,now,candidateCredential:candidate,handoffId});
  if(kind(result)==="commit_unknown"||kind(result)==="operation_mismatch")result=await recover();
 }
 const issued=exact(result,["kind","credential","destinationOrigin","expiresAt"]);
 if((issued.kind!=="handoff_issued"&&issued.kind!=="operation_replayed")||issued.credential!==candidate||issued.destinationOrigin!==destinationOrigin||typeof issued.expiresAt!=="string"||new Date(issued.expiresAt).toISOString()!==issued.expiresAt||Date.parse(issued.expiresAt)<=now.getTime()||Date.parse(issued.expiresAt)>now.getTime()+120000)invalid();
 return createCrossHostHandoffAutoPostResponse({destinationOrigin,handoffCredential:String(issued.credential),randomBytes:options.randomBytes,...(options.purchaseHint?{purchaseHint:options.purchaseHint}:{})});
};}
export async function initializeAdminLoginSecurityHandlers(config:CustomerPanelStagingAuthConfig){
 const [{default:pg},{createPostgresCrossHostSessionHandoffRepository},{createPanelSessionPersistenceApproval}]=await Promise.all([import("pg"),import("../cross-host-session-handoff/postgres-repository.ts"),import("../panel-session-persistence/activation.ts")]);
 const pool=new pg.Pool({connectionString:config.database.url,max:5,connectionTimeoutMillis:TIMEOUTS.poolCheckoutMs,idleTimeoutMillis:10000,statement_timeout:TIMEOUTS.statementMs,lock_timeout:TIMEOUTS.lockMs,idle_in_transaction_session_timeout:TIMEOUTS.idleTransactionMs,application_name:"celebix-admin-login-security"});pool.on("error",()=>undefined);
 const clock=()=>new Date(),bytes=(size:number)=>new Uint8Array(randomBytes(size));
 const repository=createPostgresCrossHostSessionHandoffRepository(createPanelSessionPersistenceApproval("approved_staging"),{pool,handoffKeys:new Map([[config.keys.handoffKeyId,config.keys.handoff]]),activeHandoffKeyId:config.keys.handoffKeyId,sessionKeys:new Map([[config.keys.sessionKeyId,config.keys.session]]),activeSessionKeyId:config.keys.sessionKeyId,clock,randomBytes:bytes,timeouts:TIMEOUTS,audit:()=>undefined});
 const transport=createAdminLoginSecurityTransport({ownerOrigin:config.authority.ownerOrigin,keyId:config.keys.callbackInternalKeyId,secret:config.keys.callbackInternal,clock});
 const authorityOrigin=new URL(config.logto.endSessionEndpoint).origin;
 const bridge=createAdminSecurityBridge({secret:config.keys.callbackInternal,centralOrigin:config.authority.panelOrigin,environment:"staging",clock,randomBytes:bytes});
 const ingress=resolveAdminLoginIngress(process.env,{centralOrigin:config.authority.panelOrigin,clock});
 const common={centralOrigin:config.authority.panelOrigin,authorityOrigin,clock,transport,bridge,...(ingress?{ingress}:{})};
 const login=createAdminLoginSecurityHandlers({...common,completeSession:createAdminSecurityCompletionTransfer({clock,randomBytes:bytes,repository})});
 const management=createAdminSecurityBridgeHandlers(common);
 return Object.freeze({...login,bridgeStart:management.start,bridgeForget:management.forget});
}
export type AdminLoginSecurityHandlers=Awaited<ReturnType<typeof initializeAdminLoginSecurityHandlers>>;
let resolution:Promise<AdminLoginSecurityHandlers>|undefined;
export function getAdminLoginSecurityHandlers():Promise<AdminLoginSecurityHandlers>{
 resolution??=(async()=>{const config=resolveAdminLoginSecurityConfig(process.env);if(!config)invalid();return initializeAdminLoginSecurityHandlers(config);})();return resolution;
}
export async function runAdminLoginSecurityRoute(action:keyof AdminLoginSecurityHandlers,request:Request):Promise<Response>{
 try{return(await getAdminLoginSecurityHandlers())[action](request);}catch{return Response.json({code:"unavailable"},{status:503,headers:{"cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff"}});}
}
