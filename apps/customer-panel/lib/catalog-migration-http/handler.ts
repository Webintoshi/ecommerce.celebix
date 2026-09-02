import type { TenantContext } from "@celebix/saas-contracts";
import { CATALOG_MIGRATION_ERROR_CODES, CatalogMigrationRepositoryError, type CatalogMigrationRepository } from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import type { ProductMediaUploadService } from "../server-media/upload-service.ts";
import { ingestMigrationMediaItem } from "../catalog-migration/media-ingestion.ts";
import { validateCatalogMigrationRequestAuthority } from "./request-authority.ts";

const BASE = "/api/catalog/admin/migrations/woocommerce";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SOURCE_ID = /^[1-9][0-9]{0,19}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_BODY = 1_048_576;

export type CatalogMigrationHttpRuntime = Readonly<{
  access: ServerPanelAccessRuntime & Readonly<{ readiness: Readonly<{ mode: "approved_staging" }>; panelOrigin: string }>;
  migration: CatalogMigrationRepository;
  upload: ProductMediaUploadService;
}>;

type Dependencies = Readonly<{
  resolveRuntime(): Promise<CatalogMigrationHttpRuntime | null>;
  now(): Date;
  requestId(): string;
  ingestMedia?: typeof ingestMigrationMediaItem;
}>;
type Context = Readonly<{ params: Promise<Readonly<{ jobId: string }>> }>;
type Authorized = Readonly<{ runtime: CatalogMigrationHttpRuntime; tenantContext: TenantContext; now: Date }>;

const STATUS: Readonly<Record<string, number>> = Object.freeze({
  invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403,
  durable_authority_invalid: 409, job_not_found: 404, media_not_found: 404, job_mismatch: 409,
  media_state_invalid: 409, product_limit_reached: 409, import_conflict: 409, operation_mismatch: 409,
  operation_not_found: 404, unavailable: 503,
});
function json(value: unknown, status = 200, headers?: HeadersInit) { const selected = new Headers(headers); selected.set("cache-control", "no-store"); selected.set("x-content-type-options", "nosniff"); return Response.json(value, { status, headers: selected }); }
function error(code: string, status: number, headers?: HeadersInit) { return json({ code }, status, headers); }
function record(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value as Record<string, unknown> : null; }
function exact(value: unknown, required: readonly string[]): Record<string, unknown> | null { const parsed = record(value); return parsed && required.every((key) => Object.hasOwn(parsed, key)) && Object.keys(parsed).every((key) => required.includes(key)) ? parsed : null; }
function operation(request: Request): string | null { const selected = request.headers.get("idempotency-key"); return selected && UUID.test(selected) && !selected.includes(",") ? selected : null; }
async function body(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_BODY)) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > MAX_BODY) { await reader.cancel().catch(() => undefined); return null; } chunks.push(new Uint8Array(next.value)); }
  } catch { return null; }
  if (!total) return null;
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
}
function repositoryError(caught: unknown): Response {
  return caught instanceof CatalogMigrationRepositoryError && CATALOG_MIGRATION_ERROR_CODES.includes(caught.code)
    ? error(caught.code, STATUS[caught.code] ?? 503) : error("unavailable", 503);
}
async function authorize(dependencies: Dependencies, request: Request, method: "GET" | "POST", pathname: string): Promise<Response | Authorized> {
  let runtime: CatalogMigrationHttpRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); } catch { return error("unavailable", 503); }
  if (!runtime) return error("unavailable", 503);
  const authority = validateCatalogMigrationRequestAuthority(request, { method, pathname, panelOrigin: runtime.access.panelOrigin });
  if (authority === "method_not_allowed") return error("method_not_allowed", 405, { allow: method });
  if (authority === "origin_denied") return error("origin_denied", 403);
  if (authority !== "allowed") return error(authority, authority === "unavailable" ? 503 : 400);
  const cookie = readOrderPanelSessionCookie(request); if (cookie.kind !== "present") return error("unauthenticated", 401);
  let now: Date; let requestId: string;
  try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return error("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return error("unavailable", 503);
  let access;
  try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); } catch { return error("unavailable", 503); }
  if (access.kind === "unauthenticated") return error("unauthenticated", 401);
  if (access.kind === "unauthorized") return error("membership_denied", 403);
  if (access.kind !== "authenticated") return error("unavailable", 503);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}
