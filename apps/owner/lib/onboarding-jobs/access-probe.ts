import {lookup as dnsLookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import {createCanonicalAdminOriginFromPanelOrigin} from '@celebix/saas-data';
import type {CreateStarterTenantResult} from '@celebix/saas-contracts';
import {normalizeOnboardingScope,type RegistrationAuthorityScope,type OnboardingAccessSnapshot} from './types.ts';
export interface PlatformResponse {status:number;body:string}
export type PlatformGet=(url:URL)=>Promise<PlatformResponse>;
function publicAddress(address:string):boolean{
 if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)));}
 // Only global unicast IPv6; reject mapped IPv4, loopback, link local and ULA.
 return isIP(address)===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!address.toLowerCase().startsWith('2001:db8:');
}
export function createBoundedPlatformGet(input:{allowedHosts:readonly string[];allowedAddresses:readonly string[];lookup?:(hostname:string)=>Promise<{address:string;family:number}[]>;request?:typeof httpsRequest}):PlatformGet{
 const hosts=new Set(input.allowedHosts);const addresses=new Set(input.allowedAddresses);
 if(!addresses.size||[...addresses].some(address=>!publicAddress(address)))throw new Error('onboarding_edge_allowlist_invalid');
 return async (original)=>{
  const deadline=Date.now()+5000;
  async function get(url:URL,redirects:number):Promise<PlatformResponse>{
   if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.search||!hosts.has(url.hostname)||url.hostname!==original.hostname)throw new Error('onboarding_host_invalid');
   let lookupTimer:ReturnType<typeof setTimeout>|undefined;
   let resolved:{address:string;family:number}[];
   try{resolved=await Promise.race([(input.lookup??(hostname=>dnsLookup(hostname,{all:true})))(url.hostname),new Promise<never>((_,reject)=>{lookupTimer=setTimeout(()=>reject(new Error('onboarding_timeout')),Math.max(1,deadline-Date.now()));})]);}
   finally{clearTimeout(lookupTimer);}
   if(!resolved.length||resolved.some(row=>!publicAddress(row.address)||!addresses.has(row.address)))throw new Error('onboarding_dns_denied');
   const pinned=resolved[0];
   const response=await new Promise<PlatformResponse & {location?:string}>((resolve,reject)=>{
    const request=(input.request??httpsRequest)(url,{method:'GET',rejectUnauthorized:true,servername:url.hostname,agent:false,family:pinned.family,
     lookup:(_hostname,_options,callback)=>callback(null,pinned.address,pinned.family),
     headers:{accept:'application/json,text/html','accept-encoding':'identity','user-agent':'Celebix-Onboarding-Access/1'}},res=>{
      const chunks:Buffer[]=[];let bytes=0;
      res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>262144)request.destroy(new Error('onboarding_body_limit'));else chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString('utf8'),location:res.headers.location}));
     });
    const timer=setTimeout(()=>request.destroy(new Error('onboarding_timeout')),Math.max(1,deadline-Date.now()));
    request.on('error',reject);request.on('close',()=>clearTimeout(timer));request.end();
   });
   if([301,302,303,307,308].includes(response.status)){
    if(redirects>=1||!response.location)throw new Error('onboarding_redirect_invalid');
    const next=new URL(response.location,url);if(next.origin!==original.origin)throw new Error('onboarding_redirect_invalid');
    return get(next,redirects+1);
   }
   return {status:response.status,body:response.body};
  }
  return get(original,0);
 };
}
export async function probeTenantAccess(authority:RegistrationAuthorityScope,expectedTenant:CreateStarterTenantResult,dependencies:{attemptId:string;now:Date;verifyProof:(input:{scope:RegistrationAuthorityScope;attemptId:string;storeId:string;adminHost:string;storefrontHost:string;now:Date})=>Promise<boolean>;get:PlatformGet}):Promise<OnboardingAccessSnapshot>{
 const base={attemptId:dependencies.attemptId,storeId:expectedTenant.store.id,checkedAt:dependencies.now.toISOString()};
 try{
  const scope=normalizeOnboardingScope(authority);const slug=expectedTenant.store.slug;
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('invalid');
  const admin=createCanonicalAdminOriginFromPanelOrigin(scope.panelOrigin,slug);const storefront=`https://${slug}.${scope.platformDomainSuffix}`;
  if(expectedTenant.panelUrl!==admin||expectedTenant.storefrontUrl!==storefront)return {...base,state:'unavailable',safeCodes:['authority_invalid']};
  if(!await dependencies.verifyProof({scope,attemptId:dependencies.attemptId,storeId:base.storeId,adminHost:new URL(admin).hostname,storefrontHost:new URL(storefront).hostname,now:dependencies.now}))return {...base,state:'pending',safeCodes:['access_pending']};
  for(const origin of [admin,storefront]){
   const url=new URL('/api/health',origin);const health=await dependencies.get(url);
   if(health.status!==200)return {...base,state:'pending',safeCodes:['access_pending']};
   let body:Record<string,unknown>;try{body=JSON.parse(health.body);}catch{return {...base,state:'unavailable',safeCodes:['authority_invalid']};}
   if(!body||body.schemaVersion!==1||body.status!=='ok'||body.storeId!==base.storeId||body.hostname!==url.hostname)return {...base,state:'unavailable',safeCodes:['authority_invalid']};
  }
  for(const url of [new URL('/login',scope.panelOrigin),new URL('/login',admin),new URL('/',storefront)]){
   if((await dependencies.get(url)).status!==200)return {...base,state:'pending',safeCodes:['access_pending']};
  }
  return {...base,state:'ready',safeCodes:['access_ready']};
 }catch{return {...base,state:'unavailable',safeCodes:['access_unavailable']};}
}
