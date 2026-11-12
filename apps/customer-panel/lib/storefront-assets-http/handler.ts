import "server-only";
import { createHash } from "node:crypto";
import { isMerchantActionAllowed, STOREFRONT_ASSET_KINDS, type StorefrontAssetKind } from "@celebix/saas-contracts";
import { storefrontAssetFingerprint, StorefrontAssetRepositoryError, type StorefrontAssetMutationResult } from "@celebix/saas-data";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import { validateProductImage } from "../server-media/image-validation.ts";
import { ProductMediaStorageError } from "../server-media/r2-storage.ts";
import type { ServerStorefrontAssetRuntime } from "../server-storefront-assets/runtime.ts";
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PATH = "/api/storefront-assets";
const MAX_REQUEST_BYTES = 5_300_000;
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerStorefrontAssetRuntime | null>; now(): Date; requestId(): string }>;
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
  if (method !== "GET" && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin)) return response("origin_denied", 403);
  let url: URL; try { url = new URL(request.url); } catch { return response("invalid_input", 400); }
  const query=[...url.searchParams.entries()];
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== PATH || (method!=="GET"&&url.search) || (method==="GET"&&query.length>0&&(query.length!==1||query[0]![0]!=="kind"||!safeKind(query[0]![1]))) || url.hash || privateHeaders(request)) return response("invalid_input", 400);
  const cookie = readPersistentPanelSessionCookie(request); if (cookie.kind !== "present") return response("unauthenticated", 401);
  let now: Date, requestId: string; try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return response("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return response("unavailable", 503);
  let access: ServerPanelAccessResult; try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); } catch { return response("unavailable", 503); }
  if (access.kind === "unauthenticated") return response("unauthenticated", 401); if (access.kind === "unauthorized") return response("membership_denied", 403); if (access.kind !== "authenticated") return response("unavailable", 503);
  if(method!=="GET"&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return response("origin_denied",403);
  if (method !== "GET") {
    const { membership, entitlements } = access.tenantContext;
    if (membership.status !== "active" || !isMerchantActionAllowed(membership.role, "catalog_admin.manage")) return response("membership_denied", 403);
    if (!entitlements.features.includes("media")) return response("feature_not_enabled", 403);
  }
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function boundedBody(request: Request, contentType: string, maxBytes: number): Response | null {
  const length = request.headers.get("content-length");
  if (!request.body || request.headers.has("transfer-encoding") || (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))) return null;
  let size = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new RangeError("storefront_asset_body_limit");
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, { headers: { "content-type": contentType } });
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type") !== "application/json") return null;
  try { const value = await boundedBody(request, "application/json", 16_384)?.json(); return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value as Record<string, unknown> : null; } catch { return null; }
}

async function publishAsset(
  { runtime, tenantContext, now }: Authorized,
  result: StorefrontAssetMutationResult,
  contentDigest: string,
) {
  const { asset, replayed } = result;
  if (replayed) {
    const current = await runtime.assets.listAssets({ tenantContext, now, kind: asset.kind });
    if (!current.some((candidate) => candidate.status === "active" && candidate.id === asset.id && candidate.version === asset.version && candidate.objectKey === asset.objectKey)) {
      return response("operation_mismatch", 409);
    }
  }
  await runtime.storage.publish({ objectKey: asset.objectKey, mediaType: asset.mediaType, byteSize: asset.byteSize, payloadSha256: contentDigest });
  return response("created", 201, result);
}

