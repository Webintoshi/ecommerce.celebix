import { createHash } from "node:crypto";

import {
  isMerchantActionAllowed,
  parseMerchantPaymentMethod,
  parseQuickOrderLinkDetail,
  parseQuickOrderLinkListItem,
  parseQuickOrderLinkMutationResult,
  type MerchantAction,
  type QuickOrderLinkDetail,
  type QuickOrderLinkMutationResult,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  QUICK_LINK_ERROR_CODES,
  QuickOrderLinkRepositoryError,
  digestCanonicalPaytrConfiguration,
  digestQuickLinkToken,
  generateQuickLinkAuthority,
  openQuickLinkSecret,
  sealQuickLinkSecret,
  serializeCanonicalPaytrConfiguration,
  type ProviderReadiness,
  type QuickOrderLinkErrorCode,
} from "@celebix/saas-data";

import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerQuickLinksRuntime } from "../server-quick-links/runtime.ts";
import {
  createQuickLinkRequestAuthorityValidator,
  type QuickLinkRequestExpectation,
} from "./request-authority.ts";
import {
  readQuickLinkListInput,
  readQuickLinkMutationInput,
  readQuickLinkPanelSessionCookie,
  readQuickLinkPathId,
  type QuickLinkCreateBody,
} from "./request-input.ts";

const BASE_PATH = "/api/orders/quick-links";
const PAYMENT_METHODS_PATH = `${BASE_PATH}/payment-methods`;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = REQUEST_ID;
const DIGEST = /^[a-f0-9]{64}$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const ERROR_CODES = new Set<string>(QUICK_LINK_ERROR_CODES);

type AuthenticatedAccess = Extract<ServerPanelAccessResult, { kind: "authenticated" }>;
type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerQuickLinksRuntime | null>;
  now(): Date;
  requestId(): string;
  generateId(): string;
  generateToken(): string;
}>;
type AuthorizedRequest = Readonly<{
  runtime: ServerQuickLinksRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;

const ERROR_STATUS: Readonly<Record<QuickOrderLinkErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  store_inactive: 403,
  feature_not_enabled: 403,
  action_denied: 403,
  quick_link_not_found: 404,
  provider_not_ready: 409,
  catalog_item_unavailable: 409,
  stock_unavailable: 409,
  invalid_transition: 409,
  version_conflict: 409,
  operation_replayed: 409,
  operation_mismatch: 409,
  durable_authority_invalid: 409,
  unavailable: 503,
  commit_unknown: 503,
});

function json(value: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(headers ?? {}),
    },
  });
}

function error(code: string, status: number, headers?: HeadersInit): Response {
  return json({ code }, status, headers);
}

function repositoryError(value: unknown): Response {
  try {
    if (!(value instanceof QuickOrderLinkRepositoryError)) return error("unavailable", 503);
    const code = value.code;
    if (typeof code !== "string" || !ERROR_CODES.has(code) || !Object.hasOwn(ERROR_STATUS, code)) {
      return error("unavailable", 503);
    }
    return error(code, ERROR_STATUS[code as QuickOrderLinkErrorCode]);
  } catch { return error("unavailable", 503); }
}

function privateAuthorityPresent(request: Request): boolean {
  try {
    for (const [name] of request.headers) {
      if (
        name === "authorization" || name.startsWith("x-celebix") ||
        /(?:store|tenant|principal|membership|plan)(?:-|_)?id/.test(name) ||
        ["x-panel-session-credential", "x-database-role", "x-database-url"].includes(name)
      ) return true;
    }
    return false;
  } catch { return true; }
}

function authorityFailure(
  decision: ReturnType<ReturnType<typeof createQuickLinkRequestAuthorityValidator>["validate"]>,
  method: QuickLinkRequestExpectation["method"],
): Response | null {
  if (decision === "approved") return null;
  if (decision === "method_not_allowed") return error("method_not_allowed", 405, { allow: method });
  if (decision === "origin_denied") return error("origin_denied", 403);
  return error("invalid_input", 400);
}

