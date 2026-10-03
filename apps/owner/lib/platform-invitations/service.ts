import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {OidcProviderPort} from '../self-serve-oidc.ts';
import type {AuthenticatedPayloadCipher,EncryptedPayload} from '../saas-persistence/identity-crypto.ts';
import type {InvitationBootstrap} from '../../../../packages/saas-data/src/platform-invitations/transport.ts';
export type InvitationRepository={execute(name:'start'|'claim'|'complete',values:unknown[]):Promise<Record<string,unknown>>};
function invalid():never{throw new Error('invitation_denied');}
const hash=(value:string)=>createHash('sha256').update(`celebix-platform-invitation-v1\n${value}`).digest('hex');
export function createInvitationService(input:{repository:InvitationRepository;provider:OidcProviderPort;cipher:AuthenticatedPayloadCipher;issuer:string;audience:string;callbackUrl:string;clock():Date;seal(payload:InvitationBootstrap):string}){
 const callback=new URL(input.callbackUrl);if(callback.protocol!=='https:'||callback.pathname!=='/auth/callback')invalid();
 return {
  async start(token:string,adminHost:string){if(!/^[a-f0-9-]{72}$/.test(token)||!/^[a-z0-9.-]{3,253}$/.test(adminHost))invalid();const id=randomUUID();const state=`inv_${randomBytes(32).toString('base64url')}`;const binding=randomBytes(32).toString('base64url');const nonce=randomBytes(32).toString('base64url');const verifier=randomBytes(32).toString('base64url');const expires=new Date(input.clock().getTime()+5*60000).toISOString();
   const authorization=await input.provider.buildAuthorizationUrl({redirectUri:input.callbackUrl,state,nonce,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',prompt:'login'});
   if(authorization.origin!==new URL(input.issuer).origin||authorization.searchParams.get('state')!==state||authorization.searchParams.get('redirect_uri')!==input.callbackUrl)invalid();
   const encrypted=input.cipher.encrypt({binding:{purpose:'platform-invitation-oidc',stateDigest:hash(state),schemaVersion:1,recordId:id},payload:{nonce,verifier,token,adminHost,callbackUrl:input.callbackUrl,issuer:input.issuer,audience:input.audience}});
   const payload={keyId:encrypted.keyId,iv:Buffer.from(encrypted.iv).toString('base64url'),ciphertext:Buffer.from(encrypted.ciphertext).toString('base64url')};
   await input.repository.execute('start',[id,token,adminHost,hash(state),hash(binding),JSON.stringify(payload),expires]);
   return {ticket:input.seal({binding,authorizationUrl:authorization.toString(),callbackOrigin:callback.origin,sourceOrigin:`https://${adminHost}`,expiresAt:expires}),bootstrapUrl:`${callback.origin}/api/platform-invitations/bootstrap`};
  },
  async complete(state:string,code:string,binding:string){if(!/^inv_[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(binding)||!code||code.length>4096||code!==code.trim())invalid();const claimed=await input.repository.execute('claim',[hash(state),hash(binding)]);if(claimed.outcome==='replayed')return claimed;
   const encrypted=claimed.encryptedPayload as {keyId:string;iv:string;ciphertext:string};if(!encrypted||typeof claimed.id!=='string')invalid();
   const payload=input.cipher.decrypt({binding:{purpose:'platform-invitation-oidc',stateDigest:hash(state),schemaVersion:1,recordId:claimed.id},encrypted:{keyId:encrypted.keyId,iv:Buffer.from(encrypted.iv,'base64url'),ciphertext:Buffer.from(encrypted.ciphertext,'base64url')} as EncryptedPayload}) as {nonce:string;verifier:string;callbackUrl:string;issuer:string;audience:string};
   if(payload.callbackUrl!==input.callbackUrl||payload.issuer!==input.issuer||payload.audience!==input.audience)invalid();
   const identity=await input.provider.verifyCallback({state,code,codeVerifier:payload.verifier,redirectUri:input.callbackUrl,expectedNonce:payload.nonce,expectedIssuer:input.issuer,expectedAudience:input.audience});
   if(identity.issuer!==input.issuer||identity.nonce!==payload.nonce||identity.emailVerified!==true||!identity.audience.includes(input.audience)||!identity.subject||identity.subject.length>512)invalid();
   return input.repository.execute('complete',[claimed.id,identity.issuer,identity.subject,identity.email,true]);
  },
 };
}
