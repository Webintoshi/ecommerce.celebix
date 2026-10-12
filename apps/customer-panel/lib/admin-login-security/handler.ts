import { randomBytes, timingSafeEqual } from "node:crypto";
import { parseLoginState, parseSecurityState, validPhone, safeSecurityRedirect, safeSecurityHandoff } from "../admin-login-security-ui/model.ts";
import { parsePanelBrowserBindingCookie, PANEL_BROWSER_BINDING_DELETION_COOKIE, serializePanelBrowserBindingCookie } from "../panel-browser-binding/cookie.ts";
import { parseExactAdminHttpsOrigin } from "@celebix/saas-data";
import type { createAdminSecurityBridge } from "../../../../packages/saas-data/src/admin-login-security/bridge.ts";
import { validatePersistentPanelSessionCredential } from "../panel-session-completion/cookie.ts";

export type AdminSecurityInternalRequest = Readonly<{
  schemaVersion: 1;
  trustedIp?:string;
  action: "state"|"send"|"verify"|"recover"|"resume"|"complete"|"security_state"|"forget"|"start";
  pendingCookie?: string;
  browserCredential?: string;
  deviceCredential?: string;
  sessionCredential?: string;
  operationId?: string;
  payload?: Record<string, unknown>;
}>;
export type AdminSecurityInternalTransport = Readonly<{execute(input:AdminSecurityInternalRequest):Promise<unknown>}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PENDING_NAME="__Host-celebix_admin_pending",DEVICE_NAME="__Host-celebix_admin_device";
const SAFE_ERRORS=new Set(["invalid_phone","invalid_code","otp_invalid","invalid_backup_code","backup_code_invalid","challenge_expired","otp_expired","rate_limited","resend_not_ready","pending_expired","unauthorized","delivery_failed","delivery_unavailable","fresh_login_required","resend_wait","locked","not_ready","delivery_uncertain","operation_uncertain","device_unavailable","management_restart_required","unavailable"]);
export const ADMIN_PENDING_DELETION_COOKIE=`${PENDING_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
export const ADMIN_DEVICE_DELETION_COOKIE=`${DEVICE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
export function serializeAdminPendingCookie(input:{credential:string;expiresAt:string;now:Date}):string {
 const credential=pendingCookie(input.credential),millis=Date.parse(input.expiresAt);
 if(!Number.isFinite(millis)||new Date(millis).toISOString()!==input.expiresAt||!(input.now instanceof Date)||!Number.isFinite(input.now.getTime()))invalid();
 const seconds=Math.floor((millis-input.now.getTime())/1000);if(seconds<1||seconds>600)invalid();
 return `${PENDING_NAME}=${credential}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${seconds}`;
}
class FreshLoginRequired extends Error {}
function invalid():never {throw new Error("admin_security_request_invalid");}
function opaque(value:unknown):string {if(typeof value!=="string"||value.length<16||value.length>2048||!/^[A-Za-z0-9_.-]+$/.test(value))invalid();return value;}
export function adminLoginRestartPath(value:unknown):string {
 try{if(typeof value!=="string")return "/login";const origin=parseExactAdminHttpsOrigin(`https://${value}`).origin;if(new URL(origin).hostname!==value)return "/login";return `/auth/login?destination=${value}`;}catch{return "/login";}
}
export function serializeAdminDestinationCookie(value:string):string {
 const token=pendingCookie(value).slice(5);const decoded=Buffer.from(token,"base64url");
 if(decoded.toString("base64url")!==token)invalid();const payload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(decoded));
 const origin=parseExactAdminHttpsOrigin(payload?.destinationOrigin).origin,hostname=new URL(origin).hostname;
 return `__Host-celebix_admin_destination=${hostname}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`;
}
function pendingCookie(value:unknown):string { const text=opaque(value); if(!/^apc1\.[A-Za-z0-9_-]+$/.test(text))invalid();return text; }
function device(value:unknown):string {
 const text=opaque(value),parts=text.split(".");
 if(parts.length!==3||parts[0]!=="adt1"||!/^[a-z][a-z0-9_-]{2,31}$/.test(parts[1]!)||!/^[A-Za-z0-9_-]{43}$/.test(parts[2]!)||Buffer.from(parts[2]!,"base64url").toString("base64url")!==parts[2])invalid();
 return text;
}
function cookie(header:string|null,name:string,required:boolean):string|undefined {
 if(!header){if(required)throw new FreshLoginRequired();return undefined;}
 if(header.length>16384||/[\u0000-\u001f\u007f]/.test(header))invalid();
 const values=header.split(";").map(field=>field.trim()).filter(field=>field.startsWith(`${name}=`)).map(field=>field.slice(name.length+1));
 if(values.length>1)invalid();if(required&&values.length!==1)throw new FreshLoginRequired();
 return values.length?opaque(values[0]):undefined;
}
function publicHost(request:Request):string|undefined {
 const host=request.headers.get("host");if(!host)return undefined;
 if(!host.includes("."))return undefined;
 const url=new URL(`https://${host}`);
 if(url.host!==host||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash)invalid();
 return url.origin;
}
function publicRequestOrigin(request:Request,centralOrigin:string,security:boolean,mutating:boolean):string {
 const url=new URL(request.url);if(!["http:","https:"].includes(url.protocol)||url.username||url.password)invalid();
 const host=publicHost(request),publicUrl=url.protocol==="https:"&&url.hostname.includes(".")?url.origin:undefined;
 let expected=centralOrigin;
 if(security){
  if(mutating){const origin=request.headers.get("origin");if(!origin)invalid();const selected=new URL(origin);if(selected.origin!==origin||selected.protocol!=="https:"||selected.port||selected.username||selected.password)invalid();expected=origin;}
  else{expected=host??publicUrl??invalid();}
  if(expected!==centralOrigin)parseExactAdminHttpsOrigin(expected);
 }
 if((publicUrl&&publicUrl!==expected)||(host&&host!==expected))invalid();
 return expected;
}
function secure(response:Response):Response {
 response.headers.set("cache-control","no-store");response.headers.set("referrer-policy","no-referrer");response.headers.set("x-content-type-options","nosniff");return response;
}
function failure(code:string,status=400):Response {return secure(Response.json({code},{status}));}
function exact(value:unknown,keys:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))invalid();
 const body=value as Record<string,unknown>;
 if(keys.some(key=>!Object.hasOwn(body,key))||Object.keys(body).some(key=>![...keys,...optional].includes(key)))invalid();return body;
}
async function readBody(request:Request):Promise<unknown> {
 if(request.headers.get("content-type")!=="application/json")invalid();
 const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>2048))invalid();
 if(!request.body)invalid();const reader=request.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>2048){await reader.cancel();invalid();}chunks.push(chunk.value);}return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}
 finally{reader.releaseLock();}
}
function payload(action:AdminSecurityInternalRequest["action"],value:unknown):Record<string,unknown>{
 switch(action){
  case "send":{const body=exact(value,[],["phone"]);if(body.phone!==undefined&&(typeof body.phone!=="string"||body.phone.length>32||!validPhone(body.phone)))invalid();return body;}
  case "verify":{const body=exact(value,["code","rememberDevice"]);if(typeof body.code!=="string"||!/^\d{6}$/.test(body.code)||typeof body.rememberDevice!=="boolean")invalid();return body;}
  case "recover":{const body=exact(value,["backupCode"]);if(typeof body.backupCode!=="string"||body.backupCode.length<1||body.backupCode.length>80||!/^[A-Za-z0-9-]+$/.test(body.backupCode))invalid();return body;}
  case "forget":{const body=exact(value,[],["deviceId","currentDevice"]);if(body.deviceId!==undefined&&(typeof body.deviceId!=="string"||!UUID.test(body.deviceId)))invalid();if(body.currentDevice!==undefined&&body.currentDevice!==true)invalid();if(body.deviceId!==undefined&&body.currentDevice!==undefined)invalid();return body;}
  case "start":{const body=exact(value,["purpose"]);if(body.purpose!=="change_phone"&&body.purpose!=="manage")invalid();return body;}
  default:return exact(value,[]);
 }
}
export function createAdminLoginSecurityHandlers(options:Readonly<{
 centralOrigin:string;
 authorityOrigin:string;
 clock?:()=>Date;
 bridge?:ReturnType<typeof createAdminSecurityBridge>;
 ingress?:(request:Request)=>Readonly<{authenticated:boolean;trustedIp?:string}>;
 trustedIp?:(request:Request)=>string|undefined;
 transport:AdminSecurityInternalTransport;
 completeSession:(completion:unknown,request:Request)=>Promise<Response>;
}>) {
 const central=new URL(options.centralOrigin);
 const clock=options.clock??(()=>new Date());
 safeSecurityRedirect(options.authorityOrigin,options.authorityOrigin,options.centralOrigin);
 if(central.protocol!=="https:"||central.username||central.password||central.pathname!=="/"||central.search||central.hash||options.centralOrigin!==central.origin)invalid();
 const paths:Record<AdminSecurityInternalRequest["action"],string>={state:"/api/admin-login/state",send:"/api/admin-login/send",verify:"/api/admin-login/verify",recover:"/api/admin-login/recover",resume:"/api/admin-login/resume",complete:"/auth/admin-login/complete",security_state:"/api/admin-security/state",forget:"/api/admin-security/forget",start:"/api/admin-security/start"};
 function handler(action:AdminSecurityInternalRequest["action"]){return async(request:Request):Promise<Response>=>{
  let input:AdminSecurityInternalRequest;
  try{
   const url=new URL(request.url),mutating=!["state","complete","security_state"].includes(action);
   const securityAction=action==="security_state"||action==="forget"||action==="start";
   const actualOrigin=publicRequestOrigin(request,central.origin,securityAction,mutating);
   if(url.pathname!==paths[action]||url.search||url.hash||url.username||url.password)invalid();
   if(request.method!==(mutating?"POST":"GET"))return failure("method_not_allowed",405);
   const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
   if((mutating&&origin!==actualOrigin)||(origin!==null&&origin!==actualOrigin)||(site!==null&&site!=="same-origin"&&site!=="none"))invalid();
   const header=request.headers.get("cookie"),security=action==="security_state"||action==="forget"||action==="start";
   let authority:Partial<AdminSecurityInternalRequest>;
   if(security){authority={sessionCredential:validatePersistentPanelSessionCredential(cookie(header,"__Host-celebix_panel",true))};}
   else{const pending=pendingCookie(cookie(header,PENDING_NAME,true));cookie(header,"__Host-celebix_panel_pre_auth",true);const browserCredential=parsePanelBrowserBindingCookie(header);const rawDevice=cookie(header,DEVICE_NAME,false);authority={pendingCookie:pending,browserCredential,...(rawDevice?{deviceCredential:device(rawDevice)}:{})};}
   let mutation:Partial<AdminSecurityInternalRequest>={};
   if(mutating){const operationId=request.headers.get("idempotency-key");if(!operationId||!UUID.test(operationId))invalid();const body=payload(action,await readBody(request));mutation={operationId,payload:action==="start"?{...body,sourceOrigin:actualOrigin}:body};}
   if(action==="forget"&&mutation.payload?.currentDevice===true&&actualOrigin===central.origin){const rawDevice=cookie(header,DEVICE_NAME,false);if(rawDevice)authority={...authority,deviceCredential:device(rawDevice)};}
   let trustedIp:string|undefined;
   if(action==="send"){
    if(options.ingress){
     try{const attestation=options.ingress(request);if(!attestation||attestation.authenticated!==true)return failure("delivery_unavailable",503);trustedIp=attestation.trustedIp;}
     catch{return failure("delivery_unavailable",503);}
    }else trustedIp=options.trustedIp?.(request);
   }
   if(trustedIp!==undefined&&(typeof trustedIp!=="string"||trustedIp.length>128||/[\s;\u0000-\u001f]/.test(trustedIp)))invalid();
   input={schemaVersion:1,action,...authority,...mutation,...(trustedIp===undefined?{}:{trustedIp})};
  }catch(error){return error instanceof FreshLoginRequired?failure("fresh_login_required",401):failure("request_invalid");}
  try{
   const sourceOrigin=action==="forget"?publicRequestOrigin(request,central.origin,true,true):central.origin;
   const currentBridge=action==="forget"&&input.payload?.currentDevice===true&&sourceOrigin!==central.origin;
   const raw=await options.transport.execute(currentBridge?{schemaVersion:1,action:"security_state",sessionCredential:input.sessionCredential}:input);
   if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error();
   const result=raw as Record<string,unknown>;
   if(result.schemaVersion!==1||typeof result.code!=="string")throw new Error();
   if(result.code!=="ok"){const code=SAFE_ERRORS.has(result.code)?result.code:"unavailable";return failure(code,code==="unauthorized"||code==="pending_expired"||code==="fresh_login_required"?401:code==="rate_limited"?429:code==="unavailable"?503:400);}
   let response:Response;
   if(currentBridge){
    if(!options.bridge||!input.sessionCredential)throw new Error();parseSecurityState(result.security);
    const transfer=options.bridge.seal({action:"forget",sourceOrigin,expiresAt:new Date(clock().getTime()+600000).toISOString(),sessionCredential:input.sessionCredential,operationId:input.operationId!});
    return secure(Response.json({code:"handoff",url:`${central.origin}/auth/admin-security/forget`,transfer}));
   }
   if(action==="complete"){
    if(result.authorizationUrl!==undefined){
      if(typeof result.authorizationUrl!=="string")throw new Error();const returnUrl=new URL(result.authorizationUrl);parseExactAdminHttpsOrigin(returnUrl.origin);
      if(returnUrl.pathname!=="/settings/security"||returnUrl.search||returnUrl.hash||returnUrl.username||returnUrl.password||result.authorizationUrl!==`${returnUrl.origin}/settings/security`)throw new Error();
      response=secure(new Response(null,{status:303,headers:{location:returnUrl.href}}));
    }else{if(!result.completion)throw new Error();response=secure(await options.completeSession(result.completion,request));}
    if(response.status>=200&&response.status<400){response.headers.append("set-cookie",ADMIN_PENDING_DELETION_COOKIE);response.headers.append("set-cookie",PANEL_BROWSER_BINDING_DELETION_COOKIE);}
   }else if(action==="start"){
    const handoff=safeSecurityHandoff({url:`${central.origin}/auth/admin-security/start`,transfer:result.securityHandoff},central.origin,"start");
    response=secure(Response.json({code:"handoff",...handoff}));
   }else response=secure(Response.json({code:"ok",state:action==="security_state"||action==="forget"?parseSecurityState(result.security):parseLoginState(result.state)}));
   if(result.pendingCookie!==undefined&&action!=="complete")response.headers.append("set-cookie",`${PENDING_NAME}=${pendingCookie(result.pendingCookie)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
   if(result.deviceCredential!==undefined&&response.status<400){
    if(typeof result.deviceExpiresAt!=="string")throw new Error();const expires=Date.parse(result.deviceExpiresAt),remaining=Math.floor((expires-clock().getTime())/1000);
    if(!Number.isFinite(expires)||new Date(expires).toISOString()!==result.deviceExpiresAt||remaining<1||remaining>2592000)throw new Error();
    response.headers.append("set-cookie",`${DEVICE_NAME}=${device(result.deviceCredential)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${remaining}`);
   }
   if(action==="forget"&&input.payload?.currentDevice===true)response.headers.append("set-cookie",ADMIN_DEVICE_DELETION_COOKIE);
   return response;
  }catch{return failure("unavailable",503);}
 };}
 return Object.freeze({state:handler("state"),send:handler("send"),verify:handler("verify"),recover:handler("recover"),resume:handler("resume"),complete:handler("complete"),securityState:handler("security_state"),forget:handler("forget"),start:handler("start")});
}

const FORGET_CONTINUATION_NAME="__Host-celebix_admin_forget_continue";
const FORGET_CONTINUATION_DELETION=`${FORGET_CONTINUATION_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
export function createAdminSecurityBridgeHandlers(options:{centralOrigin:string;authorityOrigin:string;bridge:ReturnType<typeof createAdminSecurityBridge>;transport:AdminSecurityInternalTransport;clock?:()=>Date}){
 const central=new URL(options.centralOrigin),clock=options.clock??(()=>new Date());
 if(central.protocol!=="https:"||central.origin!==options.centralOrigin)invalid();
 function clearContinuation(response:Response){response.headers.append("set-cookie",FORGET_CONTINUATION_DELETION);return response;}
 function continuation(transfer:string,expiresAt:string){const remaining=Math.floor((Date.parse(expiresAt)-clock().getTime())/1000);if(remaining<1||remaining>600)invalid();return `${FORGET_CONTINUATION_NAME}=${transfer}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${remaining}`;}
 function tokenCookie(request:Request):string{const header=request.headers.get("cookie");if(!header||header.length>24576||/[\u0000-\u001f\u007f]/.test(header))invalid();const values=header.split(";").map(value=>value.trim()).filter(value=>value.startsWith(FORGET_CONTINUATION_NAME+"=")).map(value=>value.slice(FORGET_CONTINUATION_NAME.length+1));if(values.length!==1||values[0]!.length>16384)invalid();return values[0]!;}
 function matches(left:string,right:string){const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}
 function returnToTenant(sourceOrigin:string,message?:"device_unavailable"|"fresh_login_required",forgetCurrent=false){const response=secure(new Response(null,{status:303,headers:{location:`${sourceOrigin}/settings/security${message?`?adminSecurity=${message}`:""}`}}));if(!message&&forgetCurrent)response.headers.append("set-cookie",ADMIN_DEVICE_DELETION_COOKIE);return clearContinuation(response);}
 async function form(request:Request){
  if(!/^application\/x-www-form-urlencoded(?:;\s*charset=UTF-8)?$/i.test(request.headers.get("content-type")??""))invalid();
  const reader=request.body?.getReader();if(!reader)invalid();const chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>24576){await reader.cancel();invalid();}chunks.push(next.value);}}finally{reader.releaseLock();}
  return new URLSearchParams(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
 }
 const handler=(action:"start"|"forget")=>async(request:Request):Promise<Response>=>{
  try{
   const url=new URL(request.url);
   if((url.protocol!=="http:"&&url.protocol!=="https:")||url.username||url.password||(url.protocol==="https:"&&url.hostname.includes(".")&&url.origin!==central.origin)||(publicHost(request)!==undefined&&publicHost(request)!==central.origin)||url.pathname!==`/auth/admin-security/${action}`||url.search||url.hash)invalid();
   if(action==="forget"&&request.method==="GET"){
    const currentTransfer=tokenCookie(request),context=options.bridge.open(currentTransfer);if(context.action!=="forget"&&context.action!=="forget_confirm")invalid();
    let confirmationTransfer=currentTransfer,confirmation=context;
    if(context.action==="forget"){
     const rawDevice=cookie(request.headers.get("cookie"),DEVICE_NAME,false);
     if(!rawDevice)return returnToTenant(context.sourceOrigin,"device_unavailable");
     confirmation={...context,action:"forget_confirm",deviceCredential:device(rawDevice),nonce:randomBytes(32).toString("base64url")};
     confirmationTransfer=options.bridge.seal(confirmation);
    }
    if(confirmation.action!=="forget_confirm")invalid();
    const nonce=confirmation.nonce,path=`${central.origin}/auth/admin-security/forget`;
    // GET prepares a read-only document. Only its cookie/nonce-bound same-origin POST mutates.
    const html=`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cihaz hatırlaması kaldırılıyor</title></head><body><main><p>Cihaz hatırlaması kaldırılıyor…</p><form id="forget-device" method="post" action="${path}"><input type="hidden" name="transfer" value="${confirmationTransfer}"><input type="hidden" name="nonce" value="${nonce}"><button type="submit">Devam et</button></form></main><script nonce="${nonce}">document.getElementById("forget-device").submit()</script></body></html>`;
    const response=secure(new Response(html,{headers:{"content-type":"text/html; charset=utf-8","content-security-policy":`default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action ${central.origin} ${confirmation.sourceOrigin}; script-src 'nonce-${nonce}'`}}));
    // Non-CORS form POST needs its same-origin Origin; cross-site returns still omit referrers.
    response.headers.set("referrer-policy","same-origin");
    response.headers.append("set-cookie",continuation(confirmationTransfer,confirmation.expiresAt));return response;
   }
   if(request.method!=="POST")invalid();
   const posted=await form(request);if(posted.getAll("transfer").length!==1)invalid();const transfer=posted.get("transfer")!,payload=options.bridge.open(transfer);
   if(action==="start"){
    if(payload.action!=="start"||posted.size!==1||request.headers.get("origin")!==payload.sourceOrigin)invalid();
    const destination=safeSecurityRedirect(payload.authorizationUrl,options.authorityOrigin,central.origin);if(new URL(destination).origin!==new URL(options.authorityOrigin).origin)invalid();
    const binding=serializePanelBrowserBindingCookie({credential:payload.browserCredential,expiresAt:payload.browserExpiresAt,now:clock()});
    return secure(new Response(null,{status:303,headers:{location:destination,"set-cookie":binding}}));
   }
   if(payload.action==="forget"){
    if(posted.size!==1||request.headers.get("origin")!==payload.sourceOrigin)invalid();
    return secure(new Response(null,{status:303,headers:{location:`${central.origin}/auth/admin-security/forget`,"set-cookie":continuation(transfer,payload.expiresAt)}}));
   }
   const site=request.headers.get("sec-fetch-site");
   if(payload.action!=="forget_confirm"||posted.size!==2||posted.getAll("nonce").length!==1||request.headers.get("origin")!==central.origin||(site!==null&&site!=="same-origin"&&site!=="none")||!matches(tokenCookie(request),transfer)||!matches(posted.get("nonce")??"",payload.nonce))invalid();
   const currentDevice=cookie(request.headers.get("cookie"),DEVICE_NAME,false);
   const result=await options.transport.execute({schemaVersion:1,action:"forget",sessionCredential:payload.sessionCredential,deviceCredential:payload.deviceCredential,operationId:payload.operationId,payload:{currentDevice:true}});
   if(!result||typeof result!=="object"||(result as Record<string,unknown>).schemaVersion!==1)throw new Error();
   const code=(result as Record<string,unknown>).code;
   if(code==="device_unavailable"||code==="fresh_login_required")return returnToTenant(payload.sourceOrigin,code);
   if(code!=="ok")throw new Error();return returnToTenant(payload.sourceOrigin,undefined,currentDevice!==undefined&&matches(currentDevice,payload.deviceCredential));
  }catch{return action==="forget"&&request.method==="POST"&&request.headers.get("origin")===central.origin?clearContinuation(failure("request_invalid")):failure("request_invalid");}
 };
 return Object.freeze({start:handler("start"),forget:handler("forget")});
}