async function authorize(
  dependencies: Dependencies,
  request: Request,
  expectation: QuickLinkRequestExpectation,
  action: MerchantAction,
): Promise<Response | AuthorizedRequest> {
  let runtime: ServerQuickLinksRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); }
  catch { return error("unavailable", 503); }
  if (runtime === null) return error("unavailable", 503);
  let decision;
  try {
    decision = createQuickLinkRequestAuthorityValidator({ panelOrigin: runtime.access.panelOrigin })
      .validate(request, expectation);
  } catch { return error("unavailable", 503); }
  const denied = authorityFailure(decision, expectation.method);
  if (denied) return denied;
  if (privateAuthorityPresent(request)) return error("invalid_input", 400);
  let cookie;
  try { cookie = readQuickLinkPanelSessionCookie(request); }
  catch { return error("unauthenticated", 401); }
  if (cookie.kind !== "present") return error("unauthenticated", 401);
  let now: Date;
  let requestId: string;
  try { now = dependencies.now(); requestId = dependencies.requestId(); }
  catch { return error("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !REQUEST_ID.test(requestId)) {
    return error("unavailable", 503);
  }
  let access: ServerPanelAccessResult;
  try {
    access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now) });
  } catch { return error("unavailable", 503); }
  try {
    if (access.kind === "unauthenticated") return error("unauthenticated", 401);
    if (access.kind === "unauthorized") return error("membership_denied", 403);
    if (access.kind !== "authenticated") return error("unavailable", 503);
    const tenantContext = (access as AuthenticatedAccess).tenantContext;
    if (!isMerchantActionAllowed(tenantContext.membership.role, action)) return error("action_denied", 403);
    return Object.freeze({ runtime, tenantContext, now: new Date(now) });
  } catch { return error("unavailable", 503); }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function pathId(value: unknown): string | Response {
  return readQuickLinkPathId(value) ?? error("invalid_input", 400);
}

function exactRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...required, ...optional]);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  ) throw new TypeError("invalid");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") throw new TypeError("invalid");
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError("invalid");
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) throw new TypeError("invalid");
  const length = lengthDescriptor.value as number;
  if (length < 0 || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) throw new TypeError("invalid");
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError("invalid");
    result.push(descriptor.value);
  }
  return result;
}

function safeDetail(value: unknown, expectedId?: string): Readonly<QuickOrderLinkDetail> {
  const detail = parseQuickOrderLinkDetail(value);
  if (detail.currency !== "TRY" || (expectedId !== undefined && detail.id !== expectedId)) throw new TypeError("invalid");
  return detail;
}

function safeMutation(value: unknown): Readonly<QuickOrderLinkMutationResult> {
  return parseQuickOrderLinkMutationResult(value);
}

function safeCreatedMutation(value: unknown, generatedId: string): Readonly<QuickOrderLinkMutationResult> {
  const result = safeMutation(value);
  if (
    result.status !== "active" || result.version !== 1 ||
    (!result.replayed && result.id !== generatedId)
  ) throw new TypeError("invalid");
  return result;
}

function safeCancelledMutation(
  value: unknown,
  linkId: string,
  expectedVersion: number,
): Readonly<QuickOrderLinkMutationResult> {
  const result = safeMutation(value);
  if (result.id !== linkId || result.status !== "cancelled" || result.version !== expectedVersion + 1) {
    throw new TypeError("invalid");
  }
  return result;
}

function safeList(value: unknown, pageSize: number) {
  const selected = exactRecord(value, ["items"], ["nextCursor"]);
  const rawItems = denseArray(selected.items, pageSize);
  const items = Object.freeze(rawItems.map((item) => {
    const parsed = parseQuickOrderLinkListItem(item);
    if (parsed.currency !== "TRY") throw new TypeError("invalid");
    return parsed;
  }));
  if (!Object.hasOwn(selected, "nextCursor")) return Object.freeze({ items });
  if (typeof selected.nextCursor !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(selected.nextCursor)) {
    throw new TypeError("invalid");
  }
  if (items.length === 0 || items.length !== pageSize) throw new TypeError("invalid");
  return Object.freeze({ items, nextCursor: selected.nextCursor });
}

