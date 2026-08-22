import "server-only";

import { createHash } from "node:crypto";

import {
  isMerchantActionAllowed,
  parseStorefrontDesignDocument,
  parseStorefrontDesignWorkspace,
  type StorefrontDesignDocument,
  type StorefrontDesignWorkspace,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  STOREFRONT_DESIGN_REPOSITORY_ERROR_CODES,
  StorefrontDesignRepositoryError,
  type StorefrontDesignRepositoryErrorCode,
} from "@celebix/saas-data";

import { validateProductImage } from "../server-media/image-validation.ts";
import type { ProductMediaStorageObject } from "../server-media/r2-storage.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import type { ServerStorefrontDesignRuntime } from "../server-storefront-design/runtime.ts";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import { validateStorefrontDesignRequest } from "./request-authority.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_JSON_BYTES = 32_768;
const MAX_MEDIA_REQUEST_BYTES = 5_300_000;
const SYSTEM_DESTINATIONS = new Set([
  "/",
  "/products",
  "/favorites",
  "/account",
  "/pages/odeme-teslimat",
  "/policies/privacy-security",
  "/policies/distance-sales",
  "/policies/kvkk",
  "/policies/payment-delivery",
  "/policies/cookies",
  "/policies/returns-exchanges",
  "/policies/membership",
]);

const REPOSITORY_STATUS: Readonly<Record<StorefrontDesignRepositoryErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  store_inactive: 403,
  feature_not_enabled: 403,
  durable_authority_invalid: 409,
  version_conflict: 409,
  operation_mismatch: 409,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
});

type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerStorefrontDesignRuntime | null>;
  now(): Date;
  requestId(): string;
  uuid(): string;
}>;

type Authorized = Readonly<{
  runtime: ServerStorefrontDesignRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;

function response(code: string, status: number, body: Record<string, unknown> = {}, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json({ code, ...body }, { status, headers });
}

function privateHeaders(request: Request): boolean {
  try {
    for (const [name] of request.headers) {
      if (name === "authorization" || name.startsWith("x-celebix") || [
        "x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id",
        "x-membership-id", "x-plan-id", "x-database-role", "x-database-url",
      ].includes(name)) return true;
    }
    return false;
  } catch { return true; }
}

function isResponse(value: unknown): value is Response { return value instanceof Response; }

function operationId(request: Request): string | null {
  const value = request.headers.get("idempotency-key");
  return value !== null && UUID.test(value) && !value.includes(",") ? value : null;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const actual = Reflect.ownKeys(descriptors);
    if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(descriptors, key))) return null;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of actual) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}

async function jsonBody(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared === null || !/^[1-9]\d*$/.test(declared) || Number(declared) > MAX_JSON_BYTES) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_JSON_BYTES) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
    if (total < 2) return null;
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)) as unknown; }
    finally { joined.fill(0); }
  } catch { return null; }
  finally { for (const chunk of chunks) chunk.fill(0); }
}

