import { createHash } from "node:crypto";

import {
  MERCHANT_PROVIDER_CAPABILITIES,
  isMerchantActionAllowed,
  parseMerchantProviderDescriptor,
  parseMerchantProviderProfile,
  type MerchantProviderCapability,
  type PaymentProviderCatalogEntry,
  type PaymentProviderExecutionAuthority,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  MERCHANT_PROVIDER_PROFILE_ERROR_CODES,
  MerchantProviderProfileRepositoryError,
  sealMerchantProviderCredential,
  type MerchantProviderProfileErrorCode,
  type MerchantProviderValidationIdentity,
} from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import { approvedPanelMutationOrigin } from "../server-panel-access/mutation-origin.ts";
import type { ServerProviderExecutionRuntime } from "../server-provider-execution/runtime.ts";

const BASE = "/api/merchant-providers";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ARRAY_TAG_GETTER = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag)!.get as (this: ArrayBufferView) => string | undefined;
const STATUS: Readonly<Record<MerchantProviderProfileErrorCode, number>> = Object.freeze({
  invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403,
  feature_not_enabled: 403, provider_not_found: 404, provider_capability_mismatch: 409,
  provider_disabled: 409, profile_not_found: 404, invalid_transition: 409,
  version_conflict: 409, operation_mismatch: 409, operation_not_found: 404,
  durable_authority_invalid: 409, unavailable: 503,
});

type Deps = Readonly<{
  resolveRuntime(): Promise<ServerProviderExecutionRuntime | null>;
  now(): Date;
  requestId(): string;
  profileId(): string;
  providerCodes(capability: MerchantProviderCapability): readonly string[];
  paymentCatalog(): readonly PaymentProviderCatalogEntry[];
}>;
type Authorized = Readonly<{ runtime: ServerProviderExecutionRuntime; tenantContext: TenantContext; now: Date }>;

function json(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}
function failure(code: string, status: number, extra?: HeadersInit): Response { return json({ code }, status, extra); }
function response(value: unknown): value is Response { return value instanceof Response; }
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
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  ) return null;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") return null;
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}
function id(value: unknown): string | null { return typeof value === "string" && UUID.test(value) ? value : null; }
function version(value: unknown, minimum = 1): number | null { return Number.isSafeInteger(value) && (value as number) >= minimum ? value as number : null; }
function capability(value: unknown): MerchantProviderCapability | null {
  return MERCHANT_PROVIDER_CAPABILITIES.includes(value as never) ? value as MerchantProviderCapability : null;
}
function operation(request: Request): string | null {
  const selected = request.headers.get("idempotency-key");
  return selected !== null && UUID.test(selected) && !selected.includes(",") ? selected : null;
}

async function body(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > 32_768)) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0, joined: Uint8Array | undefined;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > 32_768) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
    if (total < 1) return null;
    joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch { return null; }
  finally { joined?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}

function requestUrl(request: Request, pathname: string, query: "none" | "capability"): MerchantProviderCapability | true | null {
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== pathname || url.hash) return null;
  if (query === "none") return url.search === "" ? true : null;
  const selected = capability(url.searchParams.get("capability"));
  if (selected === null || url.search !== `?capability=${selected}`) return null;
  return selected;
}

async function authorize(deps: Deps, request: Request, method: "GET" | "POST", pathname: string, query: "none" | "capability"): Promise<Response | (Authorized & Readonly<{ capability: MerchantProviderCapability | null }>)> {
  let runtime: ServerProviderExecutionRuntime | null;
  try { runtime = await deps.resolveRuntime(); } catch { return failure("unavailable", 503); }
  if (runtime === null) return failure("unavailable", 503);
  if (request.method !== method) return failure("method_not_allowed", 405, { allow: method });
  if (method === "POST" && !approvedPanelMutationOrigin(request, runtime.access.panelOrigin)) return failure("origin_denied", 403);
  const selectedQuery = requestUrl(request, pathname, query);
  if (selectedQuery === null || privateHeaders(request)) return failure("invalid_input", 400);
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return failure("unauthenticated", 401);
  let now: Date, requestId: string;
  try { now = deps.now(); requestId = deps.requestId(); } catch { return failure("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return failure("unavailable", 503);
  let access: ServerPanelAccessResult;
  try { access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now) }); }
  catch { return failure("unavailable", 503); }
  if (access.kind === "unauthenticated") return failure("unauthenticated", 401);
  if (access.kind === "unauthorized") return failure("membership_denied", 403);
  if (access.kind !== "authenticated") return failure("unavailable", 503);
  if (method === "POST" && !isMerchantActionAllowed(access.tenantContext.membership.role, "integrations.manage")) return failure("membership_denied", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now), capability: selectedQuery === true ? null : selectedQuery });
}

