import {
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_STATES,
  isMerchantActionAllowed,
  parseMerchantAdminConfig,
  parseMerchantPaymentMethod,
  parsePaymentMethodMutationResult,
  parsePaymentMethodReorderResult,
  parsePaymentProviderCatalog,
  type MerchantAdminJson,
  type PaymentMethodKind,
  type PaymentProviderCatalogEntry,
  type PaymentMethodState,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  PAYMENT_METHOD_ERROR_CODES,
  PaymentMethodRepositoryError,
  type PaymentMethodErrorCode,
} from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerPaymentMethodsRuntime } from "../server-payment-methods/runtime.ts";

const CATALOG_PATH = "/api/payment-providers/catalog";
const METHODS_PATH = "/api/payment-methods";
const REORDER_PATH = "/api/payment-methods/reorder";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const ENCODER = new TextEncoder();
const STATUS: Readonly<Record<PaymentMethodErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  store_inactive: 403,
  feature_not_enabled: 403,
  profile_not_found: 404,
  profile_not_active: 409,
  provider_capability_mismatch: 409,
  record_not_found: 404,
  invalid_transition: 409,
  version_conflict: 409,
  provider_already_active: 409,
  operation_mismatch: 409,
  operation_not_found: 404,
  durable_authority_invalid: 409,
  unavailable: 503,
});

type Deps = Readonly<{
  resolveRuntime(): Promise<ServerPaymentMethodsRuntime | null>;
  now(): Date;
  requestId(): string;
}>;
type Authorized = Readonly<{
  runtime: ServerPaymentMethodsRuntime;
  tenantContext: TenantContext;
  now: Date;
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
      if (
        name === "authorization"
        || name.startsWith("x-celebix")
        || [
          "x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id",
          "x-membership-id", "x-plan-id", "x-database-role", "x-database-url",
        ].includes(name)
      ) return true;
    }
    return false;
  } catch { return true; }
}

function exact(value: unknown, required: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== required.length
      || keys.some((key) => typeof key !== "string" || !required.includes(key))
      || required.some((key) => !Object.hasOwn(descriptors, key))
    ) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}

function dense(value: unknown, minimum: number, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) return null;
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch { return null; }
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function version(value: unknown, minimum: 0 | 1): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum ? value as number : null;
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  return typeof value === "string"
    && ENCODER.encode(value).byteLength >= minimum
    && ENCODER.encode(value).byteLength <= maximum
    && !CONTROL.test(value)
    && !EDGE.test(value)
    ? value
    : null;
}

function operationId(request: Request): string | null {
  const selected = request.headers.get("idempotency-key");
  return selected !== null && UUID.test(selected) && !selected.includes(",") ? selected : null;
}

