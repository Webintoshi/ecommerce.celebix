import {createHmac,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
const DOMAIN='celebix/admin-login/ingress/v1',PATH='/api/admin-login/send';
const SEND_PATHS=new Set([PATH,'/api/merchant-login/start','/api/merchant-login/resend','/api/merchant-login/bind/start','/api/merchant-login/bind/resend','/api/merchant-signup/start','/api/merchant-signup/resend','/api/account/auth/start']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const UNAUTHENTICATED=Object.freeze({authenticated:false});
export type AdminAuthenticatedIngress=Readonly<{authenticated:boolean;trustedIp?:string}>;

/** A private signer authenticates the source and its exact operation. Signed
 * unknown IPs keep account/recipient budgets; missing or invalid proof cannot
 * silently bypass a configured source-IP budget. */
export function createAdminIngressVerifier(options:{secret:Uint8Array;centralOrigin:string;clock?:()=>Date;allowedPaths?:readonly string[]}){
 if(!(options.secret instanceof Uint8Array)||options.secret.length!==32)throw Error('admin_ingress_configuration_invalid');
 const origin=new URL(options.centralOrigin);
 if(origin.protocol!=='https:'||origin.origin!==options.centralOrigin)throw Error('admin_ingress_configuration_invalid');
 const paths=options.allowedPaths??[PATH];
 if(!Array.isArray(paths)||paths.length<1||paths.length>SEND_PATHS.size||new Set(paths).size!==paths.length||paths.some(path=>!SEND_PATHS.has(path)))throw Error('admin_ingress_configuration_invalid');
 const allowedPaths=new Set(paths);
 const key=Buffer.from(options.secret),clock=options.clock??(()=>new Date());
 return(request:Request):AdminAuthenticatedIngress=>{
  try{
   const url=new URL(request.url),ip=request.headers.get('x-celebix-admin-ip')??'';
   const time=request.headers.get('x-celebix-admin-ip-time')??'',signature=request.headers.get('x-celebix-admin-ip-signature')??'';
   const operation=request.headers.get('idempotency-key')??'',now=clock();
   if(request.method!=='POST'||!allowedPaths.has(url.pathname)||url.search||request.headers.get('origin')!==origin.origin||
      (ip!=='unknown'&&!isIP(ip))||ip.length>128||!UUID.test(operation)||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(time)||!Number.isFinite(Date.parse(time))||
      new Date(time).toISOString()!==time||!(now instanceof Date)||!Number.isFinite(now.getTime())||
      Math.abs(now.getTime()-Date.parse(time))>45000||!/^[a-f0-9]{64}$/u.test(signature))return UNAUTHENTICATED;
   const expected=createHmac('sha256',key).update([DOMAIN,origin.origin,url.pathname,operation,ip,time].join('\n')).digest();
   if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return UNAUTHENTICATED;
   return Object.freeze(ip==='unknown'?{authenticated:true}:{authenticated:true,trustedIp:ip});
  }catch{return UNAUTHENTICATED;}
 };
}

/** Compatibility projection. Required-ingress callers use authenticated too. */
export function createAdminTrustedIpResolver(options:{secret:Uint8Array;centralOrigin:string;clock?:()=>Date}){
 const verify=createAdminIngressVerifier(options);
 return(request:Request):string|undefined=>verify(request).trustedIp;
}