function isResponse(value: Response | Authorized): value is Response { return value instanceof Response; }
async function selectedJob(context: Context): Promise<string | null> { try { const value = (await context.params).jobId; return typeof value === "string" && UUID.test(value) ? value : null; } catch { return null; } }

export function createCatalogMigrationHttpHandlers(dependencies: Dependencies) {
  if (!dependencies || typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function") throw new Error("catalog_migration_http_invalid");
  const ingest = dependencies.ingestMedia ?? ingestMigrationMediaItem;
  return Object.freeze({
    async begin(request: Request) {
      const authorized = await authorize(dependencies, request, "POST", BASE); if (isResponse(authorized)) return authorized;
      const operationId = operation(request); const parsed = exact(await body(request), ["sourceDigest", "totalProducts", "totalMedia", "categories", "brands"]);
      if (!operationId || !parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.brands)) return error("invalid_input", 400);
      try { return json(await authorized.runtime.migration.begin({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, sourceDigest: parsed.sourceDigest as string, totalProducts: parsed.totalProducts as number, totalMedia: parsed.totalMedia as number, categories: parsed.categories as never, brands: parsed.brands as never })); }
      catch (caught) { return repositoryError(caught); }
    },
    async status(request: Request, context: Context) {
      const jobId = await selectedJob(context); if (!jobId) return error("invalid_input", 400);
      const authorized = await authorize(dependencies, request, "GET", `${BASE}/${jobId}`); if (isResponse(authorized)) return authorized;
      try { return json(await authorized.runtime.migration.get({ tenantContext: authorized.tenantContext, now: authorized.now, jobId })); }
      catch (caught) { return repositoryError(caught); }
    },
    async batch(request: Request, context: Context) {
      const jobId = await selectedJob(context); if (!jobId) return error("invalid_input", 400);
      const authorized = await authorize(dependencies, request, "POST", `${BASE}/${jobId}/batch`); if (isResponse(authorized)) return authorized;
      const operationId = operation(request); const parsed = exact(await body(request), ["sourceDigest", "products"]);
      if (!operationId || !parsed || !Array.isArray(parsed.products) || parsed.products.length < 1 || parsed.products.length > 25) return error("invalid_input", 400);
      try { return json(await authorized.runtime.migration.importBatch({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, jobId, sourceDigest: parsed.sourceDigest as string, products: parsed.products as never })); }
      catch (caught) { return repositoryError(caught); }
    },
    async media(request: Request, context: Context) {
      const jobId = await selectedJob(context); if (!jobId) return error("invalid_input", 400);
      const authorized = await authorize(dependencies, request, "POST", `${BASE}/${jobId}/media`); if (isResponse(authorized)) return authorized;
      const operationId = operation(request); const parsed = exact(await body(request), ["sourceProductId", "ordinal", "sourceUrl", "altText"]);
      if (!operationId || !parsed || typeof parsed.sourceProductId !== "string" || !SOURCE_ID.test(parsed.sourceProductId)
        || !Number.isSafeInteger(parsed.ordinal) || (parsed.ordinal as number) < 0 || (parsed.ordinal as number) > 15
        || typeof parsed.sourceUrl !== "string" || parsed.sourceUrl.length < 1 || parsed.sourceUrl.length > 2048
        || typeof parsed.altText !== "string" || parsed.altText !== parsed.altText.trim() || parsed.altText.length > 500 || CONTROL.test(parsed.altText)) return error("invalid_input", 400);
      try { return json(await ingest({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, jobId, sourceProductId: parsed.sourceProductId, ordinal: parsed.ordinal as number, sourceUrl: parsed.sourceUrl, altText: parsed.altText }, { migration: authorized.runtime.migration, upload: authorized.runtime.upload })); }
      catch { return error("unavailable", 503); }
    },
  });
}
