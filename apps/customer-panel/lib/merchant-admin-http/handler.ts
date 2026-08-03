import {
  MERCHANT_ADMIN_PROVIDER_RECORD_KINDS,
  MERCHANT_ADMIN_RECORD_KINDS,
  parseMerchantAdminConfig,
  parseMerchantAdminEvent,
  parseMerchantAdminMutationResult,
  parseMerchantAdminProviderJob,
  parseMerchantAdminProviderJobMutationResult,
  parseMerchantAdminRecord,
  isMerchantActionAllowed,
  type MerchantProviderCapability,
  type MerchantAdminProviderRecordKind,
  type MerchantAdminRecordKind,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  MERCHANT_ADMIN_ERROR_CODES,
  MerchantAdminRepositoryError,
  parseCanonicalAdminOriginFromPanelOrigin,
  type MerchantAdminErrorCode,
} from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerMerchantAdminRuntime } from "../server-merchant-admin/runtime.ts";
import type { ServerProviderExecutionRuntime } from "../server-provider-execution/runtime.ts";

const BASE = "/api/merchant-admin";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STATUS: Readonly<Record<MerchantAdminErrorCode, number>> = Object.freeze({
  invalid_input: 400, unauthenticated: 401, membership_denied: 403,
  store_inactive: 403, feature_not_enabled: 403, record_not_found: 404,
  profile_not_found: 404, provider_capability_mismatch: 409, provider_disabled: 409,
  invalid_transition: 409, version_conflict: 409, operation_mismatch: 409,
  operation_not_found: 404, durable_authority_invalid: 409, unavailable: 503,
});
type Deps = Readonly<{ resolveRuntime(): Promise<ServerMerchantAdminRuntime | null>; resolveProviderRuntime?(access: ServerMerchantAdminRuntime["access"]): Promise<ServerProviderExecutionRuntime | null>; now(): Date; requestId(): string }>;
type Authorized = Readonly<{ runtime: ServerMerchantAdminRuntime; tenantContext: TenantContext; now: Date }>;

function json(value: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}
function error(code: string, status: number, extra?: HeadersInit) { return json({ code }, status, extra); }
function isResponse(value: unknown): value is Response { return value instanceof Response; }
function object(value: unknown) { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value as Record<string, unknown> : null; }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []) { const parsed = object(value), allowed = new Set([...required, ...optional]); return !parsed || required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key)) ? null : parsed; }
function privateHeaders(request: Request) { for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-celebix") || ["x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-url"].includes(name)) return true; return false; }
function approvedMutationOrigin(request: Request, panelOrigin: string) { const requestOrigin=request.headers.get("origin");if(requestOrigin===panelOrigin)return true;const requestHostname=request.headers.get("host");if(requestOrigin===null||requestHostname===null)return false;try{return parseCanonicalAdminOriginFromPanelOrigin(requestOrigin,panelOrigin).hostname===requestHostname}catch{return false} }
function operation(request: Request) { const value = request.headers.get("idempotency-key"); return value && UUID.test(value) && !value.includes(",") ? value : null; }
function kind(value: unknown): MerchantAdminRecordKind | null { return MERCHANT_ADMIN_RECORD_KINDS.includes(value as never) ? value as MerchantAdminRecordKind : null; }
function providerKind(value: unknown): MerchantAdminProviderRecordKind | null { return MERCHANT_ADMIN_PROVIDER_RECORD_KINDS.includes(value as never) ? value as MerchantAdminProviderRecordKind : null; }
function providerCapability(value: MerchantAdminProviderRecordKind): MerchantProviderCapability { const capabilities: Readonly<Record<MerchantAdminProviderRecordKind,MerchantProviderCapability>>=Object.freeze({marketplace_connection:"marketplace_sync",email_campaign:"email_delivery",phone_campaign:"phone_delivery",whatsapp_campaign:"whatsapp_delivery",invoice_integration:"invoice_reconciliation",indexing_request:"indexing"});return capabilities[value]; }
function id(value: unknown) { return typeof value === "string" && UUID.test(value) ? value : null; }
function version(value: unknown) { return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null; }

async function body(request: Request) {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > 32_768)) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > 32_768) { await reader.cancel().catch(() => undefined); return null; } chunks.push(new Uint8Array(next.value)); } } catch { return null; }
  if (!total) return null;
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
}

