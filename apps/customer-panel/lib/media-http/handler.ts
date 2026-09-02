import "server-only";
import { isCatalogProductOperationAllowed, type CatalogProductOperation } from "@celebix/saas-contracts";
import type { ProductMedia, ProductMediaLifecycle } from "../../../../packages/saas-contracts/src/media/index.ts";
import { ProductMediaRepositoryError } from "@celebix/saas-data";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerMediaRuntime } from "../server-media/runtime.ts";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import { validateProductImage } from "../server-media/image-validation.ts";
import { createProductMediaUploadService } from "../server-media/upload-service.ts";
import { createArchivedProductMediaCleanupService } from "../server-media/cleanup-service.ts";
import { createProductMediaRequestAuthorityValidator } from "./request-authority.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_REQUEST_BYTES = 5_300_000;
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerMediaRuntime | null>; now(): Date; requestId(): string }>;
type Authorized = Readonly<{ runtime: ServerMediaRuntime; tenantContext: Extract<ServerPanelAccessResult, { kind: "authenticated" }>["tenantContext"]; now: Date }>;

function response(code: string, status: number, body: Record<string, unknown> = {}) { return Response.json({ code, ...body }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function privateHeaders(request: Request) { return ["authorization","x-celebix-session","x-panel-session-credential","x-store-id","x-tenant-id","x-principal-id","x-membership-id","x-plan-id","x-database-role"].some((name) => request.headers.has(name)); }
function repositoryFailure(error: unknown) { if (!(error instanceof ProductMediaRepositoryError)) return response("unavailable", 503); const status = { invalid_input: 400, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403, product_not_found: 404, variant_not_found: 404, media_not_found: 404, media_limit_reached: 409, retention_active: 409, version_conflict: 409, operation_mismatch: 409, unavailable: 503 }[error.code]; return response(error.code, status); }
function id(value: unknown): string | null { return typeof value === "string" && UUID.test(value) ? value : null; }
function operationId(request: Request): string | null { const values = request.headers.get("idempotency-key"); return values && UUID.test(values) && values === values.trim() && !values.includes(",") ? values : null; }
async function authorize(dependencies: Dependencies, request: Request, method: "GET" | "POST" | "PATCH", pathname: string, operation: CatalogProductOperation): Promise<Response | Authorized> {
  let runtime: ServerMediaRuntime | null; try { runtime = await dependencies.resolveRuntime(); } catch { return response("unavailable", 503); } if (!runtime) return response("unavailable", 503);
  const decision = createProductMediaRequestAuthorityValidator(runtime.access.panelOrigin).validate(request, { method, pathname });
  if (decision === "method_not_allowed") return response("method_not_allowed", 405); if (decision === "origin_denied") return response("origin_denied", 403); if (decision !== "approved" || privateHeaders(request)) return response("invalid_input", 400);
  const cookie = readPersistentPanelSessionCookie(request); if (cookie.kind !== "present") return response("unauthenticated", 401);
  let now: Date, requestId: string; try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return response("unavailable", 503); } if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return response("unavailable", 503);
  let access: ServerPanelAccessResult; try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); } catch { return response("unavailable", 503); }
  if (access.kind === "unauthenticated") return response("unauthenticated", 401); if (access.kind === "unauthorized") return response("membership_denied", 403); if (access.kind !== "authenticated") return response("unavailable", 503);
  if (method !== "GET" && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)) return response("origin_denied", 403);
  if (!isCatalogProductOperationAllowed(access.tenantContext.membership.role, operation)) return response("membership_denied", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}
function isResponse(value: unknown): value is Response { return value instanceof Response; }
async function jsonBody(request: Request): Promise<Record<string, unknown> | null> { const contentType = request.headers.get("content-type"); const length = Number(request.headers.get("content-length")); if (contentType !== "application/json" || !Number.isSafeInteger(length) || length < 2 || length > 16_384 || request.headers.has("transfer-encoding")) return null; try { const value = await request.json(); return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; } catch { return null; } }
function publicMedia(media: ProductMedia): ProductMediaLifecycle {
  return Object.freeze({
    id: media.id, productId: media.productId, ...(media.variantId ? { variantId: media.variantId } : {}),
    publicUrl: media.publicUrl, mediaType: media.mediaType, altText: media.altText,
    ...(media.width === undefined ? {} : { width: media.width }), ...(media.height === undefined ? {} : { height: media.height }),
    byteSize: media.byteSize, sortOrder: media.sortOrder, status: media.status === "archived" ? "archived" : "active",
    cleanupState: media.status === "archived" ? "retained" : "active", createdAt: media.createdAt, updatedAt: media.updatedAt,
    ...(media.archivedAt ? { archivedAt: media.archivedAt } : {}), version: media.version,
  });
}
async function lifecycle(runtime: ServerMediaRuntime, tenantContext: Authorized["tenantContext"], now: Date, productId: string) {
  const includeArchived = ["store_owner", "admin"].includes(tenantContext.membership.role);
  if (typeof runtime.media.listProductMediaLifecycle === "function") return runtime.media.listProductMediaLifecycle({ tenantContext, now, productId, includeArchived });
  return Object.freeze((await runtime.media.listProductMedia({ tenantContext, now, productId, includeArchived })).map(publicMedia));
}