function repositoryFailure(value: unknown): Response {
  return value instanceof MerchantProviderProfileRepositoryError && MERCHANT_PROVIDER_PROFILE_ERROR_CODES.includes(value.code)
    ? failure(value.code, STATUS[value.code])
    : failure("unavailable", 503);
}
async function execute(run: () => Promise<unknown>, parser: (value: unknown) => unknown): Promise<Response> {
  try { return json(parser(await run())); } catch (error) { return repositoryFailure(error); }
}
function items(value: unknown): Readonly<{ items: readonly unknown[] }> {
  if (!Array.isArray(value) || value.length > 100) throw new TypeError();
  return Object.freeze({ items: Object.freeze(value.map(parseMerchantProviderProfile)) });
}
function bytes(value: unknown): Uint8Array {
  if (typeof value !== "object" || value === null || Reflect.apply(ARRAY_TAG_GETTER, value, []) !== "Uint8Array") throw new TypeError();
  const selected = value as Uint8Array;
  if (selected.byteLength < 1 || selected.byteLength > 16_384) { selected.fill(0); throw new TypeError(); }
  return selected;
}

function paymentExecutionAuthority(
  runtime: ServerProviderExecutionRuntime,
  entry: ReturnType<ServerProviderExecutionRuntime["registry"]["get"]>,
  catalog: readonly PaymentProviderCatalogEntry[],
) {
  if (
    entry === null || entry.capability !== "payment_processing" ||
    entry.profileSaveMode !== "execution_authority"
  ) return null;
  const catalogEntry = catalog.find((candidate) => candidate.providerCode === entry.providerCode);
  const authority = catalogEntry?.executionAuthority ?? null;
  const expectedReadiness = authority?.environment === "test" ? "sandbox_ready" : "production_ready";
  const packet = runtime.adapters.packet(entry.providerCode);
  const adapter = runtime.adapters.adapter(entry.providerCode);
  return catalogEntry !== undefined && authority !== null
    && catalogEntry.readiness === expectedReadiness
    && catalogEntry.environments.includes(authority.environment)
    && entry.adapterVersion === authority.adapterVersion
    && entry.environments?.length === 1 && entry.environments[0] === authority.environment
    && entry.executionAuthority?.environment === authority.environment
    && entry.executionAuthority.adapterVersion === authority.adapterVersion
    && entry.executionAuthority.evidenceDigest === authority.evidenceDigest
    && packet !== null && adapter !== null && adapter.packet === packet
    && packet.providerCode === catalogEntry.providerCode
    && packet.familyCode === catalogEntry.familyCode && packet.modeCode === catalogEntry.modeCode
    && packet.adapterVersion === authority.adapterVersion
    && packet.readiness[authority.environment] === catalogEntry.readiness
    && packet.endpoints[authority.environment].length > 0
    ? authority : null;
}

function paymentEnvironment(value: unknown): "test" | "live" | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, "environment");
  return descriptor?.enumerable === true && "value" in descriptor &&
    (descriptor.value === "test" || descriptor.value === "live")
    ? descriptor.value
    : null;
}