async function authorize(deps: Deps, request: Request, method: "GET" | "POST", pathname: string): Promise<Response | Authorized> {
  let runtime;
  try { runtime = await deps.resolveRuntime(); } catch { return error("unavailable", 503); }
  if (!runtime) return error("unavailable", 503);
  if (request.method !== method) return error("method_not_allowed", 405, { allow: method });
  if (method === "POST" && !approvedMutationOrigin(request, runtime.access.panelOrigin)) return error("origin_denied", 403);
  let url: URL;
  try { url = new URL(request.url); } catch { return error("invalid_input", 400); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== pathname || url.search || url.hash || privateHeaders(request)) return error("invalid_input", 400);
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return error("unauthenticated", 401);
  let now: Date, requestId: string;
  try { now = deps.now(); requestId = deps.requestId(); } catch { return error("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return error("unavailable", 503);
  let access: ServerPanelAccessResult;
  try { access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now) }); } catch { return error("unavailable", 503); }
  if (access.kind === "unauthenticated") return error("unauthenticated", 401);
  if (access.kind === "unauthorized") return error("membership_denied", 403);
  if (access.kind !== "authenticated") return error("unavailable", 503);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function repositoryError(value: unknown) { return value instanceof MerchantAdminRepositoryError && MERCHANT_ADMIN_ERROR_CODES.includes(value.code) ? error(value.code, STATUS[value.code]) : error("unavailable", 503); }
async function execute(run: () => Promise<unknown>, parser: (value: unknown) => unknown) { try { return json(parser(await run())); } catch (caught) { return repositoryError(caught); } }
function items(value: unknown, parser: (entry: unknown) => unknown, maximum = 200) { if (!Array.isArray(value) || value.length > maximum) throw new TypeError(); return Object.freeze({ items: Object.freeze(value.map(parser)) }); }
function saveInput(raw: unknown) { const parsed = exact(raw, ["name", "config", "status"], ["recordId", "expectedVersion"]); if (!parsed || typeof parsed.name !== "string" || parsed.name.length < 1 || parsed.name.length > 160 || parsed.name !== parsed.name.trim() || (parsed.status !== "draft" && parsed.status !== "active") || (parsed.recordId !== undefined && (!id(parsed.recordId) || !version(parsed.expectedVersion))) || (parsed.recordId === undefined && parsed.expectedVersion !== undefined)) return null; let config; try { config = parseMerchantAdminConfig(parsed.config); } catch { return null; } return Object.freeze({ ...(parsed.recordId ? { recordId: parsed.recordId as string, expectedVersion: parsed.expectedVersion as number } : {}), name: parsed.name, config, status: parsed.status }); }

