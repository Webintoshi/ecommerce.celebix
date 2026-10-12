import type {AdminLoginSecurityCommand,AdminLoginInvalidationInput} from './types.ts';
const binding=['pendingId','pendingDigest','browserDigest','environment'];
const identity=['issuer','subject','destinationHostname','environment'];
const management=['operationId','tokenKeyId','tokenDigest','purpose','destinationHostname','environment','browserDigest'];
const session=['operationId','sessionId','familyId','tokenKeyId','tokenDigest'];
const fields:Record<string,{required:string[];optional?:string[]}>= {
 inspect_identity:{required:identity},
 begin:{required:[...new Set([...binding,...identity]),'passwordProofDigest','passwordVerifiedAt','operationId'],optional:['purpose']},
 read:{required:binding},
 prepare_otp:{required:[...binding,'challengeId','otpDigest','recipientDigest'],optional:['phoneCiphertext','phoneMasked','ipDigest']},
 finish_delivery:{required:[...binding,'challengeId','status']},
 verify_otp:{required:[...binding,...session,'challengeId','otpDigest'],optional:['backupDigests','rememberTrustDigest','completionCiphertext']},
 verify_backup:{required:[...binding,...session,'backupDigest'],optional:['completionCiphertext']},
 verify_trust:{required:[...binding,...session,'trustDigest'],optional:['completionCiphertext']},
 security_state:{required:['tokenKeyId','tokenDigest'],optional:['destinationHostname']},
 forget_devices:{required:['operationId','tokenKeyId','tokenDigest'],optional:['trustDigest','deviceId']},
 prepare_management:{required:management},
 read_management:{required:management},
 finish_management:{required:[...management,'completionCiphertext']},
 regenerate_backups:{required:[...binding,'operationId','backupDigests'],optional:['completionCiphertext']},
};
function fail():never{throw new Error('admin_login_security_invalid_input');}
function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)fail();return v as Record<string,unknown>;}
function validate(input:unknown,required:string[],optional:string[]=[]){const p=record(input),allowed=new Set([...required,...optional,'now']);if(required.some(k=>p[k]===undefined)||Object.keys(p).some(k=>!allowed.has(k)))fail();for(const[k,v]of Object.entries(p)){
 if(k==='backupDigests'){if(!Array.isArray(v)||v.length!==10||new Set(v).size!==10||v.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x)))fail();continue;}
 if(typeof v!=='string'||!v||v!==v.trim()||/[\u0000-\u001f\u007f]/.test(v))fail();
 if(k.endsWith('Digest')&&!/^[a-f0-9]{64}$/.test(v))fail();
 if(['pendingId','challengeId','operationId','sessionId','familyId','deviceId'].includes(k)&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v))fail();
 if(['now','passwordVerifiedAt'].includes(k)&&(!Number.isFinite(Date.parse(v))||!v.endsWith('Z')))fail();
 if(k==='destinationHostname'&&(v.length>253||v!==v.toLowerCase()||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v)))fail();
 if(k==='status'&&!['accepted','failed','ambiguous'].includes(v))fail();
 if(k==='purpose'&&!['login','change_phone','manage'].includes(v))fail();
 if(k==='environment'&&!/^[a-zA-Z0-9_-]{1,64}$/.test(v))fail();
 if(k==='tokenKeyId'&&(!/^[A-Za-z0-9._-]{1,64}$/.test(v)||/^\.|\.$|\.\./.test(v)))fail();
 const max=k==='completionCiphertext'?32768:k==='phoneCiphertext'?4096:k==='issuer'?2048:512;if(v.length>max)fail();
 }return p;}
export function parseAdminLoginSecurityCommand(value:unknown):AdminLoginSecurityCommand{const c=record(value);if(Object.keys(c).length!==2||typeof c.action!=='string'||!fields[c.action])fail();const f=fields[c.action];const p=validate(c.input,f.required,f.optional);if(c.action.endsWith('_management')&&!['manage','change_phone'].includes(String(p.purpose)))fail();return structuredClone(c) as AdminLoginSecurityCommand;}
export function parseAdminLoginInvalidationInput(value:unknown):AdminLoginInvalidationInput{const p=validate(value,['issuer','subject','eventId','reason'],['operatorId','supportReason']);if(!['password_reset','identity_reset','suspension','deletion','support_reset'].includes(String(p.reason)))fail();if(p.reason==='support_reset'&&(!p.operatorId||typeof p.supportReason!=='string'||p.supportReason.length<10))fail();return structuredClone(p) as AdminLoginInvalidationInput;}
