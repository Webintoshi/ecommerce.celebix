import "server-only";
import { createHash } from "node:crypto";
import { STOREFRONT_ASSET_KINDS, type StorefrontAssetKind } from "@celebix/saas-contracts";
import { storefrontAssetFingerprint, StorefrontAssetRepositoryError } from "@celebix/saas-data";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import { validateProductImage } from "../server-media/image-validation.ts";
import type { ServerStorefrontAssetRuntime } from "../server-storefront-assets/runtime.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PATH = "/api/storefront-assets";
const MAX_REQUEST_BYTES = 5_300_000;
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerStorefrontAssetRuntime | null>; now(): Date; requestId(): string; assetId(): string }>;
type Authorized = Readonly<{ runtime: ServerStorefrontAssetRuntime; tenantContext: Extract<ServerPanelAccessResult, { kind: "authenticated" }>["tenantContext"]; now: Date }>;

function response(code: string, status: number, body: Record<string, unknown> = {}) { return Response.json({ code, ...body }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function privateHeaders(request: Request) { for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-celebix") || ["x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-r2-object-key"].includes(name)) return true; return false; }
function operationId(request: Request): string | null { const value = request.headers.get("idempotency-key"); return value && UUID.test(value) && value === value.trim() && !value.includes(",") ? value : null; }
function repositoryFailure(error: unknown) { if (!(error instanceof StorefrontAssetRepositoryError)) return response("unavailable", 503); const status = { invalid_input: 400, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403, asset_not_found: 404, asset_limit_reached: 409, version_conflict: 409, operation_mismatch: 409, operation_not_found: 404, commit_unknown: 503, unavailable: 503 }[error.code]; return response(error.code === "commit_unknown" ? "unavailable" : error.code, status); }
function isResponse(value: unknown): value is Response { return value instanceof Response; }
function safeKind(value: unknown): StorefrontAssetKind | null { return typeof value === "string" && STOREFRONT_ASSET_KINDS.includes(value as StorefrontAssetKind) ? value as StorefrontAssetKind : null; }
function validText(value: unknown, maximum: number): value is string { return typeof value === "string" && value === value.trim() && value.length <= maximum && !CONTROL.test(value); }

async function authorize(dependencies: Dependencies, request: Request, method: "GET" | "POST" | "DELETE"): Promise<Response | Authorized> {
  let runtime: ServerStorefrontAssetRuntime | null; try { runtime = await dependencies.resolveRuntime(); } catch { return response("unavailable", 503); } if (!runtime) return response("unavailable", 503);
  if (request.method !== method) return response("method_not_allowed", 405);
  if (method !== "GET" && request.headers.get("origin") !== runtime.access.panelOrigin) return response("origin_denied", 403);
  let url: URL; try { url = new URL(request.url); } catch { return response("invalid_input", 400); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== PATH || url.search || url.hash || privateHeaders(request)) return response("invalid_input", 400);
  const cookie = readPersistentPanelSessionCookie(request); if (cookie.kind !== "present") return response("unauthenticated", 401);
  let now: Date, requestId: string; try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return response("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return response("unavailable", 503);
  let access: ServerPanelAccessResult; try { access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now) }); } catch { return response("unavailable", 503); }
  if (access.kind === "unauthenticated") return response("unauthenticated", 401); if (access.kind === "unauthorized") return response("membership_denied", 403); if (access.kind !== "authenticated") return response("unavailable", 503);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding")) return null;
  const rawLength = request.headers.get("content-length"); if (rawLength !== null && (!/^\d+$/.test(rawLength) || Number(rawLength) > 16_384)) return null;
  try { const value = await request.json(); return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value as Record<string, unknown> : null; } catch { return null; }
}

export function createStorefrontAssetHttpHandlers(dependencies: Dependencies) {
  return Object.freeze({
    async list(request: Request) {
      const authorized = await authorize(dependencies, request, "GET"); if (isResponse(authorized)) return authorized;
      try { return response("ok", 200, { assets: await authorized.runtime.assets.listAssets({ tenantContext: authorized.tenantContext, now: authorized.now }) }); } catch (error) { return repositoryFailure(error); }
    },
    async upload(request: Request) {
      const authorized = await authorize(dependencies, request, "POST"); if (isResponse(authorized)) return authorized;
      const operation = operationId(request), contentType = request.headers.get("content-type") ?? "", rawLength = request.headers.get("content-length");
      if (!operation || !contentType.startsWith("multipart/form-data; boundary=") || request.headers.has("transfer-encoding") || (rawLength !== null && (!/^\d+$/.test(rawLength) || Number(rawLength) > MAX_REQUEST_BYTES))) return response("invalid_input", 400);
      let form: FormData; try { form = await request.formData(); } catch { return response("invalid_input", 400); }
      const keys = [...form.keys()]; if (keys.length !== 3 || ["file", "kind", "altText"].some((required) => keys.filter((key) => key === required).length !== 1) || keys.some((key) => !["file", "kind", "altText"].includes(key))) return response("invalid_input", 400);
      const file = form.get("file"), kind = safeKind(form.get("kind")), altText = form.get("altText");
      if (!(file instanceof File) || file.size > MAX_REQUEST_BYTES || !kind || !validText(altText, 500)) return response("invalid_input", 400);
      let bytes: Uint8Array, image; try { bytes = new Uint8Array(await file.arrayBuffer()); image = validateProductImage({ bytes, mediaType: file.type, fileName: file.name }); } catch { return response("invalid_input", 400); }
      const contentDigest = createHash("sha256").update(bytes).digest("hex");
      const fingerprint = storefrontAssetFingerprint("create_asset", { kind, mediaType: image.mediaType, altText, width: image.width, height: image.height, byteSize: image.byteSize, contentDigest });
      try {
        const recovered = await authorized.runtime.assets.recoverOperation({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, operationKind: "create_asset", fingerprint });
        if (recovered.kind === "found") return response("created", 201, recovered.result);
      } catch (error) { return repositoryFailure(error); }
      let assetId: string; try { assetId = dependencies.assetId(); } catch { return response("unavailable", 503); } if (!UUID.test(assetId)) return response("unavailable", 503);
      const storeId = authorized.tenantContext.store.id, objectKey = `stores/${storeId}/storefront/${kind}/${assetId}.${image.extension}`, publicUrl = authorized.runtime.storage.publicUrl(objectKey);
      const createInput = { tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, assetId, kind, objectKey, publicUrl, mediaType: image.mediaType, altText, width: image.width, height: image.height, byteSize: image.byteSize, contentDigest } as const;
      try { await authorized.runtime.storage.put({ objectKey, mediaType: image.mediaType, bytes }); } catch { return response("unavailable", 503); }
      try {
        const result = await authorized.runtime.assets.createAsset(createInput);
        if (result.replayed && result.asset.objectKey !== objectKey) {
          try { await authorized.runtime.storage.delete(objectKey); } catch { return response("unavailable", 503); }
        }
        return response("created", 201, result);
      }
      catch (error) {
        if (error instanceof StorefrontAssetRepositoryError && error.code === "commit_unknown") {
          try { const recovered = await authorized.runtime.assets.recoverOperation({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, operationKind: "create_asset", fingerprint }); if (recovered.kind === "found") return response("created", 201, recovered.result); } catch { /* fail closed */ }
          return response("unavailable", 503);
        }
        await authorized.runtime.storage.delete(objectKey).catch(() => undefined);
        return repositoryFailure(error);
      }
    },
    async archive(request: Request) {
      const authorized = await authorize(dependencies, request, "DELETE"); if (isResponse(authorized)) return authorized;
      const operation = operationId(request), body = await jsonBody(request);
      if (!operation || !body || Object.keys(body).sort().join(",") !== "assetId,expectedVersion" || typeof body.assetId !== "string" || !UUID.test(body.assetId) || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) return response("invalid_input", 400);
      try { return response("archived", 200, await authorized.runtime.assets.archiveAsset({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, assetId: body.assetId, expectedVersion: body.expectedVersion as number })); } catch (error) { return repositoryFailure(error); }
    },
  });
}
