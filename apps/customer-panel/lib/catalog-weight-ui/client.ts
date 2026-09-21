import {parseCatalogWeightEditorProjection,type CatalogWeightEditorProjection,type CatalogWeightSaveIntent} from "@celebix/saas-contracts";
export class CatalogWeightApiError extends Error{constructor(readonly code:string,readonly status:number){super(code);this.name="CatalogWeightApiError";}}
async function request(productId:string,init?:RequestInit):Promise<CatalogWeightEditorProjection>{
  const response=await fetch(`/api/catalog-weight/products/${encodeURIComponent(productId)}`,{credentials:"same-origin",cache:"no-store",...init});
  const raw=await response.json().catch(()=>null);if(!response.ok){const code=raw&&typeof raw==="object"&&typeof(raw as{code?:unknown}).code==="string"?(raw as{code:string}).code:"unavailable";throw new CatalogWeightApiError(code,response.status);}
  try{return parseCatalogWeightEditorProjection(raw);}catch{throw new CatalogWeightApiError("invalid_response",503);}
}
export const catalogWeightClient=Object.freeze({
  get:(productId:string)=>request(productId),
  save:(productId:string,input:Readonly<{declarationId:string;expectedVariantVersion:number|null;intent:CatalogWeightSaveIntent}>)=>request(productId,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)}),
});