function safeProvider(value: unknown): ProviderReadiness {
  const selected = exactRecord(value, ["status"], ["providerConfigId", "version"]);
  if (selected.status === "missing") {
    if (Object.keys(selected).length !== 1) throw new TypeError("invalid");
    return Object.freeze({ status: "missing" });
  }
  if (!["active", "disabled", "revoked"].includes(String(selected.status))) throw new TypeError("invalid");
  if (
    Object.keys(selected).length !== 3 || typeof selected.providerConfigId !== "string" || !UUID.test(selected.providerConfigId) ||
    !Number.isSafeInteger(selected.version) || (selected.version as number) < 1
  ) throw new TypeError("invalid");
  return Object.freeze({
    status: selected.status as "active" | "disabled" | "revoked",
    providerConfigId: selected.providerConfigId,
    version: selected.version as number,
  });
}

function selectedHostedMethod(value: unknown, paymentMethodId: string) {
  const entries = denseArray(value, 100).map((entry) => parseMerchantPaymentMethod(entry));
  const selected = entries.find((entry) => entry.id === paymentMethodId);
  if (
    selected === undefined || selected.kind !== "provider" || selected.state !== "active" ||
    (selected.providerCode !== "paytr_iframe" && selected.providerCode !== "iyzico_iframe")
  ) return null;
  return selected;
}

function providerResponse(value: unknown, status: "active" | "revoked", providerConfigId: string) {
  const selected = safeProvider(value);
  if (
    selected.status !== status || selected.version === undefined ||
    selected.providerConfigId !== providerConfigId
  ) throw new TypeError("invalid");
  return Object.freeze({ status, version: selected.version });
}

function persistedUrl(runtime: ServerQuickLinksRuntime, tenantContext: TenantContext, now: Date, linkId: string) {
  return runtime.privateLinks.revealLinkCredential({ tenantContext, now, linkId }).then((value) => {
    const selected = exactRecord(value, [
      "storeId", "linkId", "tokenDigest", "sealedToken", "canonicalHostname", "expiresAt",
    ]);
    if (
      selected.storeId !== tenantContext.store.id || selected.linkId !== linkId ||
      typeof selected.tokenDigest !== "string" || !DIGEST.test(selected.tokenDigest) ||
      typeof selected.canonicalHostname !== "string" || !HOSTNAME.test(selected.canonicalHostname) ||
      selected.canonicalHostname !== selected.canonicalHostname.toLowerCase() ||
      typeof selected.expiresAt !== "string" || !ISO_UTC.test(selected.expiresAt)
    ) throw new TypeError("invalid");
    const expiresAt = new Date(selected.expiresAt);
    const millisecondCanonical = selected.expiresAt.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.toISOString() !== millisecondCanonical) throw new TypeError("invalid");
    const token = openQuickLinkSecret({
      envelope: selected.sealedToken as never,
      purpose: "link-token",
      storeId: selected.storeId,
      objectId: selected.linkId,
      digest: selected.tokenDigest,
      keyring: runtime.keyring,
    });
    if (digestQuickLinkToken(token) !== selected.tokenDigest) throw new TypeError("invalid");
    return Object.freeze({
      url: `https://${selected.canonicalHostname}/odeme/hizli/${token}`,
      expiresAt: selected.expiresAt,
    });
  });
}

function fingerprint(parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
}

async function execute<T>(operation: () => Promise<T>, safe: (value: T) => unknown, status = 200): Promise<Response> {
  try { return json(safe(await operation()), status); }
  catch (caught) { return repositoryError(caught); }
}

async function executeUrl(operation: () => Promise<Readonly<{ url: string; expiresAt: string }>>, status = 200): Promise<Response> {
  try { return json(await operation(), status); }
  catch (caught) { return repositoryError(caught); }
}

function generateUuid(dependencies: Dependencies): string {
  const value = dependencies.generateId();
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError("invalid");
  return value;
}

