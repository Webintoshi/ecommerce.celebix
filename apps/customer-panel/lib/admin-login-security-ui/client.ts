import { AdminSecurityUiError, parseLoginState, parseSecurityState, safeSecurityHandoff, type AdminSecurityHandoff, type AdminLoginPublicState, type AdminSecurityPublicState } from "./model.ts";
export type AdminLoginClient = Readonly<{
 state: () => Promise<AdminLoginPublicState>;
 send: (body: {phone?: string}, key: string) => Promise<AdminLoginPublicState>;
 verify: (body: {code: string; rememberDevice: boolean}, key: string) => Promise<AdminLoginPublicState>;
 recover: (body: {backupCode: string}, key: string) => Promise<AdminLoginPublicState>;
 resume: (key: string) => Promise<AdminLoginPublicState>;
}>;
export type AdminSecurityClient = Readonly<{
 state: () => Promise<AdminSecurityPublicState>;
 forget: (body: {deviceId?:string; currentDevice?:boolean}, key: string) => Promise<AdminSecurityPublicState|AdminSecurityHandoff>;
 start: (body: {purpose:"change_phone"|"manage"}, key: string) => Promise<AdminSecurityHandoff>;
}>;
const KEY=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function transport(fetcher: typeof fetch) {
 return async (path:string, body?:unknown, key?:string):Promise<Record<string,unknown>>=>{
   if(body!==undefined && (!key||!KEY.test(key))) throw new AdminSecurityUiError();
   try {
     const response=await fetcher(path,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",headers:body===undefined?{Accept:"application/json"}:{Accept:"application/json","Content-Type":"application/json","Idempotency-Key":key!},...(body===undefined?{}:{body:JSON.stringify(body)})});
     const value:unknown=await response.json();
     if(!value||typeof value!=="object"||Array.isArray(value)) throw new AdminSecurityUiError();
     const result=value as Record<string,unknown>;
     if(!response.ok || (result.code!=="ok"&&result.code!=="redirect"&&result.code!=="handoff")) throw new AdminSecurityUiError(typeof result.code==="string"?result.code:"unavailable");
     return result;
   } catch(error) {throw error instanceof AdminSecurityUiError?error:new AdminSecurityUiError();}
 };
}
export function createAdminLoginClient(options: {fetcher?:typeof fetch} = {}): AdminLoginClient {
 const request=transport(options.fetcher??fetch);
 const execute=async(path:string,body?:unknown,key?:string)=>parseLoginState((await request(`/api/admin-login/${path}`,body,key)).state);
 return Object.freeze({state:()=>execute("state"),send:(body,key)=>execute("send",body.phone===undefined?{}:{phone:body.phone},key),verify:(body,key)=>execute("verify",{code:body.code,rememberDevice:body.rememberDevice},key),recover:(body,key)=>execute("recover",{backupCode:body.backupCode},key),resume:key=>execute("resume",{},key)});
}
export function createAdminSecurityClient(options: {authorityOrigin:string; panelOrigin?:string; fetcher?:typeof fetch}): AdminSecurityClient {
 const request=transport(options.fetcher??fetch);
 const execute=async(path:string,body?:unknown,key?:string)=>parseSecurityState((await request(`/api/admin-security/${path}`,body,key)).state);
 const handoff=(response:Record<string,unknown>,action:"start"|"forget")=>safeSecurityHandoff({url:response.url,transfer:response.transfer},options.panelOrigin??window.location.origin,action);
 return Object.freeze({state:()=>execute("state"),forget:async(body,key)=>{const response=await request("/api/admin-security/forget",body.deviceId!==undefined?{deviceId:body.deviceId}:body.currentDevice===true?{currentDevice:true}:{},key);return response.code==="handoff"?handoff(response,"forget"):parseSecurityState(response.state);},start:async(body,key)=>{const response=await request("/api/admin-security/start",{purpose:body.purpose},key);if(response.code!=="handoff")throw new AdminSecurityUiError();return handoff(response,"start");}});
}
