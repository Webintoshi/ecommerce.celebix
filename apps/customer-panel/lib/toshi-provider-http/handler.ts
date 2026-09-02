import { createHash } from "node:crypto";

import {
  TOSHI_PROVIDERS,
  isMerchantActionAllowed,
  parseToshiProviderConnection,
  parseToshiProviderConnectionList,
  type TenantContext,
  type ToshiProvider,
  type ToshiProviderConnection,
  type ToshiProviderErrorCode,
  type ToshiProviderModel,
} from "@celebix/saas-contracts";
import {
  TOSHI_PROVIDER_REPOSITORY_ERROR_CODES,
  ToshiProviderRepositoryError,
  sealMerchantProviderCredential,
  type ToshiProviderRepositoryErrorCode,
} from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import {
  approvedPanelMutationOriginForStore,
  hasApprovedPanelMutationOriginShape,
} from "../panel-origin-authority.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerToshiProviderRuntime } from "../server-toshi-providers/runtime.ts";
import { ToshiProviderAdapterError } from "../toshi-provider-adapters/types.ts";

const BASE = "/api/settings/artificial-intelligence/providers";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_KEY = /^[\x21-\x7e]{1,16384}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const MAXIMUM_BODY_BYTES = 20_480;
const ENCODER = new TextEncoder();

const REPOSITORY_STATUS: Readonly<Record<ToshiProviderRepositoryErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  store_inactive: 403,
  feature_not_enabled: 403,
  credential_invalid: 401,
  model_unavailable: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  provider_timeout: 504,
  provider_unavailable: 503,
  version_conflict: 409,
  operation_mismatch: 409,
  operation_not_found: 404,
  durable_authority_invalid: 409,
  unavailable: 503,
});

const ADAPTER_STATUS: Readonly<Record<ToshiProviderErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  origin_denied: 403,
  credential_invalid: 401,
  model_unavailable: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  provider_timeout: 504,
  provider_unavailable: 503,
  version_conflict: 409,
  unavailable: 503,
});

type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerToshiProviderRuntime | null>;
  now(): Date;
  requestId(): string;
  uuid(): string;
}>;

type Authorized = Readonly<{
  runtime: ServerToshiProviderRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;

export type ToshiProviderRouteContext = Readonly<{
  params: Promise<Readonly<{ provider: string }>>;
}>;

function json(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}

function failure(code: string, status: number, extra?: HeadersInit): Response {
  return json({ code }, status, extra);
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
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

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const actual = Reflect.ownKeys(descriptors);
    if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(descriptors, key))) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of actual) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}

function provider(value: unknown): ToshiProvider | null {
  return TOSHI_PROVIDERS.includes(value as never) ? value as ToshiProvider : null;
}

function version(value: unknown, minimum: 0 | 1): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum ? value as number : null;
}

function operationId(request: Request): string | null {
  const selected = request.headers.get("idempotency-key");
  return selected !== null && UUID.test(selected) && !selected.includes(",") ? selected : null;
}

function exactUrl(request: Request, pathname: string): boolean {
  try {
    const url = new URL(request.url);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      && url.pathname === pathname && url.search === "" && url.hash === "";
  } catch { return false; }
}

async function body(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > MAXIMUM_BODY_BYTES)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let joined: Uint8Array | undefined;
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_BODY_BYTES) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
    if (total < 1) return null;
    joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)) as unknown;
  } catch { return null; }
  finally { joined?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}

