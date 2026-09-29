import { parseContentAuthoringRequest, parseContentGenerationView } from '../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import { isMerchantActionAllowed, type TenantContext } from "@celebix/saas-contracts";
import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";
import { ContentAuthoringError, safeContentAuthoringError } from "../server-content-authoring/service.ts";
import type { ServerContentAuthoringRuntime } from "../server-content-authoring/runtime.ts";
import { TOSHI_UUID } from "../server-toshi-chat/validation.ts";

type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerContentAuthoringRuntime | null>; now(): Date; requestId(): string; requestBudgetMs?: number }>;
export type ContentGenerationRouteContext = Readonly<{ params: Promise<Readonly<{ id: string }>> }>;
const STATUS: Readonly<Record<string, number>> = {source_preservation_required:409,invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,origin_denied:403,feature_unavailable:503,credential_invalid:401,connection_revoked:409,connection_missing:409,model_unavailable:409,rate_limited:429,quota_exceeded:429,operation_busy:409,operation_mismatch:409,operation_not_found:404,version_conflict:409,lease_expired:409,dispatch_already_claimed:409,invalid_output:502,provider_timeout:504,provider_unavailable:503,commit_unknown:503,cancelled:499,unavailable:503};
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function failure(code: string, status = code === "sensitive_input" ? 400 : STATUS[code] ?? 503) { return json({ code }, status); }
function mapped(error: unknown) { return failure(safeContentAuthoringError(error).code); }
function requestShape(request: Request, pathname: string) {
  try {
    const url = new URL(request.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== pathname || url.search || url.hash) return false;
    for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-celebix") || ["x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url"].includes(name)) return false;
    return true;
  } catch { return false; }
}

type RequestBudget = Readonly<{deadlineAt:number;run<T>(operation:()=>Promise<T>):Promise<T>;active():void;dispose():void}>;
function requestBudget(request:Request,milliseconds=45000):RequestBudget {
 const budgetMs=Math.min(milliseconds,45000),deadlineAt=performance.now()+budgetMs;
 const deadline=new AbortController(),signal=AbortSignal.any([request.signal,deadline.signal]);
 const expired=()=>new ContentAuthoringError(request.signal.aborted?'cancelled':'provider_timeout');
 let rejectAbort:(error:unknown)=>void=()=>{};
 const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});void aborted.catch(()=>{});
 const onAbort=()=>rejectAbort(expired());signal.addEventListener('abort',onAbort,{once:true});
 const timer=setTimeout(()=>deadline.abort(),Math.max(1,budgetMs));
 const active=()=>{if(signal.aborted||performance.now()>=deadlineAt)throw expired();};
 if(signal.aborted)onAbort();
 return {deadlineAt,active,async run<T>(operation:()=>Promise<T>):Promise<T>{active();const value=await Promise.race([operation(),aborted]);active();return value;},dispose(){clearTimeout(timer);signal.removeEventListener('abort',onAbort);}};
}
async function withinRequest(request:Request,deps:Dependencies,operation:(budget:RequestBudget)=>Promise<Response>):Promise<Response>{
 const budget=requestBudget(request,deps.requestBudgetMs);
 try{return await budget.run(()=>operation(budget));}catch(error){return mapped(error);}finally{budget.dispose();}
}

async function body(request: Request, budget:RequestBudget): Promise<unknown> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || !request.body) throw Error("invalid_input");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > 49152)) throw Error("invalid_input");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const next = await budget.run(()=>reader.read()); if (next.done) break; size += next.value.byteLength; if (size > 49152) { void reader.cancel().catch(()=>{}); throw Error("invalid_input"); } chunks.push(next.value); }
    const joined = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)); } finally { joined.fill(0); }
  } finally { void reader.cancel().catch(()=>{});chunks.forEach(chunk => chunk.fill(0)); reader.releaseLock(); }
}
type Authorized = Readonly<{ runtime: ServerContentAuthoringRuntime; tenantContext: TenantContext; now: Date }>;
async function authorize(deps: Dependencies, request: Request, method: "GET" | "POST", pathname: string, budget:RequestBudget): Promise<Authorized | Response> {
  let runtime: ServerContentAuthoringRuntime | null;
  try { runtime = await budget.run(()=>deps.resolveRuntime()); } catch(error) { return mapped(error); }
  if (!runtime) return failure("unavailable");
  if (request.method !== method) return json({ code: "method_not_allowed" }, 405);
  if (method === "POST" && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin)) return failure("origin_denied");
  if (!requestShape(request, pathname)) return failure("invalid_input");
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return failure("unauthenticated");
  const now = deps.now(), requestId = deps.requestId();
  if (!Number.isFinite(now.getTime()) || !TOSHI_UUID.test(requestId)) return failure("unavailable");
  let access;
  try { access = await budget.run(()=>runtime!.access.resolveCredential({ credential: cookie.credential, hostname: request.headers.get("host"), requestId, now })); } catch(error) { return mapped(error); }
  if (access.kind === "unauthenticated") return failure("unauthenticated");
  if (access.kind === "unauthorized") return failure("membership_denied");
  if (access.kind !== "authenticated") return failure("unavailable");
  const tenantContext = access.tenantContext;
  if (method === "POST" && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, tenantContext.store.slug)) return failure("origin_denied");
  if (tenantContext.store.status !== "active") return failure("store_inactive");
  if (tenantContext.membership.status !== "active" || !isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")) return failure("membership_denied");
  if (!runtime.enabled(tenantContext)) return failure("feature_unavailable", 503);
  return { runtime, tenantContext, now };
}
export function createContentAuthoringHttpHandlers(deps: Dependencies) {
 return Object.freeze({
  post(request:Request){return withinRequest(request,deps,async budget=>{
   const auth=await authorize(deps,request,'POST','/api/content-ai/generations',budget);if(auth instanceof Response)return auth;
   const operationId=request.headers.get('idempotency-key');if(!operationId||!TOSHI_UUID.test(operationId))return failure('invalid_input');
   let parsed;try{parsed=parseContentAuthoringRequest(await body(request,budget));}catch(error){return error instanceof ContentAuthoringError?mapped(error):failure('invalid_input');}
   return json({generation:view(await budget.run(()=>auth.runtime.service.generateContent({tenantContext:auth.tenantContext,operationId,request:parsed,signal:request.signal,deadlineAt:budget.deadlineAt})))});
  });},
  get(request:Request,context:ContentGenerationRouteContext){return withinRequest(request,deps,async budget=>{
   let id:string;try{id=(await budget.run(()=>context.params)).id;}catch(error){return error instanceof ContentAuthoringError?mapped(error):failure('invalid_input');}if(!TOSHI_UUID.test(id))return failure('invalid_input');
   const auth=await authorize(deps,request,'GET',`/api/content-ai/generations/${id}`,budget);if(auth instanceof Response)return auth;
   return json({generation:view(await budget.run(()=>auth.runtime.service.getGeneration({tenantContext:auth.tenantContext,operationId:id,now:auth.now})))});
  });}
 });
}

function view(g: import('../../../../packages/saas-data/src/content-authoring/types.ts').ContentGeneration){return parseContentGenerationView({id:g.id,draftId:g.draftId,productId:g.productId,status:g.status,draft:g.draft,sourceFingerprint:g.sourceFingerprint,usage:g.usage,safeCode:g.safeCode,createdAt:g.createdAt,updatedAt:g.updatedAt,finishedAt:g.finishedAt});}