export function createProductMediaHttpHandlers(dependencies: Dependencies) {
  return Object.freeze({
    async list(request: Request, productId: unknown) { const selectedProduct = id(productId); if (!selectedProduct) return response("invalid_input", 400); const pathname = `/api/catalog/products/${selectedProduct}/media`; const authorized = await authorize(dependencies, request, "GET", pathname, "read"); if (isResponse(authorized)) return authorized; try { const media = await lifecycle(authorized.runtime, authorized.tenantContext, authorized.now, selectedProduct); return response("ok", 200, { media }); } catch (error) { return repositoryFailure(error); } },
    async upload(request: Request, productId: unknown) {
      const selectedProduct = id(productId); if (!selectedProduct) return response("invalid_input", 400); const pathname = `/api/catalog/products/${selectedProduct}/media`; const authorized = await authorize(dependencies, request, "POST", pathname, "manage_media"); if (isResponse(authorized)) return authorized;
      const operation = operationId(request), contentType = request.headers.get("content-type") ?? "", length = Number(request.headers.get("content-length")); if (!operation || !contentType.startsWith("multipart/form-data; boundary=") || !Number.isSafeInteger(length) || length < 1 || length > MAX_REQUEST_BYTES || request.headers.has("transfer-encoding")) return response("invalid_input", 400);
      let form: FormData; try { form = await request.formData(); } catch { return response("invalid_input", 400); } const keys = [...form.keys()]; if (keys.some((key) => !["file","altText","variantId"].includes(key)) || keys.filter((key) => key === "file").length !== 1) return response("invalid_input", 400);
      const file = form.get("file"), alt = form.get("altText"), rawVariant = form.get("variantId"); if (!(file instanceof File) || typeof alt !== "string" || alt !== alt.trim() || alt.length > 500 || /[\u0000-\u001f\u007f]/.test(alt) || (rawVariant !== null && (typeof rawVariant !== "string" || !id(rawVariant)))) return response("invalid_input", 400);
      let bytes: Uint8Array, validated; try { bytes = new Uint8Array(await file.arrayBuffer()); validated = validateProductImage({ bytes, mediaType: file.type, fileName: file.name }); } catch { return response("invalid_input", 400); }
      const uploadService = createProductMediaUploadService({ repository: authorized.runtime.media, storage: authorized.runtime.storage, now: dependencies.now });
      try {
        const result = await uploadService.upload({ tenantContext: authorized.tenantContext, operationId: operation, productId: selectedProduct, ...(typeof rawVariant === "string" ? { variantId: rawVariant } : {}), mediaType: validated.mediaType, altText: alt, width: validated.width, height: validated.height, bytes });
        return response("created", 201, { ...result, media: publicMedia(result.media) });
      } catch (error) { return repositoryFailure(error); }
    },
    async updateAlt(request: Request, productId: unknown, mediaId: unknown) { const product = id(productId), media = id(mediaId); if (!product || !media) return response("invalid_input", 400); const pathname = `/api/catalog/products/${product}/media/${media}`; const authorized = await authorize(dependencies, request, "PATCH", pathname, "manage_media"); if (isResponse(authorized)) return authorized; const operation = operationId(request), body = await jsonBody(request); if (!operation || !body || Object.keys(body).sort().join(",") !== "altText,expectedVersion" || typeof body.altText !== "string" || body.altText !== body.altText.trim() || body.altText.length > 500 || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) return response("invalid_input", 400); try { const result = await authorized.runtime.media.updateAltText({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, productId: product, mediaId: media, expectedVersion: body.expectedVersion as number, altText: body.altText }); return response("updated", 200, { ...result, media: publicMedia(result.media) }); } catch (error) { return repositoryFailure(error); } },
    async reorder(request: Request, productId: unknown) { const product = id(productId); if (!product) return response("invalid_input", 400); const pathname = `/api/catalog/products/${product}/media/reorder`; const authorized = await authorize(dependencies, request, "POST", pathname, "manage_media"); if (isResponse(authorized)) return authorized; const operation = operationId(request), body = await jsonBody(request); if (!operation || !body || Object.keys(body).join(",") !== "orderedMediaIds" || !Array.isArray(body.orderedMediaIds)) return response("invalid_input", 400); try { const media = await authorized.runtime.media.reorderMedia({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, productId: product, orderedMediaIds: body.orderedMediaIds as string[] }); return response("updated", 200, { media: media.map(publicMedia) }); } catch (error) { return repositoryFailure(error); } },
    async archive(request: Request, productId: unknown, mediaId: unknown) {
      const product = id(productId), media = id(mediaId); if (!product || !media) return response("invalid_input", 400);
      const pathname = `/api/catalog/products/${product}/media/${media}/archive`;
      const authorized = await authorize(dependencies, request, "POST", pathname, "archive_media"); if (isResponse(authorized)) return authorized;
      const operation = operationId(request), body = await jsonBody(request);
      if (!operation || !body || Object.keys(body).join(",") !== "expectedVersion" || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) return response("invalid_input", 400);
      try {
        const archiveInput = { tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, productId: product, mediaId: media, expectedVersion: body.expectedVersion as number };
        let reserved;
        try {
          reserved = await authorized.runtime.media.reserveArchiveMedia(archiveInput);
        } catch (error) {
          if (!(error instanceof ProductMediaRepositoryError) || error.code !== "unavailable") throw error;
          reserved = await authorized.runtime.media.recoverArchiveMedia(archiveInput);
        }
        if (reserved.media.id !== media || reserved.media.productId !== product || reserved.media.storeId !== authorized.tenantContext.store.id || !["pending", "archived"].includes(reserved.media.status)) return response("unavailable", 503);
        let archived = reserved;
        if (reserved.media.status === "pending") {
          await authorized.runtime.storage.unpublish(reserved.media.objectKey);
          try {
            archived = await authorized.runtime.media.finalizeArchiveMedia(archiveInput);
          } catch (error) {
            if (!(error instanceof ProductMediaRepositoryError) || error.code !== "unavailable") throw error;
            archived = await authorized.runtime.media.recoverArchiveMedia(archiveInput);
          }
        } else {
          await authorized.runtime.storage.unpublish(reserved.media.objectKey);
        }
        if (archived.media.id !== media || archived.media.productId !== product || archived.media.storeId !== authorized.tenantContext.store.id || archived.media.status !== "archived") return response("unavailable", 503);
        const mediaList = await lifecycle(authorized.runtime, authorized.tenantContext, authorized.now, product);
        const projection = mediaList.find((item) => item.id === media);
        return projection ? response("archived", 200, { media: projection, replayed: archived.replayed }) : response("unavailable", 503);
      } catch (error) { return repositoryFailure(error); }
    },
    async restore(request: Request, productId: unknown, mediaId: unknown) {
      const product = id(productId), media = id(mediaId); if (!product || !media) return response("invalid_input", 400);
      const authorized = await authorize(dependencies, request, "POST", `/api/catalog/products/${product}/media/${media}/restore`, "restore_media"); if (isResponse(authorized)) return authorized;
      const operation = operationId(request), body = await jsonBody(request); if (!operation || !body || Object.keys(body).join(",") !== "expectedVersion" || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) return response("invalid_input", 400);
      try {
        const candidate = await authorized.runtime.media.getProductMediaRestoreCandidate({ tenantContext: authorized.tenantContext, now: authorized.now, productId: product, mediaId: media, expectedVersion: body.expectedVersion as number });
        const stored = await authorized.runtime.storage.head(candidate.objectKey);
        if (stored.kind !== "found" || stored.byteSize !== candidate.byteSize || stored.mediaType !== candidate.mediaType) return response("media_not_found", 404);
        await authorized.runtime.storage.publish({ objectKey: candidate.objectKey, mediaType: candidate.mediaType, byteSize: candidate.byteSize, payloadSha256: stored.payloadSha256 });
        return response("restored", 200, await authorized.runtime.media.restoreProductMedia({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, productId: product, mediaId: media, expectedVersion: body.expectedVersion as number }));
      } catch (error) { return repositoryFailure(error); }
    },
    async cleanup(request: Request, productId: unknown, mediaId: unknown) {
      const product = id(productId), media = id(mediaId); if (!product || !media) return response("invalid_input", 400);
      const authorized = await authorize(dependencies, request, "POST", `/api/catalog/products/${product}/media/${media}/cleanup`, "cleanup_media"); if (isResponse(authorized)) return authorized;
      const operation = operationId(request), body = await jsonBody(request); if (!operation || !body || Object.keys(body).join(",") !== "expectedVersion" || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) return response("invalid_input", 400);
      try {
        const service = createArchivedProductMediaCleanupService({ repository: authorized.runtime.media, storage: authorized.runtime.storage });
        return response("deleted", 200, await service.cleanup({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, productId: product, mediaId: media, expectedVersion: body.expectedVersion as number }));
      } catch (error) { return repositoryFailure(error); }
    },
  });
}
