import {createMerchantPhoneHandlers,isMerchantInternalListener} from '../../../customer-panel/lib/merchant-phone/handler.ts';
import {createAdminIngressVerifier} from '../../../../packages/saas-data/src/admin-login-security/ingress.ts';
import type {createOwnerMerchantWhatsAppService} from './service.ts';
type Service=ReturnType<typeof createOwnerMerchantWhatsAppService>;
function readCookie(request:Request,name:string){const header=request.headers.get('cookie');if(!header||header.length>24576||/[\u0000-\u001f\u007f]/u.test(header))return null;const rows=header.split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));if(rows.length!==1)return null;const value=rows[0]!.slice(name.length+1);return value.length<=8192&&/^[A-Za-z0-9_.-]+$/u.test(value)?value:null;}
export function createOwnerMerchantSignupHandlers(options:Readonly<{ownerOrigin:string;service:Service;ingressKey:Uint8Array;clock:()=>Date}>){
 const owner=new URL(options.ownerOrigin);if(owner.origin!==options.ownerOrigin||owner.protocol!=='https:')throw Error('merchant_signup_unavailable');
 const handlers=createMerchantPhoneHandlers({purpose:'signup',clock:options.clock,transport:options.service,requireActor:async()=>{throw Error('merchant_signup_unavailable');},authenticateIngress:createAdminIngressVerifier({secret:options.ingressKey,centralOrigin:owner.origin,allowedPaths:['/api/merchant-signup/start','/api/merchant-signup/resend'],clock:options.clock})});
 const unavailable=()=>Response.json({code:'request_invalid'},{status:403,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
 function allowed(request:Request){try{const url=new URL(request.url);return request.headers.get('host')===owner.hostname&&(url.protocol!=='https:'||isMerchantInternalListener(url)||url.origin===owner.origin);}catch{return false;}}
 return Object.freeze({
  state:(r:Request)=>allowed(r)?handlers.state(r):Promise.resolve(unavailable()),
  start:(r:Request)=>allowed(r)?handlers.start(r):Promise.resolve(unavailable()),
  resend:(r:Request)=>allowed(r)?handlers.resend(r):Promise.resolve(unavailable()),
  verify:(r:Request)=>allowed(r)?handlers.verify(r):Promise.resolve(unavailable()),
  async getSignupProof(request:Request){if(!allowed(request))return null;const pendingCookie=readCookie(request,'__Host-celebix_merchant_signup_pending'),browserCredential=readCookie(request,'__Host-celebix_merchant_signup_browser');if(!pendingCookie||!browserCredential)return null;return options.service.getSignupProof({pendingCookie,browserCredential,hostname:owner.hostname});},
 });
}
