import {createCipheriv,createDecipheriv,createHmac,randomBytes} from "node:crypto";
import {parseExactAdminHttpsOrigin} from "../panel-origin.ts";
export type AdminSecurityBridgePayload = Readonly<
 {action:"start";sourceOrigin:string;expiresAt:string;authorizationUrl:string;browserCredential:string;browserExpiresAt:string}
 |{action:"forget";sourceOrigin:string;expiresAt:string;sessionCredential:string;operationId:string}
 |{action:"forget_confirm";sourceOrigin:string;expiresAt:string;sessionCredential:string;operationId:string;deviceCredential:string;nonce:string}
>;
const DOMAIN="celebix/admin-security/bridge/v1",MAX_BYTES=12000;
function invalid():never{throw Error("admin_security_bridge_invalid");}
function origin(value:string):string{const url=new URL(value);if(url.protocol!=="https:"||url.origin!==value||url.username||url.password||url.port)invalid();return value;}
function canonicalToken(value:unknown,prefix:string):string{
 if(typeof value!=="string"||value.length>160)invalid();
 const regex=prefix==="adt1"?/^adt1\.([a-z][a-z0-9_-]{2,31})\.([A-Za-z0-9_-]{43})$/:prefix==="pb1"?/^pb1\.([A-Za-z0-9_-]{43})$/:/^v1\.([A-Za-z0-9._-]{1,64})\.([A-Za-z0-9_-]{43})$/;
 const match=regex.exec(value);if(!match)invalid();const token=match[match.length-1]!;if(Buffer.from(token,"base64url").toString("base64url")!==token)invalid();return value;
}
export function createAdminSecurityBridge(options:{secret:Uint8Array;centralOrigin:string;environment:string;clock?:()=>Date;randomBytes?:(size:number)=>Uint8Array}){
 if(!(options.secret instanceof Uint8Array)||options.secret.length!==32||!/^[a-zA-Z0-9_-]{1,64}$/.test(options.environment))invalid();
 const centralOrigin=origin(options.centralOrigin),clock=options.clock??(()=>new Date()),random=options.randomBytes??randomBytes;
 const key=createHmac("sha256",options.secret).update(JSON.stringify([DOMAIN,"derive",centralOrigin,options.environment])).digest();
 const aad=Buffer.from(JSON.stringify([DOMAIN,"aes-256-gcm",centralOrigin,options.environment]));
 function timestamp(value:unknown,limit:number):string{if(typeof value!=="string")invalid();const time=Date.parse(value),now=clock();if(!Number.isFinite(time)||new Date(time).toISOString()!==value||!(now instanceof Date)||!Number.isFinite(now.getTime())||time<=now.getTime()||time>now.getTime()+limit)invalid();return value;}
 function parse(value:unknown):AdminSecurityBridgePayload{
  if(!value||typeof value!=="object"||Array.isArray(value))invalid();const row=value as Record<string,unknown>;
  const fields=row.action==="start"?["action","sourceOrigin","expiresAt","authorizationUrl","browserCredential","browserExpiresAt"]:row.action==="forget"?["action","sourceOrigin","expiresAt","sessionCredential","operationId"]:row.action==="forget_confirm"?["action","sourceOrigin","expiresAt","sessionCredential","operationId","deviceCredential","nonce"]:[];
  if(!fields.length||Object.keys(row).length!==fields.length||fields.some(field=>!Object.hasOwn(row,field)))invalid();
  const sourceOrigin=parseExactAdminHttpsOrigin(row.sourceOrigin).origin,expiresAt=timestamp(row.expiresAt,600000);
  if(row.action==="forget"||row.action==="forget_confirm"){
   if(typeof row.operationId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.operationId))invalid();
   const forget={sourceOrigin,expiresAt,sessionCredential:canonicalToken(row.sessionCredential,"v1"),operationId:row.operationId};
   if(row.action==="forget")return Object.freeze({action:"forget",...forget});
   if(typeof row.nonce!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(row.nonce)||Buffer.from(row.nonce,"base64url").toString("base64url")!==row.nonce)invalid();
   return Object.freeze({action:"forget_confirm",...forget,deviceCredential:canonicalToken(row.deviceCredential,"adt1"),nonce:row.nonce});
  }
  if(typeof row.authorizationUrl!=="string"||row.authorizationUrl.length>8192)invalid();const url=new URL(row.authorizationUrl);if(url.protocol!=="https:"||url.username||url.password||url.hash||row.authorizationUrl!==url.href)invalid();
  return Object.freeze({action:"start",sourceOrigin,expiresAt,authorizationUrl:url.href,browserCredential:canonicalToken(row.browserCredential,"pb1"),browserExpiresAt:timestamp(row.browserExpiresAt,900000)});
 }
 function decode(value:string):Buffer{if(!/^[A-Za-z0-9_-]+$/.test(value))invalid();const bytes=Buffer.from(value,"base64url");if(bytes.toString("base64url")!==value)invalid();return bytes;}
 return Object.freeze({
  seal(value:AdminSecurityBridgePayload):string{const payload=parse(value),plain=Buffer.from(JSON.stringify(payload)),nonce=Buffer.from(random(12));if(nonce.length!==12||plain.length>MAX_BYTES)invalid();try{const cipher=createCipheriv("aes-256-gcm",key,nonce);cipher.setAAD(aad);return ["ase1",nonce.toString("base64url"),Buffer.concat([cipher.update(plain),cipher.final()]).toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");}finally{plain.fill(0);nonce.fill(0);}},
  open(transfer:string):AdminSecurityBridgePayload{if(typeof transfer!=="string"||transfer.length>16384)invalid();const parts=transfer.split(".");if(parts.length!==4||parts[0]!=="ase1")invalid();const nonce=decode(parts[1]!),encrypted=decode(parts[2]!),tag=decode(parts[3]!);if(nonce.length!==12||encrypted.length>MAX_BYTES||tag.length!==16)invalid();let plain:Buffer|undefined;try{const decipher=createDecipheriv("aes-256-gcm",key,nonce);decipher.setAAD(aad);decipher.setAuthTag(tag);plain=Buffer.concat([decipher.update(encrypted),decipher.final()]);return parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain)));}finally{plain?.fill(0);nonce.fill(0);encrypted.fill(0);tag.fill(0);}}
 });
}
