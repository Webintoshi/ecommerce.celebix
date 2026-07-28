import { createHash } from "node:crypto";

import {
  isMerchantActionAllowed,
  type MerchantProviderProfile,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  IYZICO_SANDBOX_EVIDENCE_ERROR_CODES,
  IyzicoSandboxEvidenceRepositoryError,
  type CurrentIyzicoSandboxEvidenceResult,
  type IyzicoSandboxEvidenceErrorCode,
} from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerIyzicoActivationRuntime } from "../server-iyzico-activation/runtime.ts";

const CURRENT_PATH = "/api/payment-providers/iyzico/sandbox-activation/current";
const BEGIN_PATH = "/api/payment-providers/iyzico/sandbox-activation/begin";
const ACTIVATE_PATH = "/api/payment-providers/iyzico/sandbox-activation/activate";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const STATUS: Readonly<Record<IyzicoSandboxEvidenceErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  store_inactive: 403,
  feature_not_enabled: 403,
  provider_disabled: 409,
  operation_mismatch: 409,
  profile_not_found: 404,
  profile_not_eligible: 409,
  profile_not_active: 409,
  version_conflict: 409,
  already_bound: 409,
  durable_authority_invalid: 409,
  run_not_found: 404,
  run_closed: 409,
  lease_conflict: 409,
  stale_evidence: 409,
  lease_lost: 409,
  case_not_found: 404,
  callback_mismatch: 409,
  timeout_mismatch: 409,
  evidence_incomplete: 409,
  evidence_mismatch: 409,
  single_provider_boundary_invalid: 409,
  method_not_found: 404,
  invalid_transition: 409,
  already_active: 409,
  attestation_not_found: 404,
  provider_already_active: 409,
  unavailable: 503,
  commit_unknown: 503,
});

type Deps = Readonly<{
  resolveRuntime(): Promise<ServerIyzicoActivationRuntime | null>;
  now(): Date;
  requestId(): string;
}>;

type Authorized = Readonly<{
  runtime: ServerIyzicoActivationRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;

type PublicState = Readonly<{
  phase:
    | "build_pending"
    | "credentials_unverified"
    | "evidence_pending"
    | "running"
    | "rejected"
    | "ready_to_activate"
    | "active";
  canBegin: boolean;
  canActivate: boolean;
  methodId: string | null;
  expectedMethodVersion: number | null;
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

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== keys.length
      || keys.some((key) => !Object.hasOwn(descriptors, key))
      || Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !keys.includes(key))) {
      return null;
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
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

function exactUrl(request: Request, pathname: string): boolean {
  try {
    const url = new URL(request.url);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username && !url.password && url.pathname === pathname
      && url.search === "" && url.hash === "";
  } catch { return false; }
}

function operationId(request: Request): string | null {
  const value = request.headers.get("idempotency-key");
  return value !== null && UUID.test(value) && !value.includes(",") ? value : null;
}

async function requestBody(request: Request, keys: readonly string[]): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type") !== "application/json"
    || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > 4_096)) return null;
  try { return exact(await request.json(), keys); } catch { return null; }
}

