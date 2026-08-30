import "server-only";
import { createProductPreviewTokenCodec } from "./token.ts";

const KEY_ID=/^[a-z0-9][a-z0-9_-]{0,31}$/;
export function parseProductPreviewConfig(environment:Readonly<Record<string,string|undefined>>){
  const active=environment.CELEBIX_PRODUCT_PREVIEW_ACTIVE_KEY_ID,raw=environment.CELEBIX_PRODUCT_PREVIEW_KEYS;
  if(!active||!KEY_ID.test(active)||!raw)throw new Error("product_preview_config_invalid");
  const keys=new Map<string,Uint8Array>();for(const item of raw.split(",")){const separator=item.indexOf(":");if(separator<1)throw new Error("product_preview_config_invalid");const id=item.slice(0,separator),encoded=item.slice(separator+1),bytes=Buffer.from(encoded,"base64url");if(!KEY_ID.test(id)||bytes.byteLength<32||bytes.toString("base64url")!==encoded||keys.has(id))throw new Error("product_preview_config_invalid");keys.set(id,new Uint8Array(bytes));}
  if(!keys.has(active))throw new Error("product_preview_config_invalid");return Object.freeze({activeKeyId:active,keys});
}
export function productPreviewCodecFromEnvironment(environment:Readonly<Record<string,string|undefined>>=process.env){return createProductPreviewTokenCodec(parseProductPreviewConfig(environment));}