export function createQuickLinkHttpHandlers(dependencies: Dependencies) {
  try {
    if (
      !dependencies || typeof dependencies !== "object" ||
      typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function" ||
      typeof dependencies.requestId !== "function" || typeof dependencies.generateId !== "function" ||
      typeof dependencies.generateToken !== "function"
    ) throw new Error("invalid");
  } catch { throw new Error("quick_link_http_handler_invalid"); }

  return Object.freeze({
    async paymentMethods(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: PAYMENT_METHODS_PATH, query: "forbidden",
      }, "quick_links.manage");
      if (isResponse(authorized)) return authorized;
      try {
        const methods = denseArray(await authorized.runtime.methods.list({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
        }), 100).map((entry) => parseMerchantPaymentMethod(entry));
        const items = methods.flatMap((method) => {
          if (
            method.kind !== "provider" || method.state !== "active" ||
            (method.providerCode !== "paytr_iframe" && method.providerCode !== "iyzico_iframe")
          ) return [];
          const requiresIyzicoBuyer = method.providerCode === "iyzico_iframe";
          return [Object.freeze({
            id: method.id,
            label: method.label,
            requiresIdentity: requiresIyzicoBuyer,
            requiresItemType: requiresIyzicoBuyer,
          })];
        });
        return json(Object.freeze({ items: Object.freeze(items) }), 200);
      } catch (caught) { return repositoryError(caught); }
    },

    async list(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: BASE_PATH, query: "allowed",
      }, "quick_links.read");
      if (isResponse(authorized)) return authorized;
      const input = readQuickLinkListInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.links.list({ tenantContext: authorized.tenantContext, now: authorized.now, ...input.value }),
        (value) => safeList(value, input.value.pageSize),
      );
    },

    async get(request: Request, rawLinkId: unknown): Promise<Response> {
      const linkId = pathId(rawLinkId);
      if (isResponse(linkId)) return linkId;
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: `${BASE_PATH}/${linkId}`, query: "forbidden",
      }, "quick_links.read");
      if (isResponse(authorized)) return authorized;
      return execute(
        () => authorized.runtime.links.get({ tenantContext: authorized.tenantContext, now: authorized.now, linkId }),
        (value) => safeDetail(value, linkId),
      );
    },

    async create(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: BASE_PATH, query: "forbidden",
      }, "quick_links.manage");
      if (isResponse(authorized)) return authorized;
      const input = await readQuickLinkMutationInput(request, "create");
      if (input.kind !== "valid" || input.operationId === undefined) return error("invalid_input", 400);
      const body = input.value as QuickLinkCreateBody;
      try {
        const hostedMethod = body.paymentMethodId === undefined
          ? null
          : selectedHostedMethod(await authorized.runtime.methods.list({
              tenantContext: authorized.tenantContext,
              now: authorized.now,
            }), body.paymentMethodId);
        if (body.paymentMethodId !== undefined && hostedMethod === null) return error("provider_not_ready", 409);
        const iyzico = hostedMethod?.providerCode === "iyzico_iframe";
        if (
          (iyzico && (body.identityNumber === undefined || body.items.some((item) => item.itemType === undefined))) ||
          (!iyzico && (body.identityNumber !== undefined || body.items.some((item) => item.itemType !== undefined)))
        ) return error("invalid_input", 400);
        const readiness = hostedMethod === null
          ? safeProvider(await authorized.runtime.privateLinks.getProviderReadiness({
              tenantContext: authorized.tenantContext, now: authorized.now,
            }))
          : null;
        if (hostedMethod === null && (readiness?.status === "missing" || readiness?.providerConfigId === undefined)) {
          return error("provider_not_ready", 409);
        }
        const linkId = generateUuid(dependencies);
        const itemIds = body.items.map(() => generateUuid(dependencies));
        if (new Set([linkId, ...itemIds]).size !== itemIds.length + 1) throw new TypeError("invalid");
        const token = dependencies.generateToken();
        const tokenDigest = digestQuickLinkToken(token);
        const sealedToken = sealQuickLinkSecret({
          plaintext: token, purpose: "link-token", storeId: authorized.tenantContext.store.id,
          objectId: linkId, digest: tokenDigest, keyring: authorized.runtime.keyring,
        });
        const buyerIdentity = body.identityNumber === undefined
          ? undefined
          : (() => {
              const authority = generateQuickLinkAuthority();
              return Object.freeze({
                authority,
                sealedIdentity: sealQuickLinkSecret({
                  plaintext: body.identityNumber!,
                  purpose: "buyer-identity",
                  storeId: authorized.tenantContext.store.id,
                  objectId: linkId,
                  digest: authority,
                  keyring: authorized.runtime.keyring,
                }),
              });
            })();
        const result = safeCreatedMutation(await authorized.runtime.links.create({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          linkId,
          items: body.items.map(({ variantId, quantity, itemType }, index) => ({
            itemId: itemIds[index]!, variantId, quantity,
            ...(itemType === undefined ? {} : { itemType }),
          })),
          ...(hostedMethod === null
            ? { providerConfigId: readiness!.providerConfigId! }
            : { paymentMethodId: hostedMethod.id }),
          ...(buyerIdentity === undefined ? {} : { buyerIdentity }),
          customerName: body.customerName,
          customerEmail: body.customerEmail,
          customerPhone: body.customerPhone,
          shippingAddress: body.shippingAddress,
          billingAddress: body.billingAddress,
          ...(body.customerNote === undefined ? {} : { customerNote: body.customerNote }),
          ...(body.internalLabel === undefined ? {} : { internalLabel: body.internalLabel }),
          shippingCents: body.shippingCents,
          discountCents: body.discountCents,
          expiryHours: body.expiryHours,
          tokenDigest,
          sealedToken,
        }), linkId);
        const share = await persistedUrl(authorized.runtime, authorized.tenantContext, authorized.now, result.id);
        return json(share, result.replayed ? 200 : 201);
      } catch (caught) { return repositoryError(caught); }
    },

    async cancel(request: Request, rawLinkId: unknown): Promise<Response> {
      const linkId = pathId(rawLinkId);
      if (isResponse(linkId)) return linkId;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: `${BASE_PATH}/${linkId}/cancel`, query: "forbidden",
      }, "quick_links.manage");
      if (isResponse(authorized)) return authorized;
      const input = await readQuickLinkMutationInput(request, "cancel");
      if (input.kind !== "valid" || input.operationId === undefined) return error("invalid_input", 400);
      const expectedVersion = (input.value as Readonly<{ expectedVersion: number }>).expectedVersion;
      return execute(
        () => authorized.runtime.links.cancel({
          tenantContext: authorized.tenantContext, now: authorized.now,
          operationId: input.operationId!, linkId, expectedVersion,
        }),
        (value) => safeCancelledMutation(value, linkId, expectedVersion),
      );
    },

    async duplicate(request: Request, rawLinkId: unknown): Promise<Response> {
      const linkId = pathId(rawLinkId);
      if (isResponse(linkId)) return linkId;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: `${BASE_PATH}/${linkId}/duplicate`, query: "forbidden",
      }, "quick_links.manage");
      if (isResponse(authorized)) return authorized;
      const input = await readQuickLinkMutationInput(request, "duplicate");
      if (input.kind !== "valid" || input.operationId === undefined) return error("invalid_input", 400);
      try {
        const source = safeDetail(await authorized.runtime.links.get({
          tenantContext: authorized.tenantContext, now: authorized.now, linkId,
        }), linkId);
        const newLinkId = generateUuid(dependencies);
        const newItemIds = source.items.map(() => generateUuid(dependencies));
        if (newLinkId === linkId || new Set([newLinkId, ...newItemIds]).size !== newItemIds.length + 1) {
          throw new TypeError("invalid");
        }
        const token = dependencies.generateToken();
        const tokenDigest = digestQuickLinkToken(token);
        const sealedToken = sealQuickLinkSecret({
          plaintext: token, purpose: "link-token", storeId: authorized.tenantContext.store.id,
          objectId: newLinkId, digest: tokenDigest, keyring: authorized.runtime.keyring,
        });
        const result = safeCreatedMutation(await authorized.runtime.links.duplicate({
          tenantContext: authorized.tenantContext, now: authorized.now, operationId: input.operationId,
          linkId, newLinkId, newItemIds, tokenDigest, sealedToken,
        }), newLinkId);
        const share = await persistedUrl(authorized.runtime, authorized.tenantContext, authorized.now, result.id);
        return json(share, result.replayed ? 200 : 201);
      } catch (caught) { return repositoryError(caught); }
    },

    async revealUrl(request: Request, rawLinkId: unknown): Promise<Response> {
      const linkId = pathId(rawLinkId);
      if (isResponse(linkId)) return linkId;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: `${BASE_PATH}/${linkId}/url`, query: "forbidden",
      }, "quick_links.manage");
      if (isResponse(authorized)) return authorized;
      const input = await readQuickLinkMutationInput(request, "reveal_url");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return executeUrl(() => persistedUrl(authorized.runtime, authorized.tenantContext, authorized.now, linkId));
    },

    async activateProvider(request: Request): Promise<Response> {
      const pathname = `${BASE_PATH}/provider/activate`;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname, query: "forbidden",
      }, "quick_links.manage");
      if (isResponse(authorized)) return authorized;
      const input = await readQuickLinkMutationInput(request, "activate_provider");
      if (input.kind !== "valid" || input.operationId === undefined) return error("invalid_input", 400);
      try {
        const readiness = safeProvider(await authorized.runtime.privateLinks.getProviderReadiness({
          tenantContext: authorized.tenantContext, now: authorized.now,
        }));
        const createNew = readiness.status === "missing";
        const providerConfigId = createNew ? generateUuid(dependencies) : readiness.providerConfigId!;
        const expectedVersion = createNew ? 0 : readiness.version!;
        const serialized = serializeCanonicalPaytrConfiguration(authorized.runtime.paytrConfiguration);
        const configurationDigest = digestCanonicalPaytrConfiguration(serialized);
        const sealedConfiguration = sealQuickLinkSecret({
          plaintext: serialized,
          purpose: "provider-config",
          storeId: authorized.tenantContext.store.id,
          objectId: providerConfigId,
          digest: configurationDigest,
          keyring: authorized.runtime.keyring,
        });
        const result = await authorized.runtime.privateLinks.configureProvider({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          providerConfigId,
          expectedVersion,
          operationId: input.operationId,
          configurationDigest,
          configurationKeyId: sealedConfiguration.keyId,
          sealedConfiguration,
          fingerprint: fingerprint(["configure_provider", authorized.tenantContext.store.id, providerConfigId, configurationDigest]),
        });
        return json(providerResponse(result, "active", providerConfigId), 200);
      } catch (caught) { return repositoryError(caught); }
    },

    async revokeProvider(request: Request): Promise<Response> {
      const pathname = `${BASE_PATH}/provider/revoke`;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname, query: "forbidden",
      }, "quick_links.manage");
      if (isResponse(authorized)) return authorized;
      const input = await readQuickLinkMutationInput(request, "revoke_provider");
      if (input.kind !== "valid" || input.operationId === undefined) return error("invalid_input", 400);
      try {
        const readiness = safeProvider(await authorized.runtime.privateLinks.getProviderReadiness({
          tenantContext: authorized.tenantContext, now: authorized.now,
        }));
        if (readiness.status === "missing" || readiness.providerConfigId === undefined || readiness.version === undefined) {
          return error("provider_not_ready", 409);
        }
        const result = await authorized.runtime.privateLinks.revokeProvider({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          providerConfigId: readiness.providerConfigId,
          expectedVersion: readiness.version,
          operationId: input.operationId,
          fingerprint: fingerprint(["revoke_provider", authorized.tenantContext.store.id, readiness.providerConfigId]),
        });
        return json(providerResponse(result, "revoked", readiness.providerConfigId), 200);
      } catch (caught) { return repositoryError(caught); }
    },
  });
}
