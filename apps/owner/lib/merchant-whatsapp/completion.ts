import {createHmac} from 'node:crypto';
import {createAdminSecurityCompletionTransfer} from '../../../customer-panel/lib/admin-login-security/runtime.ts';
import type {MerchantCompletion} from './service.ts';
type TransferOptions=Parameters<typeof createAdminSecurityCompletionTransfer>[0];
/** The operation derives one handoff for the already issued WhatsApp session.
 * Its native prepared write/recovery cannot issue another panel session. */
export function createMerchantSessionCompletion(options:TransferOptions&Readonly<{secret:Uint8Array;handoffKeyId:string;allowedPurpose?:'signup'|'login'}>){
 if(options.secret.length!==32||!/^[A-Za-z0-9._-]{1,64}$/u.test(options.handoffKeyId))throw Error('merchant_completion_invalid');
 if(options.purchaseHint!==undefined&&options.allowedPurpose!=='login')throw Error('merchant_completion_invalid');
 const key=Buffer.from(options.secret),transfer=createAdminSecurityCompletionTransfer({...options,sessionPolicy:'store_whatsapp'});
 return async(input:Readonly<{request:Request;completion:MerchantCompletion;operationId:string}>)=>{
  const c=input.completion;
  if(c.purpose!==(options.allowedPurpose??'signup'))throw Error('merchant_completion_invalid');
  function derived(purpose:string){return createHmac('sha256',key).update(JSON.stringify(['celebix/merchant-phone/handoff/v1',purpose,c.purpose,c.sessionId,input.operationId,c.destinationStoreId,c.destinationOrigin])).digest();}
  function id(purpose:string){const b=derived(purpose);b[6]=(b[6]!&15)|64;b[8]=(b[8]!&63)|128;const h=b.subarray(0,16).toString('hex');b.fill(0);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
  const bytes=derived('credential'),handoffCredential=`v1.${options.handoffKeyId}.${bytes.toString('base64url')}`;bytes.fill(0);
  return transfer({sessionCredential:c.sessionCredential,sessionIssuedAt:c.sessionIssuedAt,sessionExpiresAt:c.sessionExpiresAt,destinationStoreId:c.destinationStoreId,destinationOrigin:c.destinationOrigin,handoffCredential,handoffId:id('id'),handoffOperationId:id('operation')},input.request);
 };
}
export const createMerchantSignupCompletion=createMerchantSessionCompletion;
