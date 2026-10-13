import { createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import type { StorefrontIdentityKeyring } from "./credential.ts";
import { normalizeStorefrontAccountPhone } from "./phone.ts";

export type PhoneChallenge = Readonly<{ challengeId:string; hostname:string; phone:string; firstName?:string; lastName?:string; expiresAt:string; hmacKeyId:string; bindAccount?:true }>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HOST=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const ENVELOPE=/^ph1[.]([a-z][a-z0-9_-]{2,31})[.]([A-Za-z0-9_-]{16})[.]([A-Za-z0-9_-]{1,2048})[.]([A-Za-z0-9_-]{22})$/u;
function invalid():never {throw new TypeError("storefront_phone_credential_invalid");}
function key(ring:StorefrontIdentityKeyring,id=ring.activeKeyId) {const selected=ring.keys.find(k=>k.keyId===id);if(!selected || selected.key.length!==32) invalid();return selected;}
function hostname(value:string) {if(typeof value!=="string" || value.length>253 || !HOST.test(value))invalid();return value;}
function digest(purpose:string,fields:readonly string[],ring:StorefrontIdentityKeyring,id?:string) {const selected=key(ring,id);return Object.freeze({keyId:selected.keyId,digest:createHmac("sha256",selected.key).update(JSON.stringify(["celebix/storefront-phone/v1",purpose,...fields])).digest("hex")});}
export function phoneIdentityDigest(host:string,phone:string,ring:StorefrontIdentityKeyring,id?:string) {return digest("identity",[hostname(host),normalizeStorefrontAccountPhone(phone)],ring,id);}
// SQL scopes this opaque recipient digest to the resolved store; aliases share
// resend limits, while the code and encrypted challenge remain hostname bound.
export function phoneRecipientDigest(phone:string,ring:StorefrontIdentityKeyring,id?:string) {return digest("recipient",[normalizeStorefrontAccountPhone(phone)],ring,id);}
export function phoneRequestDigest(authority:string,ring:StorefrontIdentityKeyring,id?:string) {
  if(typeof authority!=="string" || authority.length<1 || authority.length>1024 || /[\u0000-\u001f\u007f-\u009f]/u.test(authority))invalid();
  return digest("request",[authority],ring,id);
}
export function phoneCodeDigest(input:Readonly<{hostname:string;phone:string;challengeId:string;code:string}>,ring:StorefrontIdentityKeyring,id?:string) {if(!UUID.test(input.challengeId)|| !/^[0-9]{6}$/u.test(input.code))invalid();return digest("code",[hostname(input.hostname),input.challengeId,normalizeStorefrontAccountPhone(input.phone),input.code],ring,id);}
function parse(value:unknown):PhoneChallenge|null {
  try {
    if(typeof value!=="object"||value===null||Array.isArray(value))return null;
    const p=value as Record<string,unknown>; const allowed=["challengeId","hostname","phone","firstName","lastName","expiresAt","hmacKeyId","bindAccount"];
    if(Object.keys(p).some(k=>!allowed.includes(k))||typeof p.challengeId!=="string"||!UUID.test(p.challengeId)||typeof p.hostname!=="string"||hostname(p.hostname)!==p.hostname||typeof p.phone!=="string"||normalizeStorefrontAccountPhone(p.phone)!==p.phone||typeof p.hmacKeyId!=="string"||!/^[a-z][a-z0-9_-]{2,31}$/u.test(p.hmacKeyId)||typeof p.expiresAt!=="string"||new Date(p.expiresAt).toISOString()!==p.expiresAt)return null;
    if((p.firstName===undefined)!==(p.lastName===undefined))return null;
    if(Object.hasOwn(p,"bindAccount") && p.bindAccount!==true)return null;
    for(const field of [p.firstName,p.lastName]) if(field!==undefined && (typeof field!=="string"||field!==field.trim()||field.length<1||field.length>100||/[\u0000-\u001f\u007f-\u009f]/u.test(field)))return null;
    return Object.freeze({...p}) as PhoneChallenge;
  }catch{return null;}
}
export function sealPhoneChallenge(input:PhoneChallenge,ring:StorefrontIdentityKeyring,random:(size:number)=>Uint8Array):string {
  const parsed=parse(input);if(!parsed)invalid();const selected=key(ring);const nonce=Buffer.from(random(12));if(nonce.length!==12)invalid();const plain=Buffer.from(JSON.stringify(parsed));
  try{const cipher=createCipheriv("aes-256-gcm",selected.key,nonce);cipher.setAAD(Buffer.from(`celebix/storefront-phone-challenge/v1/${selected.keyId}`));const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);try{return `ph1.${selected.keyId}.${nonce.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;}finally{encrypted.fill(0);}}finally{plain.fill(0);nonce.fill(0);}
}
export function openPhoneChallenge(value:string,ring:StorefrontIdentityKeyring):PhoneChallenge|null {
  if(typeof value!=="string"||value.length>2600)return null;const match=ENVELOPE.exec(value);if(!match)return null;
  let plain:Buffer|undefined;
  try{const nonce=Buffer.from(match[2]!,"base64url"),tag=Buffer.from(match[4]!,"base64url");if(nonce.toString("base64url")!==match[2]||tag.toString("base64url")!==match[4])return null;const selected=key(ring,match[1]);const decipher=createDecipheriv("aes-256-gcm",selected.key,nonce);decipher.setAAD(Buffer.from(`celebix/storefront-phone-challenge/v1/${selected.keyId}`));decipher.setAuthTag(tag);plain=Buffer.concat([decipher.update(Buffer.from(match[3]!,"base64url")),decipher.final()]);return parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain)));}catch{return null;}finally{plain?.fill(0);}
}
export function serializePhoneChallengeCookie(value:string):string {if(!ENVELOPE.test(value))invalid();return `__Host-celebix_account_challenge=${value}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Strict`;}

export function phoneOperationBytes(purpose:string,hostnameValue:string,challengeId:string,operationId:string,ring:StorefrontIdentityKeyring,id=ring.activeKeyId):Buffer {
 if(!/^[a-z0-9_/-]{1,64}$/u.test(purpose)||!UUID.test(challengeId)||!UUID.test(operationId))invalid();
 return createHmac('sha256',key(ring,id).key).update(JSON.stringify(['celebix/storefront-phone-operation/v1',purpose,hostname(hostnameValue),challengeId,operationId])).digest();
}
export function phoneOperationUuid(purpose:string,host:string,challengeId:string,operationId:string,ring:StorefrontIdentityKeyring,id?:string):string {
 const bytes=phoneOperationBytes(purpose,host,challengeId,operationId,ring,id);try{bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;const h=bytes.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}finally{bytes.fill(0);}
}
export function phoneBudgetDigest(purpose:'recipient'|'ip',value:string,rateKey:Uint8Array):string {
 if(!(rateKey instanceof Uint8Array)||rateKey.length!==32)invalid();
 const domain=purpose==='recipient'?'celebix/whatsapp-otp/recipient-budget/v1':'celebix/whatsapp-otp/ip-budget/v1';
 if(typeof value!=='string'||value!==value.trim()||value.length<1||value.length>128||/[\u0000-\u001f]/u.test(value))invalid();
 return createHmac('sha256',rateKey).update(JSON.stringify([domain,purpose==='recipient'?normalizeStorefrontAccountPhone(value):value])).digest('hex');
}
export type PhoneCompletion=Readonly<{profileRequired:boolean;setCookies:readonly string[]}>;
function completionContext(host:string,challengeId:string,operationId:string){if(!UUID.test(challengeId)||!UUID.test(operationId))invalid();return JSON.stringify(['celebix/storefront-phone-completion/v1',hostname(host),challengeId,operationId]);}
export function sealPhoneCompletion(value:PhoneCompletion,host:string,challengeId:string,operationId:string,ring:StorefrontIdentityKeyring,random:(size:number)=>Uint8Array):string {
 const selected=key(ring),nonce=Buffer.from(random(12)),plain=Buffer.from(JSON.stringify(value));if(nonce.length!==12)invalid();
 const derived=createHmac('sha256',selected.key).update('celebix/storefront-phone-completion-key/v1').digest();
 try{const cipher=createCipheriv('aes-256-gcm',derived,nonce);cipher.setAAD(Buffer.from(completionContext(host,challengeId,operationId)));return `pc1.${selected.keyId}.${nonce.toString('base64url')}.${Buffer.concat([cipher.update(plain),cipher.final()]).toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;}finally{derived.fill(0);plain.fill(0);nonce.fill(0);}
}
export function openPhoneCompletion(value:string,host:string,challengeId:string,operationId:string,ring:StorefrontIdentityKeyring):PhoneCompletion|null {
 let plain:Buffer|undefined,derived:Buffer|undefined;
 try{const match=/^pc1\.([a-z][a-z0-9_-]{2,31})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{1,8192})\.([A-Za-z0-9_-]{22})$/u.exec(value);if(!match)return null;derived=createHmac('sha256',key(ring,match[1]).key).update('celebix/storefront-phone-completion-key/v1').digest();const decipher=createDecipheriv('aes-256-gcm',derived,Buffer.from(match[2]!,'base64url'));decipher.setAAD(Buffer.from(completionContext(host,challengeId,operationId)));decipher.setAuthTag(Buffer.from(match[4]!,'base64url'));plain=Buffer.concat([decipher.update(Buffer.from(match[3]!,'base64url')),decipher.final()]);const row=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='profileRequired,setCookies'||typeof row.profileRequired!=='boolean'||!Array.isArray(row.setCookies)||row.setCookies.length!==3||row.setCookies.some((cookie:unknown)=>typeof cookie!=='string'||cookie.length>2048||/[\r\n]/u.test(cookie))||!row.setCookies[0].startsWith('__Host-celebix_account=a1.')||!row.setCookies[1].startsWith('__Host-celebix_account_csrf=')||!row.setCookies[2].startsWith('__Host-celebix_account_challenge=;'))return null;return Object.freeze({profileRequired:row.profileRequired,setCookies:Object.freeze(row.setCookies)});}catch{return null;}finally{derived?.fill(0);plain?.fill(0);}
}