export function createMerchantAdminHttpHandlers(deps: Deps) {
  return Object.freeze({
    async records(request: Request, rawKind: string) { const recordKind = kind(rawKind), authorized = await authorize(deps, request, "GET", `${BASE}/records/${rawKind}`); if (isResponse(authorized)) return authorized; if (!recordKind) return error("invalid_input", 400); return execute(() => authorized.runtime.merchantAdmin.list({ tenantContext: authorized.tenantContext, now: authorized.now, kind: recordKind }), (value) => items(value, parseMerchantAdminRecord)); },
    async record(request: Request, rawKind: string, rawId: string) { const recordKind = kind(rawKind), recordId = id(rawId); if (!recordKind || !recordId) return error("invalid_input", 400); const authorized = await authorize(deps, request, "GET", `${BASE}/records/${recordKind}/${recordId}`); return isResponse(authorized) ? authorized : execute(() => authorized.runtime.merchantAdmin.get({ tenantContext: authorized.tenantContext, now: authorized.now, kind: recordKind, recordId }), parseMerchantAdminRecord); },
    async events(request: Request, rawKind: string) { const recordKind = kind(rawKind), authorized = await authorize(deps, request, "GET", `${BASE}/events/${rawKind}`); if (isResponse(authorized)) return authorized; if (!recordKind) return error("invalid_input", 400); return execute(() => authorized.runtime.merchantAdmin.listEvents({ tenantContext: authorized.tenantContext, now: authorized.now, kind: recordKind }), (value) => items(value, parseMerchantAdminEvent)); },
    async providerJobs(request: Request, rawKind: string) { const recordKind = providerKind(rawKind), authorized = await authorize(deps, request, "GET", `${BASE}/provider-jobs/${rawKind}`); if (isResponse(authorized)) return authorized; if (!recordKind) return error("invalid_input", 400); return execute(() => authorized.runtime.merchantAdmin.listProviderJobs({ tenantContext: authorized.tenantContext, now: authorized.now, kind: recordKind }), (value) => items(value, parseMerchantAdminProviderJob, 100)); },
    async save(request: Request, rawKind: string) { const recordKind = kind(rawKind), authorized = await authorize(deps, request, "POST", `${BASE}/records/${rawKind}`); if (isResponse(authorized)) return authorized; const operationId = operation(request), input = saveInput(await body(request)); return recordKind && operationId && input ? execute(() => authorized.runtime.merchantAdmin.save({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, kind: recordKind, ...input }), parseMerchantAdminMutationResult) : error("invalid_input", 400); },
    async archive(request: Request, rawKind: string, rawId: string) { const recordKind = kind(rawKind), recordId = id(rawId), authorized = await authorize(deps, request, "POST", `${BASE}/records/${rawKind}/${rawId}/archive`); if (isResponse(authorized)) return authorized; const operationId = operation(request), parsed = exact(await body(request), ["expectedVersion"]), expectedVersion = parsed ? version(parsed.expectedVersion) : null; return recordKind && recordId && operationId && expectedVersion ? execute(() => authorized.runtime.merchantAdmin.archive({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, recordId, expectedVersion }), parseMerchantAdminMutationResult) : error("invalid_input", 400); },
    async prepareProviderJob(request: Request, rawKind: string) { const recordKind = providerKind(rawKind), authorized = await authorize(deps, request, "POST", `${BASE}/provider-jobs/${rawKind}`); if (isResponse(authorized)) return authorized; const operationId = operation(request), parsed = exact(await body(request), ["recordId", "expectedRecordVersion"]), recordId = parsed ? id(parsed.recordId) : null, expectedRecordVersion = parsed ? version(parsed.expectedRecordVersion) : null; return recordKind && operationId && recordId && expectedRecordVersion ? execute(() => authorized.runtime.merchantAdmin.prepareProviderJob({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, recordId, expectedRecordVersion, kind: recordKind }), parseMerchantAdminProviderJobMutationResult) : error("invalid_input", 400); },
    async queueProviderJob(request: Request, rawKind: string, rawJobId: string) { const recordKind=providerKind(rawKind),jobId=id(rawJobId),authorized=await authorize(deps,request,"POST",`${BASE}/provider-jobs/${rawKind}/${rawJobId}/queue`);if(isResponse(authorized))return authorized;if(!recordKind||!jobId)return error("invalid_input",400);if(!isMerchantActionAllowed(authorized.tenantContext.membership.role,"integrations.manage"))return error("membership_denied",403);const operationId=operation(request),parsed=exact(await body(request),["expectedJobVersion","profileId","expectedProfileVersion"]),expectedJobVersion=parsed?version(parsed.expectedJobVersion):null,profileId=parsed?id(parsed.profileId):null,expectedProfileVersion=parsed?version(parsed.expectedProfileVersion):null;if(!operationId||!expectedJobVersion||!profileId||!expectedProfileVersion)return error("invalid_input",400);let providerRuntime;try{providerRuntime=deps.resolveProviderRuntime?await deps.resolveProviderRuntime(authorized.runtime.access):null}catch{return error("unavailable",503)}if(!providerRuntime)return error("unavailable",503);const capability=providerCapability(recordKind);let profiles;try{profiles=await providerRuntime.profiles.list({tenantContext:authorized.tenantContext,now:authorized.now,capability})}catch(caught){return caught instanceof MerchantAdminRepositoryError?repositoryError(caught):error("unavailable",503)}const profile=profiles.find((entry)=>entry.id===profileId);if(!profile)return error("profile_not_found",404);if(profile.capability!==capability)return error("provider_capability_mismatch",409);if(profile.status!=="active")return error("provider_disabled",409);if(profile.version!==expectedProfileVersion)return error("version_conflict",409);if(providerRuntime.registry.get(profile.providerCode,profile.capability)===null)return error("unavailable",503);return execute(()=>authorized.runtime.merchantAdmin.queueProviderJob({tenantContext:authorized.tenantContext,now:authorized.now,operationId,jobId,expectedJobVersion,profileId,expectedProfileVersion,kind:recordKind}),parseMerchantAdminProviderJobMutationResult); },
    async cancelProviderJob(request: Request, rawKind: string, rawJobId: string) { const recordKind = providerKind(rawKind), jobId = id(rawJobId), authorized = await authorize(deps, request, "POST", `${BASE}/provider-jobs/${rawKind}/${rawJobId}/cancel`); if (isResponse(authorized)) return authorized; const operationId = operation(request), parsed = exact(await body(request), ["expectedVersion"]), expectedVersion = parsed ? version(parsed.expectedVersion) : null; return recordKind && jobId && operationId && expectedVersion ? execute(() => authorized.runtime.merchantAdmin.cancelProviderJob({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, jobId, expectedVersion, kind: recordKind }), parseMerchantAdminProviderJobMutationResult) : error("invalid_input", 400); },
  });
}
