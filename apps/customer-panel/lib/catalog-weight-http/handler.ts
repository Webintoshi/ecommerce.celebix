import { isCatalogProductOperationAllowed,parseCatalogWeightEditorProjection,parseCatalogWeightSaveIntent,type TenantContext } from "@celebix/saas-contracts";
import { catalogWeightRepositoryErrorCode } from "@celebix/saas-data";
import { approvedPanelMutationOriginForStore,hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";
import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerCatalogWeightRuntime } from "../server-catalog-weight/runtime.ts";

type Dependencies=Readonly<{resolveRuntime():Promise<ServerCatalogWeightRuntime|null>;now():Date;requestId():string}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PRIVATE=new Set(["authorization","x-panel-session-credential","x-store-id","x-tenant-id","x-principal-id","x-membership-id","x-database-role","x-database-url"]);
function response(value:unknown,status=200,extra?:HeadersInit){const headers=new Headers(extra);headers.set("cache-control","no-store");headers.set("x-content-type-options","nosniff");return Response.json(value,{status,headers});}
function error(code:string,status:number,extra?:HeadersInit){return response({code},status,extra);}
function id(value:unknown){if(typeof value!=="string"||!UUID.test(value))throw new TypeError();return value;}
function exact(value:unknown,keys:readonly string[]){if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new TypeError();const parsed=value as Record<string,unknown>;if(Object.keys(parsed).sort().join(",")!==[...keys].sort().join(","))throw new TypeError();return parsed;}
function repositoryError(value:unknown){const code=catalogWeightRepositoryErrorCode(value);if(code==="invalid_input")return error("invalid_input",400);if(code==="resource_not_found")return error("not_found",404);if(code==="version_conflict"||code==="operation_mismatch")return error("conflict",409);if(code==="unauthenticated")return error("unauthenticated",401);if(code==="membership_denied"||code==="store_inactive"||code==="feature_not_enabled"||code==="profile_not_enabled"||code==="durable_authority_invalid")return error("forbidden",403);return error("unavailable",503);}
async function body(request:Request):Promise<unknown|null>{
  if(request.headers.get("content-type")!=="application/json"||request.body===null||request.headers.has("transfer-encoding"))return null;
  const declared=request.headers.get("content-length");if(declared!==null&&(!/^(?:0|[1-9][0-9]*)$/u.test(declared)||Number(declared)>16_384))return null;
  const text=await request.text().catch(()=>"");if(text.length===0||new TextEncoder().encode(text).byteLength>16_384)return null;
  try{return JSON.parse(text);}catch{return null;}
}
async function authorize(dependencies:Dependencies,request:Request,method:"GET"|"POST"):Promise<Response|Readonly<{runtime:ServerCatalogWeightRuntime;tenantContext:TenantContext;now:Date}>>{
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=="present")return error("unauthenticated",401);
  let runtime:ServerCatalogWeightRuntime|null;try{runtime=await dependencies.resolveRuntime();}catch{return error("unavailable",503);}if(!runtime)return error("unavailable",503);
  if(method==="POST"&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return error("forbidden",403);
  const now=dependencies.now(),requestId=dependencies.requestId();if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!UUID.test(requestId))return error("unavailable",503);
  let access:ServerPanelAccessResult;try{access=await runtime.access.resolveCredential({hostname:request.headers.get("host"),credential:cookie.credential,requestId,now:new Date(now)});}catch{return error("unavailable",503);}
  if(access.kind==="unauthenticated")return error("unauthenticated",401);if(access.kind==="unauthorized")return error("forbidden",403);if(access.kind!=="authenticated")return error("unavailable",503);
  if(method==="POST"&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return error("forbidden",403);
  if(!isCatalogProductOperationAllowed(access.tenantContext.membership.role,method==="GET"?"read":"update"))return error("forbidden",403);
  return Object.freeze({runtime,tenantContext:access.tenantContext,now:new Date(now)});
}
export function createCatalogWeightHttpHandler(dependencies:Dependencies){
  return async(request:Request):Promise<Response>=>{
    for(const[name]of request.headers)if(PRIVATE.has(name)||name.startsWith("x-celebix-"))return error("invalid_input",400);
    const url=new URL(request.url);const match=/^\/api\/catalog-weight\/products\/([0-9a-f-]{36})$/u.exec(url.pathname);
    if(!match||url.search!==""||url.hash!=="")return error("not_found",404);let productId:string;try{productId=id(match[1]);}catch{return error("not_found",404);}
    if(request.method!=="GET"&&request.method!=="POST")return error("method_not_allowed",405,{allow:"GET, POST"});
    let mutation:Readonly<{declarationId:string;expectedVariantVersion:number|null;intent:ReturnType<typeof parseCatalogWeightSaveIntent>}>|undefined;
    if(request.method==="GET"){if(request.body!==null||request.headers.has("content-type")||request.headers.has("content-length"))return error("invalid_input",400);}
    else{try{const parsed=exact(await body(request),["declarationId","expectedVariantVersion","intent"]);const expected=parsed.expectedVariantVersion;if(expected!==null&&(!Number.isSafeInteger(expected)||(expected as number)<1))throw new TypeError();mutation=Object.freeze({declarationId:id(parsed.declarationId),expectedVariantVersion:expected as number|null,intent:parseCatalogWeightSaveIntent(parsed.intent)});}catch{return error("invalid_input",400);}}
    const authorized=await authorize(dependencies,request,request.method);if(authorized instanceof Response)return authorized;
    try{
      const result=request.method==="GET"?await authorized.runtime.catalogWeight.get({tenantContext:authorized.tenantContext,now:authorized.now,productId}):await authorized.runtime.catalogWeight.save({tenantContext:authorized.tenantContext,now:authorized.now,productId,...mutation!});
      return response(parseCatalogWeightEditorProjection(result));
    }catch(caught){return repositoryError(caught);}
  };
}
