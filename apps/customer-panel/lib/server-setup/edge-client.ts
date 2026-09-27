import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { TenantContext } from "@celebix/saas-contracts";
import type { SetupEdgeProof, SetupPaymentAvailability } from "./types.ts";
type Response = Readonly<{ status:number; body:string }>;
type Get = (url:URL)=>Promise<Response>;
const SUFFIXES=new Set(["saas-staging.celebix.net","saas-staging.celebix.site"]);
function invalid():never { throw new Error("setup_access_unavailable"); }
function publicAddress(address:string):boolean {
 if(isIP(address)===4){const[a,b,c]=address.split(".").map(Number);return !(a===0||a===10||a===127||a!>=224||(a===169&&b===254)||(a===172&&b!>=16&&b!<=31)||(a===192&&(b===168||b===0))||(a===100&&b!>=64&&b!<=127)||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));}
 return isIP(address)===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!address.toLowerCase().startsWith("2001:db8:");
}
function addresses(values:readonly string[]) { if(values.length<1||values.length>8||new Set(values).size!==values.length||values.some(value=>!publicAddress(value)))invalid();return new Set(values); }
function exact(value:unknown,keys:readonly string[]):Record<string,unknown> {
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.keys(value).sort().join(",")!==[...keys].sort().join(","))invalid();return value as Record<string,unknown>;
}
function payment(value:unknown):SetupPaymentAvailability {
 const parsed=exact(value,["kind","providers"]);if(!["ready","disabled","unavailable"].includes(String(parsed.kind))||!Array.isArray(parsed.providers)||parsed.providers.length>3)invalid();
 const seen=new Set<string>();const providers=parsed.providers.map(value=>{const entry=exact(value,["providerCode","environment"]);if(!["paytr_iframe","iyzico_iframe"].includes(String(entry.providerCode))||!["test","live"].includes(String(entry.environment))||(entry.providerCode==="iyzico_iframe"&&entry.environment==="live"))invalid();const key=entry.providerCode+":"+entry.environment;if(seen.has(key))invalid();seen.add(key);return Object.freeze(entry) as SetupPaymentAvailability["providers"][number];});
 if((parsed.kind==="ready")!==(providers.length>0))invalid();return Object.freeze({kind:parsed.kind as SetupPaymentAvailability["kind"],providers:Object.freeze(providers)});
}
export function createSetupPlatformGet(input:Readonly<{allowedHosts:readonly string[];allowedAddresses:readonly string[];lookup?:(hostname:string)=>Promise<readonly {address:string;family:number}[]>;request?:typeof httpsRequest}>):Get {
 const hosts=new Set(input.allowedHosts),allowed=addresses(input.allowedAddresses);
 return async url=>{
  if(url.protocol!=="https:"||url.port||url.username||url.password||url.search||url.hash||!hosts.has(url.hostname)||!["/","/login","/api/health","/api/setup-capabilities"].includes(url.pathname))invalid();
  const deadline=Date.now()+5000;let timer:ReturnType<typeof setTimeout>|undefined;let resolved:readonly {address:string;family:number}[];
  try{resolved=await Promise.race([(input.lookup??(hostname=>dnsLookup(hostname,{all:true})))(url.hostname),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("setup_access_unavailable")),5000);})]);}finally{clearTimeout(timer);}
  if(resolved.length<1||resolved.some(row=>!allowed.has(row.address)||!publicAddress(row.address)||isIP(row.address)!==row.family))invalid();const pinned=resolved[0]!;
  return new Promise((resolve,reject)=>{
   let bytes=0;const chunks:Buffer[]=[];
   const request=(input.request??httpsRequest)(url,{method:"GET",rejectUnauthorized:true,servername:url.hostname,agent:false,family:pinned.family,lookup:(_hostname,_options,callback)=>callback(null,pinned.address,pinned.family),headers:{accept:"application/json,text/html","accept-encoding":"identity","user-agent":"Celebix-Setup-Readiness/1"}},response=>{
    response.on("data",(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>262144)request.destroy(new Error("setup_access_unavailable"));else chunks.push(chunk);});
    response.on("error",reject);response.on("end",()=>{if(response.statusCode!==200||bytes>262144)reject(new Error("setup_access_unavailable"));else resolve({status:200,body:Buffer.concat(chunks).toString("utf8")});});
   });
   const timeout=setTimeout(()=>request.destroy(new Error("setup_access_unavailable")),Math.max(1,deadline-Date.now()));request.on("error",reject);request.on("close",()=>clearTimeout(timeout));request.end();
  });
 };
}
export function createSetupEdgeProbe(input:Readonly<{platformDomainSuffix:string;panelOrigin:string;allowedAddresses:readonly string[];get?:Get}>) {
 if(!SUFFIXES.has(input.platformDomainSuffix)||input.panelOrigin!==`https://panel.${input.platformDomainSuffix}`)invalid();addresses(input.allowedAddresses);
 return async(context:TenantContext,_now:Date):Promise<SetupEdgeProof>=>{
  const slug=context.store.slug;if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)||["panel","owner","www","admin","api"].includes(slug))invalid();
  const hostname=`${slug}.${input.platformDomainSuffix}`,adminHostname=`${slug}.admin.${input.platformDomainSuffix}`;
  const get=input.get??createSetupPlatformGet({allowedHosts:[hostname,adminHostname,new URL(input.panelOrigin).hostname],allowedAddresses:input.allowedAddresses});
  const read=async(host:string,path:string)=>{const response=await get(new URL(`https://${host}${path}`));if(response.status!==200||Buffer.byteLength(response.body,"utf8")>262144)invalid();return response;};
  const health=async(host:string)=>{const response=await read(host,"/api/health"),value=JSON.parse(response.body),proof=exact(value,["schemaVersion","status","storeId","hostname",...(value&&Object.hasOwn(value,"dependencies")?["dependencies"]:[])]);if(proof.schemaVersion!==1||proof.status!=="ok"||proof.storeId!==context.store.id||proof.hostname!==host)invalid();};
  await Promise.all([health(hostname),health(adminHostname),read(new URL(input.panelOrigin).hostname,"/login"),read(adminHostname,"/login"),read(hostname,"/")]);
  const capabilities=exact(JSON.parse((await read(hostname,"/api/setup-capabilities")).body),["schemaVersion","storeId","hostname","payment"]);
  if(capabilities.schemaVersion!==1||capabilities.storeId!==context.store.id||capabilities.hostname!==hostname)invalid();
  return Object.freeze({schemaVersion:1,storeId:context.store.id,hostname,adminHostname,payment:payment(capabilities.payment)});
 };
}