async function body(request: Request): Promise<unknown | null> {
  if (
    request.headers.get("content-type") !== "application/json"
    || request.headers.get("transfer-encoding") !== null
    || request.body === null
  ) return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > 32_768)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let joined: Uint8Array | undefined;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > 32_768) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(new Uint8Array(next.value));
    }
    if (total < 1) return null;
    joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch { return null; }
  finally {
    joined?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

function exactUrl(request: Request, pathname: string): boolean {
  try {
    const url = new URL(request.url);
    return ["http:", "https:"].includes(url.protocol)
      && !url.username
      && !url.password
      && url.pathname === pathname
      && url.search === ""
      && url.hash === "";
  } catch { return false; }
}

async function authorize(
  deps: Deps,
  request: Request,
  method: "GET" | "POST",
  pathname: string,
): Promise<Response | Authorized> {
  let runtime: ServerPaymentMethodsRuntime | null;
  try { runtime = await deps.resolveRuntime(); } catch { return failure("unavailable", 503); }
  if (runtime === null) return failure("unavailable", 503);
  if (request.method !== method) return failure("method_not_allowed", 405, { allow: method });
  if (method === "POST" && request.headers.get("origin") !== runtime.access.panelOrigin) return failure("origin_denied", 403);
  if (!exactUrl(request, pathname) || privateHeaders(request)) return failure("invalid_input", 400);
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return failure("unauthenticated", 401);
  let now: Date;
  let requestId: string;
  try { now = deps.now(); requestId = deps.requestId(); } catch { return failure("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return failure("unavailable", 503);
  let access: ServerPanelAccessResult;
  try {
    access = await runtime.access.resolveCredential({
      credential: cookie.credential,
      requestId,
      now: new Date(now),
    });
  } catch { return failure("unavailable", 503); }
  if (access.kind === "unauthenticated") return failure("unauthenticated", 401);
  if (access.kind === "unauthorized") return failure("membership_denied", 403);
  if (access.kind !== "authenticated") return failure("unavailable", 503);
  if (access.tenantContext.store.status !== "active") return failure("store_inactive", 403);
  if (access.tenantContext.membership.status !== "active") return failure("membership_denied", 403);
  const action = method === "GET" ? "configuration.read" : "configuration.manage";
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) return failure("membership_denied", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function repositoryFailure(value: unknown): Response {
  return value instanceof PaymentMethodRepositoryError && PAYMENT_METHOD_ERROR_CODES.includes(value.code)
    ? failure(value.code, STATUS[value.code])
    : failure("unavailable", 503);
}

async function execute(run: () => Promise<unknown>, parser: (value: unknown) => unknown): Promise<Response> {
  try { return json(parser(await run())); }
  catch (error) { return repositoryFailure(error); }
}

function methodItems(value: unknown) {
  const selected = dense(value, 0, 100);
  if (selected === null) throw new TypeError();
  return Object.freeze({ items: Object.freeze(selected.map(parseMerchantPaymentMethod)) });
}

function safeConfig(value: unknown): Readonly<Record<string, MerchantAdminJson>> | null {
  try {
    const selected = parseMerchantAdminConfig(value);
    return ENCODER.encode(JSON.stringify(selected)).byteLength <= 8_192 ? selected : null;
  } catch { return null; }
}

function providerExecutionReady(
  runtime: ServerPaymentMethodsRuntime,
  entry: PaymentProviderCatalogEntry,
  config: Readonly<Record<string, MerchantAdminJson>>,
): boolean {
  const authority = entry.executionAuthority;
  const expectedEnvironment = entry.readiness === "sandbox_ready" ? "test"
    : entry.readiness === "production_ready" ? "live" : null;
  if (
    authority === null || expectedEnvironment === null ||
    authority.environment !== expectedEnvironment ||
    !/^sha256:[a-f0-9]{64}$/.test(authority.evidenceDigest) ||
    Object.keys(config).length !== 1 || config.environment !== authority.environment ||
    runtime.providerExecution === null
  ) return false;
  const descriptor = runtime.providerExecution.registry.get(entry.providerCode, "payment_processing");
  const packet = runtime.providerExecution.adapters.packet(entry.providerCode);
  const adapter = runtime.providerExecution.adapters.adapter(entry.providerCode);
  return descriptor !== null && descriptor.capability === "payment_processing"
    && descriptor.adapterVersion === authority.adapterVersion
    && descriptor.environments?.length === 1
    && descriptor.environments[0] === authority.environment
    && descriptor.executionAuthority !== null && descriptor.executionAuthority !== undefined
    && descriptor.executionAuthority.environment === authority.environment
    && descriptor.executionAuthority.adapterVersion === authority.adapterVersion
    && descriptor.executionAuthority.evidenceDigest === authority.evidenceDigest
    && packet !== null && adapter !== null && adapter.packet === packet
    && packet.providerCode === entry.providerCode
    && packet.familyCode === entry.familyCode && packet.modeCode === entry.modeCode
    && packet.adapterVersion === authority.adapterVersion
    && packet.readiness[authority.environment] === entry.readiness
    && packet.endpoints[authority.environment].length > 0;
}

function saveInput(value: unknown, runtime: ServerPaymentMethodsRuntime) {
  const parsed = exact(value, [
    "methodId", "expectedVersion", "kind", "profileId", "providerCode", "label", "config",
  ]);
  const methodId = parsed ? uuid(parsed.methodId) : null;
  const expectedVersion = parsed ? version(parsed.expectedVersion, 0) : null;
  const kind = parsed && PAYMENT_METHOD_KINDS.includes(parsed.kind as never) ? parsed.kind as PaymentMethodKind : null;
  const label = parsed ? text(parsed.label, 1, 120) : null;
  if (!parsed || methodId === null || expectedVersion === null || kind === null || label === null) return null;
  if (kind === "provider") {
    const profileId = uuid(parsed.profileId);
    const providerCode = typeof parsed.providerCode === "string" && PROVIDER_CODE.test(parsed.providerCode)
      ? parsed.providerCode
      : null;
    if (profileId === null || providerCode === null) return null;
    const catalogEntry = runtime.catalog.find((entry) => entry.providerCode === providerCode);
    if (catalogEntry === undefined) return null;
    if (catalogEntry.executionAuthority === null || (catalogEntry.readiness !== "production_ready" && catalogEntry.readiness !== "sandbox_ready")) return "unavailable" as const;
    const config = safeConfig(parsed.config);
    if (config === null) return null;
    if (!providerExecutionReady(runtime, catalogEntry, config)) return "unavailable" as const;
    return Object.freeze({ methodId, expectedVersion, kind, profileId, providerCode, label, config });
  }
  if (parsed.profileId !== null || parsed.providerCode !== null) return null;
  const config = safeConfig(parsed.config);
  return config === null ? null : Object.freeze({ methodId, expectedVersion, kind, profileId: null, providerCode: null, label, config });
}

function stateInput(value: unknown) {
  const parsed = exact(value, ["expectedVersion", "state", "emergencyReason"]);
  const expectedVersion = parsed ? version(parsed.expectedVersion, 1) : null;
  const state = parsed && PAYMENT_METHOD_STATES.includes(parsed.state as never) ? parsed.state as PaymentMethodState : null;
  if (!parsed || expectedVersion === null || state === null) return null;
  if (state === "emergency_disabled") {
    const emergencyReason = text(parsed.emergencyReason, 3, 240);
    return emergencyReason === null ? null : Object.freeze({ expectedVersion, state, emergencyReason });
  }
  return parsed.emergencyReason === null
    ? Object.freeze({ expectedVersion, state, emergencyReason: null })
    : null;
}

async function providerActivationReady(
  authorized: Authorized,
  methodId: string,
): Promise<"ready" | "record_not_found" | "unavailable"> {
  try {
    const listed = methodItems(await authorized.runtime.methods.list({
      tenantContext: authorized.tenantContext,
      now: authorized.now,
    }));
    const method = listed.items.find((entry) => entry.id === methodId);
    if (method === undefined) return "record_not_found";
    if (method.kind !== "provider") return "ready";
    if (method.providerCode === null) return "unavailable";
    const catalogEntry = authorized.runtime.catalog.find((entry) => entry.providerCode === method.providerCode);
    return catalogEntry !== undefined && providerExecutionReady(authorized.runtime, catalogEntry, method.config)
      ? "ready"
      : "unavailable";
  } catch { return "unavailable"; }
}

function reorderInput(value: unknown) {
  const parsed = exact(value, ["items"]);
  const rawItems = parsed ? dense(parsed.items, 1, 100) : null;
  if (rawItems === null) return null;
  const items = rawItems.map((entry) => {
    const item = exact(entry, ["id", "expectedVersion", "position"]);
    const id = item ? uuid(item.id) : null;
    const expectedVersion = item ? version(item.expectedVersion, 1) : null;
    const position = item && Number.isSafeInteger(item.position) && (item.position as number) >= 0 && (item.position as number) <= 9_999
      ? item.position as number
      : null;
    return item && id !== null && expectedVersion !== null && position !== null
      ? Object.freeze({ id, expectedVersion, position })
      : null;
  });
  if (items.some((item) => item === null)) return null;
  const selected = items as Array<Readonly<{ id: string; expectedVersion: number; position: number }>>;
  if (new Set(selected.map(({ id }) => id)).size !== selected.length) return null;
  if (new Set(selected.map(({ position }) => position)).size !== selected.length) return null;
  if ([...selected].map(({ position }) => position).sort((a, b) => a - b).some((position, index) => position !== index)) return null;
  return Object.freeze([...selected].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)));
}

export function createPaymentMethodHttpHandlers(deps: Deps) {
  if (!deps || typeof deps.resolveRuntime !== "function" || typeof deps.now !== "function" || typeof deps.requestId !== "function") {
    throw new Error("payment_method_http_handler_invalid");
  }
  return Object.freeze({
    async catalog(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "GET", CATALOG_PATH);
      if (isResponse(authorized)) return authorized;
      try {
        const catalog = parsePaymentProviderCatalog(authorized.runtime.catalog);
        if (
          catalog.length !== 58 ||
          catalog.some((entry) => entry.providerCode.includes("dummy"))
        ) {
          return failure("unavailable", 503);
        }
        return json(Object.freeze({ items: catalog }));
      } catch { return failure("unavailable", 503); }
    },

    async methods(request: Request): Promise<Response> {
      if (request.method === "GET") {
        const authorized = await authorize(deps, request, "GET", METHODS_PATH);
        return isResponse(authorized)
          ? authorized
          : execute(() => authorized.runtime.methods.list({
            tenantContext: authorized.tenantContext,
            now: authorized.now,
          }), methodItems);
      }
      const authorized = await authorize(deps, request, "POST", METHODS_PATH);
      if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      const selected = saveInput(await body(request), authorized.runtime);
      if (operation === null || selected === null) return failure("invalid_input", 400);
      if (selected === "unavailable") return failure("unavailable", 503);
      return execute(() => authorized.runtime.methods.save({
        tenantContext: authorized.tenantContext,
        now: authorized.now,
        operationId: operation,
        ...selected,
      }), (value) => {
        const result = parsePaymentMethodMutationResult(value);
        if (result.id !== selected.methodId) throw new TypeError();
        return result;
      });
    },

    async state(request: Request, rawMethodId: unknown): Promise<Response> {
      const methodId = uuid(rawMethodId);
      if (methodId === null) return failure("invalid_input", 400);
      const pathname = `${METHODS_PATH}/${methodId}/state`;
      const authorized = await authorize(deps, request, "POST", pathname);
      if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      const selected = stateInput(await body(request));
      if (operation === null || selected === null) return failure("invalid_input", 400);
      if (selected.state === "active") {
        const activation = await providerActivationReady(authorized, methodId);
        if (activation !== "ready") return activation === "record_not_found"
          ? failure("record_not_found", 404)
          : failure("unavailable", 503);
      }
      return execute(() => authorized.runtime.methods.setState({
        tenantContext: authorized.tenantContext,
        now: authorized.now,
        operationId: operation,
        methodId,
        ...selected,
      }), (value) => {
        const result = parsePaymentMethodMutationResult(value);
        if (result.id !== methodId || result.state !== selected.state) throw new TypeError();
        return result;
      });
    },

    async reorder(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "POST", REORDER_PATH);
      if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      const parsed = exact(await body(request), ["items"]);
      const items = parsed ? reorderInput({ items: parsed.items }) : null;
      if (operation === null || items === null) return failure("invalid_input", 400);
      return execute(() => authorized.runtime.methods.reorder({
        tenantContext: authorized.tenantContext,
        now: authorized.now,
        operationId: operation,
        items,
      }), parsePaymentMethodReorderResult);
    },
  });
}
