import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {emailMarketingObject, emailMarketingUuid, emailMarketingInteger, parseEmailMarketingProvider} from '@celebix/saas-contracts';
import type {MerchantProviderCredentialKeyring} from '../provider-execution/credential-crypto.ts';
import type {EmailMarketingCredentialBinding, SealedEmailMarketingCredential} from './types.ts';
function invalid(): never {throw new TypeError('email_marketing_credential_invalid');}
function guarded<T>(run:()=>T):T {try{return run();}catch{return invalid();}}
function id(value:unknown):string {if(typeof value!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(value))invalid();return value;}
function binding(value:unknown):EmailMarketingCredentialBinding {
 const v=emailMarketingObject(value,['storeId','credentialOwnerId','provider','purpose','credentialVersion']);
 if(!['candidate','connection','webhook'].includes(v.purpose as string))invalid();
 return {storeId:emailMarketingUuid(v.storeId),credentialOwnerId:emailMarketingUuid(v.credentialOwnerId),provider:parseEmailMarketingProvider(v.provider),purpose:v.purpose as EmailMarketingCredentialBinding['purpose'],credentialVersion:emailMarketingInteger(v.credentialVersion,1)};
}
function bytes(value:unknown,length?:number):Buffer {
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value)||value.length>22000)invalid();
 const result=Buffer.from(value,'base64url');if(result.toString('base64url')!==value||!result.length||(length!==undefined&&result.length!==length)) {result.fill(0);invalid();}return result;
}
function keys(value:MerchantProviderCredentialKeyring):{active:string;keys:Map<string,Buffer>} {
 const v=emailMarketingObject(value,['activeKeyId','keys']);const active=id(v.activeKeyId);
 if(!Array.isArray(v.keys)||v.keys.length<1||v.keys.length>16)invalid();
 const descriptors=Object.getOwnPropertyDescriptors(v.keys);
 if(Reflect.ownKeys(descriptors).length!==v.keys.length+1)invalid();
 const output=new Map<string,Buffer>();
 try {for(let i=0;i<v.keys.length;i++){
  const d=descriptors[String(i)];if(!d||!('value'in d))invalid();
  const e=emailMarketingObject(d.value,['keyId','key']);const name=id(e.keyId);
  const tag=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),Symbol.toStringTag)!.get!;
  if(typeof e.key!=='object'||e.key===null||Reflect.apply(tag,e.key,[])!=='Uint8Array')invalid();
  const iterator=Uint8Array.prototype.values.call(e.key as Uint8Array);const next=Object.getPrototypeOf(Uint8Array.prototype.values.call(new Uint8Array())).next;const copied=Buffer.alloc(32);let valid=true;for(let n=0;n<33;n++){const step=Reflect.apply(next,iterator,[]) as IteratorResult<number>;if(n===32){valid=step.done===true;break;}if(step.done){valid=false;break;}copied[n]=step.value;}if(!valid){copied.fill(0);invalid();}
  if(copied.length!==32||output.has(name)||[...output.values()].some(k=>k.equals(copied))){copied.fill(0);invalid();}
  output.set(name,copied);
 }if(!output.has(active))invalid();return {active,keys:output};} catch(error){for(const k of output.values())k.fill(0);throw error;}
}
function aad(b:EmailMarketingCredentialBinding,keyId:string):Buffer {return Buffer.from(JSON.stringify(['celebix-email-marketing-credential',1,b.storeId,b.credentialOwnerId,b.provider,b.purpose,b.credentialVersion,keyId]));}
function plaintext(value:unknown):string {if(typeof value!=='string'||!value||value.length>4096||/[\s\x00-\x1f\x7f]/u.test(value))invalid();return value;}
export function sealEmailMarketingCredential(apiKey:string,input:EmailMarketingCredentialBinding,keyring:MerchantProviderCredentialKeyring):SealedEmailMarketingCredential {
 return guarded(()=>{const b=binding(input);const key=plaintext(apiKey);const ring=keys(keyring);const data=Buffer.from(key);const iv=randomBytes(12);const a=aad(b,ring.active);
 try{const cipher=createCipheriv('aes-256-gcm',ring.keys.get(ring.active)!,iv);cipher.setAAD(a);const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);try{return Object.freeze({algorithm:'A256GCM',version:1,keyId:ring.active,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:encrypted.toString('base64url')});}finally{encrypted.fill(0);}}
 finally {data.fill(0);iv.fill(0);a.fill(0);for(const k of ring.keys.values())k.fill(0);}});
}
export function openEmailMarketingCredential(envelope:SealedEmailMarketingCredential,input:EmailMarketingCredentialBinding,keyring:MerchantProviderCredentialKeyring):string {
 return guarded(()=>{const b=binding(input);const v=emailMarketingObject(envelope,['algorithm','version','keyId','iv','tag','ciphertext']);if(v.algorithm!=='A256GCM'||v.version!==1)invalid();const keyId=id(v.keyId);const ring=keys(keyring);const parts:Buffer[]=[];
 try{const key=ring.keys.get(keyId);if(!key)invalid();const iv=bytes(v.iv,12),tag=bytes(v.tag,16),encrypted=bytes(v.ciphertext),a=aad(b,keyId);parts.push(iv,tag,encrypted,a);const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(a);cipher.setAuthTag(tag);parts.push(cipher.update(encrypted));parts.push(cipher.final());const data=Buffer.concat(parts.slice(4));parts.push(data);return plaintext(data.toString('utf8'));}
 finally{for(const p of parts)p.fill(0);for(const k of ring.keys.values())k.fill(0);}});
}