export function createStorefrontAssetHttpHandlers(dependencies: Dependencies) {
  return Object.freeze({
    async list(request: Request) {
      const authorized = await authorize(dependencies, request, "GET"); if (isResponse(authorized)) return authorized;
      const kind=safeKind(new URL(request.url).searchParams.get("kind"));
      try { return response("ok", 200, { assets: await authorized.runtime.assets.listAssets({ tenantContext: authorized.tenantContext, now: authorized.now,...(kind?{kind}:{}) }) }); } catch (error) { return repositoryFailure(error); }
    },
    async upload(request: Request) {
      const authorized = await authorize(dependencies, request, "POST"); if (isResponse(authorized)) return authorized;
      const operation = operationId(request), contentType = request.headers.get("content-type") ?? "";
      if (!operation || !contentType.startsWith("multipart/form-data; boundary=")) return response("invalid_input", 400);
      let form: FormData; try {
        const body = boundedBody(request, contentType, MAX_REQUEST_BYTES);
        if (!body) return response("invalid_input", 400);
        form = await body.formData();
      } catch { return response("invalid_input", 400); }
      const keys = [...form.keys()]; if (keys.length !== 3 || ["file", "kind", "altText"].some((required) => keys.filter((key) => key === required).length !== 1) || keys.some((key) => !["file", "kind", "altText"].includes(key))) return response("invalid_input", 400);
      const file = form.get("file"), kind = safeKind(form.get("kind")), altText = form.get("altText");
      if (!(file instanceof File) || file.size > MAX_REQUEST_BYTES || !kind || !validText(altText, 500)) return response("invalid_input", 400);
      let bytes: Uint8Array, image; try { bytes = new Uint8Array(await file.arrayBuffer()); image = validateProductImage({ bytes, mediaType: file.type, fileName: file.name }); } catch { return response("invalid_input", 400); }
      const contentDigest = createHash("sha256").update(bytes).digest("hex");
      const fingerprint = storefrontAssetFingerprint("create_asset", { kind, mediaType: image.mediaType, altText, width: image.width, height: image.height, byteSize: image.byteSize, contentDigest });
      const { runtime, tenantContext, now } = authorized;
      const storeId = tenantContext.store.id, assetId = operation;
      const recoveryInput = { tenantContext, now, operationId: operation, operationKind: "create_asset", fingerprint } as const;
      try {
        return await runtime.withAssetLock(storeId, assetId, async () => {
          const recovered = await runtime.assets.recoverOperation(recoveryInput);
          if (recovered.kind === "found") return publishAsset(authorized, recovered.result, contentDigest);

          const objectKey = `stores/${storeId}/storefront/${kind}/${assetId}.${image.extension}`;
          const publicUrl = runtime.storage.publicUrl(objectKey);
          const written = await runtime.storage.putIfAbsent({ objectKey, mediaType: image.mediaType, bytes, payloadSha256: contentDigest });
          let result: StorefrontAssetMutationResult;
          try {
            result = await runtime.assets.createAsset({ tenantContext, now, operationId: operation, assetId, kind, objectKey, publicUrl, mediaType: image.mediaType, altText, width: image.width, height: image.height, byteSize: image.byteSize, contentDigest });
          } catch (error) {
            if (error instanceof StorefrontAssetRepositoryError && error.code === "commit_unknown") {
              const recovery = await runtime.assets.recoverOperation(recoveryInput);
              if (recovery.kind === "found") return publishAsset(authorized, recovery.result, contentDigest);
            } else if (written && error instanceof StorefrontAssetRepositoryError && error.code !== "unavailable") {
              await runtime.storage.delete(objectKey).catch(() => undefined);
            }
            throw error;
          }
          if (written && result.replayed && result.asset.objectKey !== objectKey) await runtime.storage.delete(objectKey);
          return publishAsset(authorized, result, contentDigest);
        });
      } catch (error) {
        if (error instanceof ProductMediaStorageError && error.code === "object_mismatch") return response("operation_mismatch", 409);
        return repositoryFailure(error);
      }
    },
    async archive(request: Request) {
      const authorized = await authorize(dependencies, request, "DELETE"); if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      if (!operation) return response("invalid_input", 400);
      const body = await jsonBody(request);
      if (!body || Object.keys(body).sort().join(",") !== "assetId,expectedVersion" || typeof body.assetId !== "string" || !UUID.test(body.assetId) || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) return response("invalid_input", 400);
      const { runtime, tenantContext, now } = authorized;
      const assetId = body.assetId, expectedVersion = body.expectedVersion as number;
      try {
        return await runtime.withAssetLock(tenantContext.store.id, assetId, async () => {
          const result = await runtime.assets.archiveAsset({ tenantContext, now, operationId: operation, assetId, expectedVersion });
          await runtime.storage.unpublish(result.asset.objectKey);
          return response("archived", 200, result);
        });
      } catch (error) { return repositoryFailure(error); }
    },
  });
}
