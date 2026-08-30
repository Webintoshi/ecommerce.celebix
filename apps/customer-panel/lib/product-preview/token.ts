import { createHmac, timingSafeEqual } from "node:crypto";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY_ID=/^[a-z0-9][a-z0-9_-]{0,31}$/;
export type ProductPreviewBinding=Readonly<{storeId:string;productId:string;principalId:string;version:number}>;
type Keys=Readonly<{activeKeyId:string;keys:ReadonlyMap<string,Uint8Array>;ttlSeconds?:number}>;
function invalid():never{throw new Error("product_preview_token_invalid");}
function binding(value:ProductPreviewBinding){if(!value||!UUID.test(value.storeId)||!UUID.test(value.productId)||!UUID.test(value.principalId)||!Number.isSafeInteger(value.version)||value.version<1)invalid();return value;}
function canonical(value:ProductPreviewBinding,expiresAt:number){return JSON.stringify({storeId:value.storeId,productId:value.productId,principalId:value.principalId,version:value.version,expiresAt});}
export function createProductPreviewTokenCodec(options:Keys){
  const ttl=options.ttlSeconds??300;if(!KEY_ID.test(options.activeKeyId)||!Number.isSafeInteger(ttl)||ttl<1||ttl>300||!(options.keys instanceof Map)||!options.keys.has(options.activeKeyId))invalid();
  const keys=new Map<string,Buffer>();for(const [id,key] of options.keys){if(!KEY_ID.test(id)||!(key instanceof Uint8Array)||key.byteLength<32||keys.has(id))invalid();keys.set(id,Buffer.from(key));}
  const sign=(id:string,payload:string)=>createHmac("sha256",keys.get(id)!).update(`celebix-product-preview-v1\n${id}\n${payload}`).digest("base64url");
  return Object.freeze({
    issue(value:ProductPreviewBinding,now:Date){binding(value);if(!(now instanceof Date)||!Number.isFinite(now.getTime()))invalid();const expiresAt=Math.floor(now.getTime()/1000)+ttl,payload=Buffer.from(canonical(value,expiresAt)).toString("base64url"),id=options.activeKeyId;return `pp1.${id}.${payload}.${sign(id,payload)}`;},
    verify(token:string,expected:ProductPreviewBinding,now:Date){binding(expected);if(typeof token!=="string"||token.length>2048||!(now instanceof Date)||!Number.isFinite(now.getTime()))return false;const parts=token.split(".");if(parts.length!==4||parts[0]!=="pp1"||!KEY_ID.test(parts[1]!))return false;const key=keys.get(parts[1]!);if(!key)return false;let decoded:Buffer;try{decoded=Buffer.from(parts[2]!,"base64url");if(decoded.toString("base64url")!==parts[2])return false;}catch{return false;}let parsed:any;try{parsed=JSON.parse(decoded.toString("utf8"));}catch{return false;}if(JSON.stringify(parsed)!==decoded.toString("utf8")||JSON.stringify(parsed)!==canonical(expected,parsed.expiresAt)||!Number.isSafeInteger(parsed.expiresAt)||parsed.expiresAt<=Math.floor(now.getTime()/1000)||parsed.expiresAt>Math.floor(now.getTime()/1000)+300)return false;const actual=Buffer.from(parts[3]!,"base64url"),wanted=Buffer.from(sign(parts[1]!,parts[2]!),"base64url");return actual.toString("base64url")===parts[3]&&actual.byteLength===wanted.byteLength&&timingSafeEqual(actual,wanted);},
  });
}
