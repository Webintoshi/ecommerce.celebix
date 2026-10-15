import type{MerchantWhatsAppCommand}from './types.ts';
const binding=['pendingId','pendingDigest','browserDigest','environment'];const actor=['actorTokenKeyId','actorTokenDigest'];const session=['operationId','sessionId','familyId','tokenKeyId','tokenDigest','completionCiphertext'];
const fields:Record<string,{required:string[];optional?:string[]}>= {
 prepare:{required:[...binding,'operationId','purpose','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked','destinationHostname','ipDigest','recipientBudgetDigest','challengeId','codeDigest'],optional:actor},resend:{required:[...binding,'operationId','challengeId','codeDigest','ipDigest','recipientBudgetDigest'],optional:actor},read:{required:binding,optional:actor},finish_delivery:{required:[...binding,'challengeId','status']},verify:{required:[...binding,...session,'challengeId','codeDigest'],optional:actor},claim_signup:{required:[...binding,...session,'storeId']},self_state:{required:actor},staff_list:{required:actor},staff_create:{required:[...actor,'operationId','expectedVersion','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked','displayName','role'],optional:['existingMembershipId']},staff_delete:{required:[...actor,'operationId','staffId','expectedVersion']},staff_update:{required:[...actor,'operationId','staffId','expectedVersion','displayName','role','enabled']}};
function fail():never{throw Error('merchant_whatsapp_invalid_input');}
function object(x:unknown):Record<string,unknown>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.getPrototypeOf(x)!==Object.prototype)fail();return x as Record<string,unknown>;}
export function parseMerchantWhatsAppCommand(value:unknown):MerchantWhatsAppCommand{const c=object(value);if(Object.keys(c).sort().join(',')!=='action,input'||typeof c.action!=='string'||!fields[c.action])fail();const x=object(c.input),f=fields[c.action],allowed=new Set([...f.required,...f.optional??[]]);if(f.required.some(k=>!(k in x))||Object.keys(x).some(k=>!allowed.has(k)))fail();for(const[k,v]of Object.entries(x)){
 if(k==='expectedVersion'){if(!Number.isSafeInteger(v)||(v as number)<0||(v as number)>9007199254740990)fail();continue;}if(k==='enabled'){if(typeof v!=='boolean')fail();continue;}
 if(k==='ipDigest'&&v===null)continue;
 if(typeof v!=='string'||!v||v!==v.trim()||/[\u0000-\u001f\u007f]/u.test(v))fail();
 if(k.endsWith('Digest')&&!/^[a-f0-9]{64}$/u.test(v))fail();
 if(['pendingId','operationId','challengeId','sessionId','familyId','staffId','storeId','existingMembershipId'].includes(k)&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v))fail();
 if(k.endsWith('KeyId')&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(v))fail();
 if(k==='role'&&!['admin','editor','analyst','cashier'].includes(v))fail();if(k==='purpose'&&!['login','bind_phone','signup'].includes(v))fail();if(k==='status'&&!['accepted','failed','ambiguous'].includes(v))fail();
 if(k==='environment'&&!/^[a-zA-Z0-9_-]{1,64}$/u.test(v))fail();
 if(k==='destinationHostname'&&(v.length>253||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(v)))fail();
 if(v.length>(k==='completionCiphertext'?32768:k==='phoneCiphertext'?4096:k==='displayName'?100:512))fail();}
 if(('actorTokenKeyId' in x)!==('actorTokenDigest' in x))fail();
 if(c.action==='prepare'){const both=actor.every(k=>typeof x[k]==='string');if(x.purpose==='bind_phone'?!both:actor.some(k=>k in x))fail();}
 return structuredClone(c)as MerchantWhatsAppCommand;}