async function authorize(
  deps: Deps,
  request: Request,
  method: "GET" | "POST",
  pathname: string,
): Promise<Authorized | Response> {
  let runtime: ServerIyzicoActivationRuntime | null;
  try { runtime = await deps.resolveRuntime(); } catch { return failure("unavailable", 503); }
  if (runtime === null) return failure("unavailable", 503);
  if (request.method !== method) return failure("method_not_allowed", 405, { allow: method });
  if (method === "POST" && request.headers.get("origin") !== runtime.access.panelOrigin) {
    return failure("origin_denied", 403);
  }
  if (!exactUrl(request, pathname) || privateHeaders(request)) return failure("invalid_input", 400);
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return failure("unauthenticated", 401);
  let now: Date;
  let requestId: string;
  try { now = deps.now(); requestId = deps.requestId(); } catch { return failure("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) {
    return failure("unavailable", 503);
  }
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
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) {
    return failure("membership_denied", 403);
  }
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function isResponse(value: Authorized | Response): value is Response {
  return value instanceof Response;
}

function repositoryFailure(error: unknown): Response {
  if (error instanceof IyzicoSandboxEvidenceRepositoryError
    && IYZICO_SANDBOX_EVIDENCE_ERROR_CODES.includes(error.code)) {
    const code = error.code === "commit_unknown" ? "unavailable" : error.code;
    return failure(code, STATUS[error.code]);
  }
  return failure("unavailable", 503);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function state(
  phase: PublicState["phase"],
  canBegin = false,
  canActivate = false,
  methodId: string | null = null,
  expectedMethodVersion: number | null = null,
): PublicState {
  return Object.freeze({ phase, canBegin, canActivate, methodId, expectedMethodVersion });
}

function publicCurrent(value: CurrentIyzicoSandboxEvidenceResult): PublicState {
  if (value.outcome === "not_started") return state("evidence_pending", true);
  if (value.status === "pending" || value.status === "leased") return state("running");
  if (value.status === "rejected") return state("rejected", true);
  if (value.status === "attested" && value.activationCurrent && value.methodState === "active") {
    return state("active", false, false, value.methodId, value.methodVersion);
  }
  if (value.status === "attested" && value.activationCurrent && value.methodState === "disabled"
    && value.methodId !== null && value.methodVersion !== null) {
    return state("ready_to_activate", false, true, value.methodId, value.methodVersion);
  }
  return state("rejected", true);
}

async function profile(authorized: Authorized): Promise<MerchantProviderProfile | null> {
  const listed = await authorized.runtime.profiles.list({
    tenantContext: authorized.tenantContext,
    now: authorized.now,
    capability: "payment_processing",
  });
  const selected = listed.filter((candidate) => candidate.providerCode === "iyzico_iframe"
    && candidate.capability === "payment_processing"
    && candidate.status === "active"
    && candidate.lastValidatedAt !== null
    && Object.keys(candidate.publicConfig).length === 1
    && candidate.publicConfig.environment === "test");
  if (selected.length > 1) throw new Error("iyzico_activation_profile_ambiguous");
  return selected[0] ?? null;
}

export function createIyzicoActivationHttpHandlers(deps: Deps) {
  if (!deps || typeof deps.resolveRuntime !== "function"
    || typeof deps.now !== "function" || typeof deps.requestId !== "function") {
    throw new Error("iyzico_activation_http_handler_invalid");
  }
  return Object.freeze({
    async current(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "GET", CURRENT_PATH);
      if (isResponse(authorized)) return authorized;
      if (authorized.runtime.build === null) return json(state("build_pending"));
      try {
        const selected = await profile(authorized);
        if (selected === null) return json(state("credentials_unverified"));
        return json(publicCurrent(await authorized.runtime.evidence.current({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          profileId: selected.id,
        })));
      } catch (error) { return repositoryFailure(error); }
    },

    async begin(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "POST", BEGIN_PATH);
      if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      const body = await requestBody(request, []);
      if (operation === null || body === null) return failure("invalid_input", 400);
      const build = authorized.runtime.build;
      if (build === null) return failure("unavailable", 503);
      try {
        const selected = await profile(authorized);
        if (selected === null) return failure("profile_not_eligible", 409);
        const digest = fingerprint({
          kind: "iyzico_iframe_tenant_evidence_begin_current",
          storeId: authorized.tenantContext.store.id,
          runId: operation,
          profileId: selected.id,
          profileVersion: selected.version,
          credentialVersion: selected.credentialVersion,
          candidateEvidenceDigest: build.candidateExecutionDigest,
          adapterVersion: build.adapterVersion,
        });
        await authorized.runtime.evidence.beginCurrent({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          runId: operation,
          fingerprint: digest,
          profileId: selected.id,
          expectedProfileVersion: selected.version,
          expectedCredentialVersion: selected.credentialVersion,
          candidateEvidenceDigest: build.candidateExecutionDigest,
          adapterVersion: build.adapterVersion,
        });
        return json(state("running"));
      } catch (error) { return repositoryFailure(error); }
    },

    async activate(request: Request): Promise<Response> {
      const authorized = await authorize(deps, request, "POST", ACTIVATE_PATH);
      if (isResponse(authorized)) return authorized;
      const operation = operationId(request);
      const body = await requestBody(request, ["methodId", "expectedMethodVersion"]);
      const methodId = body?.methodId;
      const expectedMethodVersion = body?.expectedMethodVersion;
      if (operation === null || typeof methodId !== "string" || !UUID.test(methodId)
        || !Number.isSafeInteger(expectedMethodVersion) || (expectedMethodVersion as number) < 1
        || (expectedMethodVersion as number) >= Number.MAX_SAFE_INTEGER) {
        return failure("invalid_input", 400);
      }
      try {
        const selected = await profile(authorized);
        if (selected === null) return failure("profile_not_eligible", 409);
        const digest = fingerprint({
          kind: "iyzico_iframe_tenant_evidence_activate_current",
          storeId: authorized.tenantContext.store.id,
          operationId: operation,
          methodId,
          expectedMethodVersion,
        });
        const activated = await authorized.runtime.evidence.activateCurrent({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: operation,
          fingerprint: digest,
          methodId,
          expectedMethodVersion: expectedMethodVersion as number,
        });
        return json(state("active", false, false, activated.id, activated.version));
      } catch (error) { return repositoryFailure(error); }
    },
  });
}