async function authorize(deps: Dependencies, request: Request, method: "GET" | "PATCH" | "POST", pathname: string): Promise<Authorized | Response> {
  let runtime: ServerStorefrontDesignRuntime | null;
  try { runtime = await deps.resolveRuntime(); } catch { return response("unavailable", 503); }
  if (runtime === null) return response("unavailable", 503);
  const decision = validateStorefrontDesignRequest(request, { method, pathname, panelOrigin: runtime.access.panelOrigin });
  if (decision === "method_not_allowed") return response(decision, 405, {}, { allow: method });
  if (decision === "origin_denied") return response(decision, 403);
  if (decision !== "approved" || privateHeaders(request)) return response("invalid_input", 400);
  const cookie = readPersistentPanelSessionCookie(request);
  if (cookie.kind !== "present") return response("unauthenticated", 401);
  let now: Date;
  let requestId: string;
  try { now = deps.now(); requestId = deps.requestId(); } catch { return response("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf()) || !UUID.test(requestId)) return response("unavailable", 503);
  let access: ServerPanelAccessResult;
  try { access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now) }); }
  catch { return response("unavailable", 503); }
  if (access.kind === "unauthenticated") return response("unauthenticated", 401);
  if (access.kind === "unauthorized") return response("membership_denied", 403);
  if (access.kind !== "authenticated") return response("unavailable", 503);
  if (access.tenantContext.store.status !== "active") return response("store_inactive", 403);
  if (access.tenantContext.membership.status !== "active") return response("membership_denied", 403);
  if (
    method !== "GET"
    && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)
  ) return response("origin_denied", 403);
  const action = method === "GET" ? "configuration.read" : "configuration.manage";
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) return response("membership_denied", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function repositoryFailure(error: unknown): Response {
  if (error instanceof StorefrontDesignRepositoryError && STOREFRONT_DESIGN_REPOSITORY_ERROR_CODES.includes(error.code)) return response(error.code, REPOSITORY_STATUS[error.code]);
  return response("unavailable", 503);
}

function version(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 1 ? value as number : null;
}

function exactPendingObject(value: ProductMediaStorageObject, input: Readonly<{ byteSize: number; mediaType: "image/jpeg" | "image/png" | "image/webp"; payloadSha256: string }>): boolean {
  return value.kind === "found" && value.publication === "pending" && value.byteSize === input.byteSize && value.mediaType === input.mediaType && value.payloadSha256 === input.payloadSha256;
}

/**
 * Validates only references projected by the authenticated store workspace.
 * Store identity never enters this boundary from the browser. Asset references
 * owned by the composition tables remain atomically enforced by PostgreSQL.
 */
export function validateStorefrontDesignWorkspaceReferences(
  design: StorefrontDesignDocument,
  workspace: StorefrontDesignWorkspace,
): boolean {
  const mediaIds = new Set(workspace.media.map(({ id }) => id));
  const destinations = new Set(workspace.destinations.map(({ kind, resourceId }) => `${kind}:${resourceId}`));
  const destinationPaths = new Set(workspace.destinations.map(({ path }) => path));
  const media = (reference: StorefrontDesignDocument["brand"]["logo"]): boolean => reference === null || mediaIds.has(reference.mediaId);
  const destination = (reference: StorefrontDesignDocument["hero"]["slides"][number]["destination"]): boolean =>
    reference.kind === "none" || destinations.has(`${reference.kind}:${reference.resourceId}`);
  const path = (value: string | undefined): boolean => value === undefined || SYSTEM_DESTINATIONS.has(value) || destinationPaths.has(value);
  const resource = (kind: "product" | "collection" | "page", id: string | undefined): boolean =>
    id === undefined || destinations.has(`${kind}:${id}`);

  if (!media(design.brand.logo) || !media(design.brand.favicon) || !destination(design.promotion.destination)) return false;
  for (const slide of design.hero.slides) {
    if (!media(slide.desktopImage) || !media(slide.mobileImage) || !destination(slide.destination)) return false;
  }

  const composition = design.composition;
  if (!path(composition.announcement.destination)) return false;
  if (composition.navigation.rootCategoryIds.some((id) => !resource("collection", id))) return false;
  if (!resource("collection", composition.navigation.featuredCategoryId)) return false;
  for (const section of composition.sections) {
    if (section.kind === "hero") {
      if (section.slides.some((slide) => !path(slide.destination) || !resource("product", slide.productId))) return false;
    } else if (section.kind === "category_grid") {
      if (section.categoryIds.some((id) => !resource("collection", id))) return false;
    } else if (section.kind === "product_row") {
      if (section.source === "category" && !resource("collection", section.categoryId)) return false;
    } else if (section.kind === "split_campaign") {
      if (section.panels.some((panel) => !path(panel.destination))) return false;
    } else if (section.kind === "brand_story" && !path(section.destination)) return false;
  }
  if (composition.schemaVersion >= 2) {
    for (const group of composition.footer.groups) {
      for (const link of group.links) {
        if (link.kind === "category" && !resource("collection", link.categoryId)) return false;
        if (link.kind === "page" && !resource("page", link.pageId)) return false;
      }
    }
  }
  return true;
}

export function createStorefrontDesignHttpHandlers(deps: Dependencies) {
  return Object.freeze({
    async workspace(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "GET", "/api/storefront-design");
      if (isResponse(authorized)) return authorized;
      try {
        const workspace = parseStorefrontDesignWorkspace(await authorized.runtime.repository.getWorkspace({ tenantContext: authorized.tenantContext, now: authorized.now }));
        return response("ok", 200, { workspace });
      } catch (error) { return repositoryFailure(error); }
    },

    async saveDraft(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "PATCH", "/api/storefront-design/draft");
      if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      const parsed = exact(await jsonBody(request), ["expectedDraftVersion", "design"]);
      const expectedDraftVersion = parsed ? version(parsed.expectedDraftVersion) : null;
      if (!parsed || !operation || expectedDraftVersion === null) return response("invalid_input", 400);
      let design;
      try { design = parseStorefrontDesignDocument(parsed.design); } catch { return response("invalid_input", 400); }
      try {
        const workspace = parseStorefrontDesignWorkspace(await authorized.runtime.repository.getWorkspace({ tenantContext: authorized.tenantContext, now: authorized.now }));
        if (!validateStorefrontDesignWorkspaceReferences(design, workspace)) return response("invalid_input", 400);
        const result = await authorized.runtime.repository.saveDraft({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, expectedDraftVersion, design });
        return response("saved", 200, { result });
      } catch (error) { return repositoryFailure(error); }
    },

    async publish(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "POST", "/api/storefront-design/publish");
      if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      const parsed = exact(await jsonBody(request), ["expectedDraftVersion", "expectedPublishedVersion"]);
      const expectedDraftVersion = parsed ? version(parsed.expectedDraftVersion) : null;
      const expectedPublishedVersion = parsed ? version(parsed.expectedPublishedVersion) : null;
      if (!parsed || !operation || expectedDraftVersion === null || expectedPublishedVersion === null) return response("invalid_input", 400);
      try {
        const workspace = parseStorefrontDesignWorkspace(await authorized.runtime.repository.getWorkspace({ tenantContext: authorized.tenantContext, now: authorized.now }));
        if (!validateStorefrontDesignWorkspaceReferences(workspace.draft, workspace)) return response("invalid_input", 400);
        const result = await authorized.runtime.repository.publish({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, expectedDraftVersion, expectedPublishedVersion });
        return response("published", 200, { result });
      } catch (error) { return repositoryFailure(error); }
    },

    async uploadMedia(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "POST", "/api/storefront-design/media");
      if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      const contentType = request.headers.get("content-type") ?? "";
      const declared = request.headers.get("content-length");
      if (!operation || !contentType.startsWith("multipart/form-data; boundary=") || declared === null || !/^[1-9]\d*$/.test(declared) || Number(declared) > MAX_MEDIA_REQUEST_BYTES || request.headers.has("transfer-encoding")) return response("invalid_input", 400);
      let form: FormData;
      try { form = await request.formData(); } catch { return response("invalid_input", 400); }
      const keys = [...form.keys()];
      if (keys.some((key) => !["file", "altText"].includes(key)) || keys.filter((key) => key === "file").length !== 1 || keys.filter((key) => key === "altText").length > 1) return response("invalid_input", 400);
      const file = form.get("file");
      const altText = form.get("altText");
      if (!(file instanceof File) || typeof altText !== "string" || altText !== altText.trim() || altText.length > 500 || /[\u0000-\u001f\u007f]/.test(altText)) return response("invalid_input", 400);
      let bytes: Uint8Array;
      let validated: ReturnType<typeof validateProductImage>;
      let mediaId: string;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
        validated = validateProductImage({ bytes, mediaType: file.type, fileName: file.name });
        mediaId = deps.uuid();
        if (!UUID.test(mediaId)) throw new Error("invalid_uuid");
      } catch { return response("invalid_input", 400); }
      const payloadSha256 = createHash("sha256").update(bytes).digest("hex");
      const objectKey = `stores/${authorized.tenantContext.store.id}/design/${mediaId}.${validated.extension}`;
      const storageInput = { objectKey, mediaType: validated.mediaType, byteSize: validated.byteSize, payloadSha256 } as const;
      try {
        try { await authorized.runtime.storage.put({ objectKey, mediaType: validated.mediaType, bytes, payloadSha256 }); }
        catch (error) {
          if ((error as { code?: unknown })?.code !== "write_unknown" || !exactPendingObject(await authorized.runtime.storage.head(objectKey), storageInput)) throw error;
        }
        if (!exactPendingObject(await authorized.runtime.storage.head(objectKey), storageInput)) throw new Error("storefront_design_media_unavailable");
        await authorized.runtime.storage.publish(storageInput);
        const reserved = await authorized.runtime.repository.reserveMedia({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: operation, mediaId, mediaType: validated.mediaType, altText, width: validated.width, height: validated.height, contentLength: validated.byteSize, contentSha256: payloadSha256 });
        if (reserved.id !== mediaId || reserved.objectKey !== objectKey || reserved.mediaType !== validated.mediaType || reserved.width !== validated.width || reserved.height !== validated.height || reserved.altText !== altText || reserved.url !== authorized.runtime.storage.publicUrl(objectKey)) throw new Error("storefront_design_media_authority_invalid");
        const { objectKey: _privateObjectKey, ...media } = reserved;
        return response("created", 201, { media });
      } catch (error) {
        await authorized.runtime.storage.delete(objectKey).catch(() => undefined);
        return repositoryFailure(error);
      } finally { bytes.fill(0); }
    },
  });
}