function paymentVerificationIdentity(
  runtime: ServerProviderExecutionRuntime,
  entry: ReturnType<ServerProviderExecutionRuntime["registry"]["get"]>,
  catalog: readonly PaymentProviderCatalogEntry[],
  environment: "test" | "live",
): Readonly<MerchantProviderValidationIdentity> | null {
  if (
    entry === null || entry.capability !== "payment_processing" ||
    entry.profileSaveMode !== "verification" || entry.executionAuthority !== null
  ) return null;
  const catalogEntry = catalog.find((candidate) => candidate.providerCode === entry.providerCode);
  const packet = runtime.adapters.packet(entry.providerCode);
  const adapter = runtime.adapters.adapter(entry.providerCode);
  return catalogEntry !== undefined
    && catalogEntry.readiness === "verification"
    && catalogEntry.executionAuthority === null
    && catalogEntry.environments.includes(environment)
    && entry.environments?.includes(environment) === true
    && entry.adapterVersion === packet?.adapterVersion
    && packet !== null && adapter !== null && adapter.packet === packet
    && packet.providerCode === catalogEntry.providerCode
    && packet.familyCode === catalogEntry.familyCode && packet.modeCode === catalogEntry.modeCode
    && packet.readiness[environment] === "verification"
    && packet.endpoints[environment].length > 0
    ? Object.freeze({ environment, adapterVersion: entry.adapterVersion! })
    : null;
}

