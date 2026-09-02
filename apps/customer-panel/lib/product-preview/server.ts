import "server-only";
import { isCatalogProductOperationAllowed } from "@celebix/saas-contracts";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import type { ServerCatalogRuntime } from "../server-catalog/runtime.ts";
import type { ProductPreviewBinding } from "./token.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Codec=Readonly<{issue(binding:ProductPreviewBinding,now:Date):string;verify(token:string,binding:ProductPreviewBinding,now:Date):boolean}>;
type Dependencies=Readonly<{resolveRuntime():Promise<ServerCatalogRuntime|null>;codec():Codec;now():Date;requestId():string}>;
function json(value:unknown,status=200){return Response.json(value,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff","x-robots-tag":"noindex, nofollow"}});}
async function authority(deps:Dependencies,request:Request,productId:unknown,mutation:boolean){
  if(typeof productId!=="string"||!UUID.test(productId)||["authorization","x-store-id","x-principal-id","x-membership-id","x-plan-id","x-database-role"].some((name)=>request.headers.has(name)))return json({code:"invalid_input"},400);
  let runtime:ServerCatalogRuntime|null;try{runtime=await deps.resolveRuntime();}catch{return json({code:"unavailable"},503);}if(!runtime)return json({code:"unavailable"},503);
  const cookie=readPersistentPanelSessionCookie(request);if(cookie.kind!=="present")return json({code:"unauthenticated"},401);
  const now=deps.now(),requestId=deps.requestId();if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!UUID.test(requestId))return json({code:"unavailable"},503);
  let access;try{access=await runtime.access.resolveCredential({hostname:request.headers.get("host"),credential:cookie.credential,requestId,now:new Date(now)});}catch{return json({code:"unavailable"},503);}if(access.kind==="unauthenticated")return json({code:"unauthenticated"},401);if(access.kind!=="authenticated")return json({code:access.kind==="unauthorized"?"membership_denied":"unavailable"},access.kind==="unauthorized"?403:503);
  if(!isCatalogProductOperationAllowed(access.tenantContext.membership.role,"read"))return json({code:"membership_denied"},403);
  if(mutation&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return json({code:"origin_denied"},403);
  return {runtime,tenantContext:access.tenantContext,now,productId};
}
export function createProductPreviewHandlers(deps:Dependencies){return Object.freeze({
  async issue(request:Request,productId:unknown){const selected=await authority(deps,request,productId,true);if(selected instanceof Response)return selected;try{const preview=await selected.runtime.catalog.getProductPreview({tenantContext:selected.tenantContext,now:selected.now,productId:selected.productId});if(preview.product.status==="archived")return json({code:"product_not_found"},404);if(preview.product.status==="active")return json({kind:"active",url:preview.canonicalStorefrontUrl});const token=deps.codec().issue({storeId:selected.tenantContext.store.id,productId:selected.productId,principalId:selected.tenantContext.principal.id,version:preview.product.version},selected.now);return json({kind:"draft",url:`/products/${selected.productId}/preview?token=${encodeURIComponent(token)}`});}catch{return json({code:"unavailable"},503);}},
  async redeem(request:Request,productId:unknown){const selected=await authority(deps,request,productId,false);if(selected instanceof Response)return selected;let url:URL;try{url=new URL(request.url);}catch{return json({code:"invalid_input"},400);}if([...url.searchParams.keys()].join(",")!=="token")return json({code:"invalid_input"},400);const token=url.searchParams.get("token");if(!token)return json({code:"invalid_input"},400);try{const preview=await selected.runtime.catalog.getProductPreview({tenantContext:selected.tenantContext,now:selected.now,productId:selected.productId});const valid=preview.product.status!=="archived"&&deps.codec().verify(token,{storeId:selected.tenantContext.store.id,productId:selected.productId,principalId:selected.tenantContext.principal.id,version:preview.product.version},selected.now);return valid?json({preview}):json({code:"preview_denied"},403);}catch{return json({code:"product_not_found"},404);}},
});}