async function authorize(
  deps: Dependencies,
  request: Request,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  pathname: string,
): Promise<Response | Authorized> {
  let runtime: ServerToshiProviderRuntime | null;
  try { runtime = await deps.resolveRuntime(); } catch { return failure("unavailable", 503); }
  if (runtime === null) return failure("unavailable", 503);
  if (request.method !== method) return failure("method_not_allowed", 405, { allow: method });
  if (method !== "GET" && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin)) return failure("origin_denied", 403);
  if (!exactUrl(request, pathname) || privateHeaders(request)) return failure("invalid_input", 400);
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return failure("unauthenticated", 401);
  let now: Date;
  let requestId: string;
  try { now = deps.now(); requestId = deps.requestId(); } catch { return failure("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return failure("unavailable", 503);
  let access: ServerPanelAccessResult;
  try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); }
  catch { return failure("unavailable", 503); }
  if (access.kind === "unauthenticated") return failure("unauthenticated", 401);
  if (access.kind === "unauthorized") return failure("membership_denied", 403);
  if (access.kind !== "authenticated") return failure("unavailable", 503);
  if (
    method !== "GET" &&
    !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)
  ) return failure("origin_denied", 403);
  if (access.tenantContext.store.status !== "active") return failure("store_inactive", 403);
  if (access.tenantContext.membership.status !== "active") return failure("membership_denied", 403);
  const action = method === "GET" ? "configuration.read" : "configuration.manage";
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) return failure("membership_denied", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function mappedFailure(error: unknown): Response {
  if (error instanceof ToshiProviderAdapterError) return failure(error.code, ADAPTER_STATUS[error.code]);
  if (error instanceof ToshiProviderRepositoryError && TOSHI_PROVIDER_REPOSITORY_ERROR_CODES.includes(error.code)) {
    return failure(error.code, REPOSITORY_STATUS[error.code]);
  }
  return failure("unavailable", 503);
}

function safeConnection(value: unknown): ToshiProviderConnection {
  return parseToshiProviderConnection(value);
}

function verifiedModels(value: unknown): Readonly<{ models: readonly ToshiProviderModel[]; selectedModel: string }> {
  const parsed = exact(value, ["models", "selectedModel"]);
  if (!parsed || !Array.isArray(parsed.models) || parsed.models.length < 1 || parsed.models.length > 100 || typeof parsed.selectedModel !== "string") throw new ToshiProviderAdapterError("provider_unavailable");
  const synthetic = parseToshiProviderConnection({
    provider: "openai",
    label: "OpenAI",
    status: "active",
    isDefault: false,
    maskedKey: "••••safe",
    selectedModel: parsed.selectedModel,
    availableModels: parsed.models,
    version: 1,
    verifiedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  return Object.freeze({ models: synthetic.availableModels, selectedModel: synthetic.selectedModel });
}

async function routeProvider(context: ToshiProviderRouteContext): Promise<ToshiProvider | null> {
  try { return provider((await context.params).provider); } catch { return null; }
}

export function createToshiProviderHttpHandlers(deps: Dependencies) {
  return Object.freeze({
    async list(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "GET", BASE);
      if (isResponse(authorized)) return authorized;
      try {
        const items = await authorized.runtime.repository.list({ tenantContext: authorized.tenantContext, now: authorized.now });
        return json(parseToshiProviderConnectionList({ items }));
      } catch (error) { return mappedFailure(error); }
    },

    async connect(request: Request, context: ToshiProviderRouteContext): Promise<Response> {
      const selectedProvider = await routeProvider(context);
      if (selectedProvider === null) return failure("invalid_input", 400);
      const authorized = await authorize(deps, request, "POST", `${BASE}/${selectedProvider}/connect`);
      if (isResponse(authorized)) return authorized;
      const selectedOperationId = operationId(request);
      const parsed = exact(await body(request), ["apiKey", "expectedVersion"]);
      const expectedVersion = parsed ? version(parsed.expectedVersion, 0) : null;
      if (!parsed || selectedOperationId === null || expectedVersion === null || typeof parsed.apiKey !== "string" || !API_KEY.test(parsed.apiKey)) return failure("invalid_input", 400);
      const key = ENCODER.encode(parsed.apiKey);
      let keyring: ServerToshiProviderRuntime["keyring"] | undefined;
      try {
        const verified = verifiedModels(await authorized.runtime.adapters.get(selectedProvider).verify(key, AbortSignal.timeout(10_000)));
        const identity = await authorized.runtime.repository.getConnectionIdentity({ tenantContext: authorized.tenantContext, now: authorized.now, provider: selectedProvider });
        if ((identity === null && expectedVersion !== 0) || (identity !== null && identity.version !== expectedVersion)) return failure("version_conflict", 409);
        const configId = identity?.configId ?? deps.uuid();
        if (!UUID.test(configId)) return failure("unavailable", 503);
        const credentialVersion = (identity?.credentialVersion ?? 0) + 1;
        const credentialDigest = `sha256:${createHash("sha256").update(key).digest("hex")}`;
        const maskedKey = `••••${parsed.apiKey.slice(-4)}`;
        keyring = authorized.runtime.keyring;
        const sealedCredentials = sealMerchantProviderCredential({
          plaintext: key,
          profileId: configId,
          storeId: authorized.tenantContext.store.id,
          providerCode: selectedProvider,
          capability: "ai_assistant",
          credentialVersion,
          keyring,
        });
        const connection = await authorized.runtime.repository.connect({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: selectedOperationId,
          configId,
          provider: selectedProvider,
          sealedCredentials,
          credentialDigest,
          credentialVersion,
          maskedKey,
          selectedModel: verified.selectedModel,
          availableModels: verified.models,
          expectedVersion,
        });
        return json(safeConnection(connection));
      } catch (error) { return mappedFailure(error); }
      finally {
        key.fill(0);
        for (const entry of keyring?.keys ?? []) entry.key.fill(0);
      }
    },

    async selectModel(request: Request, context: ToshiProviderRouteContext): Promise<Response> {
      const selectedProvider = await routeProvider(context);
      if (selectedProvider === null) return failure("invalid_input", 400);
      const authorized = await authorize(deps, request, "PATCH", `${BASE}/${selectedProvider}/model`);
      if (isResponse(authorized)) return authorized;
      const selectedOperationId = operationId(request);
      const parsed = exact(await body(request), ["selectedModel", "expectedVersion"]);
      const expectedVersion = parsed ? version(parsed.expectedVersion, 1) : null;
      if (!parsed || selectedOperationId === null || expectedVersion === null || typeof parsed.selectedModel !== "string" || parsed.selectedModel.length < 1 || parsed.selectedModel !== parsed.selectedModel.trim() || CONTROL.test(parsed.selectedModel) || ENCODER.encode(parsed.selectedModel).byteLength > 160) return failure("invalid_input", 400);
      try {
        return json(safeConnection(await authorized.runtime.repository.selectModel({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: selectedOperationId, provider: selectedProvider, selectedModel: parsed.selectedModel, expectedVersion })));
      } catch (error) { return mappedFailure(error); }
    },

    async setDefault(request: Request, context: ToshiProviderRouteContext): Promise<Response> {
      return versionedMutation(deps, request, context, "POST", "default", "setDefault");
    },

    async revoke(request: Request, context: ToshiProviderRouteContext): Promise<Response> {
      return versionedMutation(deps, request, context, "DELETE", "", "revoke");
    },
  });
}

async function versionedMutation(
  deps: Dependencies,
  request: Request,
  context: ToshiProviderRouteContext,
  method: "POST" | "DELETE",
  suffix: "default" | "",
  action: "setDefault" | "revoke",
): Promise<Response> {
  const selectedProvider = await routeProvider(context);
  if (selectedProvider === null) return failure("invalid_input", 400);
  const authorized = await authorize(deps, request, method, `${BASE}/${selectedProvider}${suffix ? `/${suffix}` : ""}`);
  if (isResponse(authorized)) return authorized;
  const selectedOperationId = operationId(request);
  const parsed = exact(await body(request), ["expectedVersion"]);
  const expectedVersion = parsed ? version(parsed.expectedVersion, 1) : null;
  if (!parsed || selectedOperationId === null || expectedVersion === null) return failure("invalid_input", 400);
  try {
    const connection = await authorized.runtime.repository[action]({
      tenantContext: authorized.tenantContext,
      now: authorized.now,
      operationId: selectedOperationId,
      provider: selectedProvider,
      expectedVersion,
    });
    return json(safeConnection(connection));
  } catch (error) { return mappedFailure(error); }
}