export function createProviderExecutionHttpHandlers(deps: Deps) {
  return Object.freeze({
    async definitions(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "GET", `${BASE}/definitions`, "capability");
      if (response(authorized)) return authorized;
      const selectedCapability = authorized.capability!;
      try {
        const codes = deps.providerCodes(selectedCapability);
        if (!Array.isArray(codes) || codes.length > 64 || new Set(codes).size !== codes.length) return failure("unavailable", 503);
        const definitions = codes.map((providerCode) => {
          if (typeof providerCode !== "string") throw new TypeError();
          const entry = authorized.runtime.registry.get(providerCode, selectedCapability);
          if (entry === null) throw new TypeError();
          return parseMerchantProviderDescriptor({
            providerCode: entry.providerCode, capability: entry.capability, label: entry.label,
            publicFields: entry.publicFields, credentialFields: entry.credentialFields,
            ...(entry.capability === "payment_processing" ? {
              adapterVersion: entry.adapterVersion,
              environments: entry.environments,
              executionAuthority: entry.executionAuthority,
            } : {}),
          });
        });
        return json(Object.freeze({ items: Object.freeze(definitions) }));
      } catch { return failure("unavailable", 503); }
    },

    async profiles(request: Request): Promise<Response> {
      if (request.method === "GET") {
        const authorized = await authorize(deps, request, "GET", `${BASE}/profiles`, "capability");
        if (response(authorized)) return authorized;
        return execute(() => authorized.runtime.profiles.list({ tenantContext: authorized.tenantContext, now: authorized.now, capability: authorized.capability! }), items);
      }
      const authorized = await authorize(deps, request, "POST", `${BASE}/profiles`, "none");
      if (response(authorized)) return authorized;
      if (authorized.runtime.registry.size === 0) return failure("unavailable", 503);
      const operationId = operation(request);
      const parsed = exact(await body(request), ["providerCode", "capability", "publicConfig", "credential", "expectedVersion"], ["profileId"]);
      const selectedCapability = parsed ? capability(parsed.capability) : null;
      const expectedVersion = parsed ? version(parsed.expectedVersion, 0) : null;
      if (!parsed || operationId === null || selectedCapability === null || expectedVersion === null || typeof parsed.providerCode !== "string") return failure("invalid_input", 400);
      const entry = authorized.runtime.registry.get(parsed.providerCode, selectedCapability);
      if (entry === null) return failure("invalid_input", 400);
      let executionAuthority: Readonly<PaymentProviderExecutionAuthority> | null = null;
      let validationIdentity: Readonly<MerchantProviderValidationIdentity> | null = null;
      if (selectedCapability === "payment_processing") {
        try {
          if (entry.profileSaveMode === "verification") {
            const environment = paymentEnvironment(parsed.publicConfig);
            if (environment === null) return failure("invalid_input", 400);
            validationIdentity = paymentVerificationIdentity(
              authorized.runtime,
              entry,
              deps.paymentCatalog(),
              environment,
            );
          } else {
            executionAuthority = paymentExecutionAuthority(authorized.runtime, entry, deps.paymentCatalog());
          }
        }
        catch { return failure("unavailable", 503); }
        if (executionAuthority === null && validationIdentity === null) return failure("unavailable", 503);
      }
      const existingProfileId = parsed.profileId === undefined ? null : id(parsed.profileId);
      if ((expectedVersion === 0) !== (existingProfileId === null) || (parsed.profileId !== undefined && existingProfileId === null)) return failure("invalid_input", 400);
      let profileId: string, credential: Uint8Array | undefined;
      try {
        profileId = existingProfileId ?? deps.profileId();
        if (!UUID.test(profileId)) throw new TypeError();
        let credentialVersion = 1;
        if (existingProfileId !== null) {
          const existing = (await authorized.runtime.profiles.list({
            tenantContext: authorized.tenantContext,
            now: authorized.now,
            capability: selectedCapability,
          })).find((candidate) => candidate.id === existingProfileId);
          if (
            existing === undefined || existing.providerCode !== entry.providerCode ||
            existing.capability !== entry.capability || existing.version !== expectedVersion ||
            existing.status === "revoked"
          ) return failure("version_conflict", 409);
          if (
            validationIdentity !== null &&
            existing.publicConfig.environment !== validationIdentity.environment
          ) return failure("invalid_input", 400);
          credentialVersion = existing.credentialVersion + 1;
        }
        const publicConfig = entry.parsePublicConfig(parsed.publicConfig);
        if (
          validationIdentity !== null &&
          publicConfig.environment !== validationIdentity.environment
        ) throw new TypeError();
        const maskedAccountReference = entry.maskAccountReference(publicConfig);
        credential = bytes(entry.parseCredential(parsed.credential, publicConfig));
        const credentialDigest = createHash("sha256").update(credential).digest("hex");
        const sealedCredentials = sealMerchantProviderCredential({
          plaintext: credential,
          profileId,
          storeId: authorized.tenantContext.store.id,
          providerCode: entry.providerCode,
          capability: entry.capability,
          credentialVersion,
          keyring: authorized.runtime.keyring,
        });
        const common = {
          tenantContext: authorized.tenantContext, now: authorized.now, operationId,
          profileId, providerCode: entry.providerCode, capability: entry.capability,
          publicConfig, maskedAccountReference, sealedCredentials, credentialDigest, expectedVersion,
        };
        return validationIdentity === null
          ? await execute(() => authorized.runtime.profiles.save({
              ...common,
              executionAuthority,
            }), parseMerchantProviderProfile)
          : await execute(() => authorized.runtime.profiles.saveVerification({
              ...common,
              validationIdentity,
            }), parseMerchantProviderProfile);
      } catch (error) {
        return error instanceof TypeError ? failure("invalid_input", 400) : repositoryFailure(error);
      } finally { credential?.fill(0); }
    },

    async disable(request: Request, rawProfileId: string): Promise<Response> {
      const profileId = id(rawProfileId);
      if (profileId === null) return failure("invalid_input", 400);
      const authorized = await authorize(deps, request, "POST", `${BASE}/profiles/${profileId}/disable`, "none");
      if (response(authorized)) return authorized;
      if (authorized.runtime.registry.size === 0) return failure("unavailable", 503);
      const operationId = operation(request), parsed = exact(await body(request), ["expectedVersion"]);
      const expectedVersion = parsed ? version(parsed.expectedVersion) : null;
      return operationId !== null && expectedVersion !== null
        ? execute(() => authorized.runtime.profiles.disable({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, profileId, expectedVersion }), parseMerchantProviderProfile)
        : failure("invalid_input", 400);
    },

    async revoke(request: Request, rawProfileId: string): Promise<Response> {
      const profileId = id(rawProfileId);
      if (profileId === null) return failure("invalid_input", 400);
      const authorized = await authorize(deps, request, "POST", `${BASE}/profiles/${profileId}/revoke`, "none");
      if (response(authorized)) return authorized;
      if (authorized.runtime.registry.size === 0) return failure("unavailable", 503);
      const operationId = operation(request), parsed = exact(await body(request), ["expectedVersion"]);
      const expectedVersion = parsed ? version(parsed.expectedVersion) : null;
      return operationId !== null && expectedVersion !== null
        ? execute(() => authorized.runtime.profiles.revoke({ tenantContext: authorized.tenantContext, now: authorized.now, operationId, profileId, expectedVersion }), parseMerchantProviderProfile)
        : failure("invalid_input", 400);
    },
  });
}
