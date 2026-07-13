import type { CreateStarterTenantResult } from "@celebix/saas-contracts";
import { normalizeExactHttpsOrigin } from "@celebix/saas-data";

import { PANEL_OIDC_CALLBACK_URL } from "../../../../packages/platform-config/src/saas.ts";
import {
  beginSelfServeRegistration,
  type RegistrationAttemptStore,
  type SelfServeRegistrationStartInput,
} from "../self-serve-registration-orchestrator.ts";
import {
  beginOidcAuthorization,
  completeOidcCallback,
  type OidcCallbackInput,
  type OidcProviderPort,
  type OidcTransactionStore,
} from "../self-serve-oidc.ts";
import type {
  PersistentRegistrationCompletionService,
  ReconcileTenantResult,
  ResumeTenantResult,
  SafeCompletionError,
} from "../self-serve-registration-completion.ts";

const ACTIVATION_CAPABILITY = Symbol("phase2b1b2a_self_serve_http_activation");
const RUNTIME_CAPABILITY = Symbol("phase2b1b2a_self_serve_http_runtime");
const MAXIMUM_BODY_BYTES = 16_384;
const MAXIMUM_CALLBACK_QUERY_BYTES = 8_192;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type SelfServeHttpActivationEnvironment = "disposable_test" | "approved_staging";

export interface SelfServeHttpActivationApproval {
  readonly purpose: "phase2b1b2a_self_serve_http_wiring";
  readonly environment: SelfServeHttpActivationEnvironment;
  readonly registration: "disabled_public_activation";
  readonly sessions: "forbidden";
  readonly providerNetworking: "injected_only";
  readonly [ACTIVATION_CAPABILITY]: true;
}

export type SelfServeRequestGateDecision =
  | "allowed"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "unavailable";

export type SelfServeRequestGateInput =
  | { kind: "registration_start"; request: Request }
  | { kind: "callback_completion"; request: Request; edgeTrustContext: unknown };

export interface SelfServeRequestGate {
  verify(input: SelfServeRequestGateInput): Promise<SelfServeRequestGateDecision>;
}

export interface SelfServeHttpAuditEvent {
  operation: "registration_start" | "callback_completion";
  stage: "request_gate" | "request_validation" | "persistence" | "provider" | "tenant_completion";
  outcome: "allowed" | "rejected" | "completed" | "pending" | "failed";
  retryable: boolean;
  statusCategory: "2xx" | "4xx" | "5xx";
}

export interface SelfServeBodyPolicy {
  readonly maximumBytes: number;
  readonly maximumCallbackQueryBytes: number;
}

export interface SelfServeProviderAuthority {
  issuer: string;
  audience: string;
  authorizationOrigin: string;
}

export interface SafeTenantProjection {
  storeSlug: string;
  storefrontUrl: string;
  panelUrl: string;
  provisioningStatus: "ready";
}

export type SelfServeCallbackServiceResult =
  | ({ kind: "tenant_created_session_pending" | "tenant_recovered_session_pending" | "tenant_already_created_session_pending" } & SafeTenantProjection)
  | { kind: "in_progress" | "commit_unknown" | "reconciliation_required" | "completion_state_unknown"; retryable: boolean }
  | { kind: "recovery_absent"; retryable: false }
  | { kind: "completion_failed"; retryable: false }
  | { kind: "rejected"; error: SafeCompletionError };

export interface PersistentSelfServeRuntimeOptions {
  activationApproval: SelfServeHttpActivationApproval;
  registrationAttemptStore: RegistrationAttemptStore;
  oidcTransactionStore: OidcTransactionStore;
  registrationCompletion: PersistentRegistrationCompletionService;
  oidcProvider: OidcProviderPort;
  requestGate: SelfServeRequestGate;
  clock(): Date;
  audit(event: SelfServeHttpAuditEvent): void | Promise<void>;
  bodyPolicy: SelfServeBodyPolicy;
  callbackAuthority: string;
  panelOrigin: string;
  platformDomainSuffix: string;
  providerAuthority: SelfServeProviderAuthority;
}

export type DisabledSelfServeRuntime = Readonly<{ kind: "disabled" }>;

export interface PersistentSelfServeRuntime {
  readonly kind: "persistent";
  readonly bodyPolicy: SelfServeBodyPolicy;
  readonly callbackAuthority: string;
  readonly panelOrigin: string;
  readonly platformDomainSuffix: string;
  verifyRequest(input: SelfServeRequestGateInput): Promise<SelfServeRequestGateDecision>;
  beginRegistration(registration: SelfServeRegistrationStartInput): ReturnType<typeof beginSelfServeRegistration>;
  completeCallback(callback: OidcCallbackInput): Promise<SelfServeCallbackServiceResult>;
  rejectProviderCallback(state: string): Promise<void>;
  audit(event: SelfServeHttpAuditEvent): void;
  readonly [RUNTIME_CAPABILITY]: true;
}

export type SelfServeRuntime = DisabledSelfServeRuntime | PersistentSelfServeRuntime;

function defineCapability(target: object, capability: symbol): void {
  Object.defineProperty(target, capability, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });
}

function activationApproved(value: unknown): value is SelfServeHttpActivationApproval {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const approval = value as Partial<SelfServeHttpActivationApproval>;
  return approval[ACTIVATION_CAPABILITY] === true &&
    approval.purpose === "phase2b1b2a_self_serve_http_wiring" &&
    (approval.environment === "disposable_test" || approval.environment === "approved_staging") &&
    approval.registration === "disabled_public_activation" &&
    approval.sessions === "forbidden" &&
    approval.providerNetworking === "injected_only" &&
    Object.isFrozen(value) && Object.isSealed(value);
}

function canonicalClock(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("self_serve_http_runtime_invalid");
  }
  return value;
}

function exactHttpsProviderAuthority(input: SelfServeProviderAuthority): SelfServeProviderAuthority {
  if (!input || typeof input.issuer !== "string" || typeof input.audience !== "string" || typeof input.authorizationOrigin !== "string") {
    throw new Error("self_serve_http_runtime_invalid");
  }
  let issuer: URL;
  let authorizationOrigin: string;
  try {
    issuer = new URL(input.issuer);
    authorizationOrigin = normalizeExactHttpsOrigin(input.authorizationOrigin);
  } catch {
    throw new Error("self_serve_http_runtime_invalid");
  }
  if (
    issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash ||
    !input.audience.trim() || input.audience !== input.audience.trim() || input.audience.length > 512
  ) throw new Error("self_serve_http_runtime_invalid");
  return Object.freeze({ issuer: issuer.toString().replace(/\/$/, ""), audience: input.audience, authorizationOrigin });
}

function validateOptions(options: PersistentSelfServeRuntimeOptions) {
  if (!activationApproved(options.activationApproval)) {
    throw new Error("self_serve_http_activation_not_approved");
  }
  const body = options.bodyPolicy;
  if (
    !body || !Number.isSafeInteger(body.maximumBytes) || body.maximumBytes < 1 || body.maximumBytes > MAXIMUM_BODY_BYTES ||
    !Number.isSafeInteger(body.maximumCallbackQueryBytes) || body.maximumCallbackQueryBytes < 1 ||
    body.maximumCallbackQueryBytes > MAXIMUM_CALLBACK_QUERY_BYTES
  ) throw new Error("self_serve_http_runtime_invalid");
  let panelOrigin: string;
  try { panelOrigin = normalizeExactHttpsOrigin(options.panelOrigin); }
  catch { throw new Error("self_serve_http_runtime_invalid"); }
  if (
    options.callbackAuthority !== PANEL_OIDC_CALLBACK_URL ||
    !HOST.test(options.platformDomainSuffix) ||
    options.platformDomainSuffix !== options.platformDomainSuffix.toLowerCase() ||
    !options.registrationAttemptStore || typeof options.registrationAttemptStore.save !== "function" || typeof options.registrationAttemptStore.consume !== "function" ||
    !options.oidcTransactionStore || typeof options.oidcTransactionStore.save !== "function" || typeof options.oidcTransactionStore.consume !== "function" || typeof options.oidcTransactionStore.discard !== "function" ||
    !options.registrationCompletion || typeof options.registrationCompletion.recordVerifiedIdentity !== "function" || typeof options.registrationCompletion.resumeTenantCreation !== "function" || typeof options.registrationCompletion.reconcileUnknownCommit !== "function" ||
    !options.oidcProvider || typeof options.oidcProvider.buildAuthorizationUrl !== "function" || typeof options.oidcProvider.verifyCallback !== "function" ||
    !options.requestGate || typeof options.requestGate.verify !== "function" ||
    typeof options.clock !== "function" || typeof options.audit !== "function"
  ) throw new Error("self_serve_http_runtime_invalid");
  canonicalClock(options.clock);
  return {
    bodyPolicy: Object.freeze({ maximumBytes: body.maximumBytes, maximumCallbackQueryBytes: body.maximumCallbackQueryBytes }),
    panelOrigin,
    providerAuthority: exactHttpsProviderAuthority(options.providerAuthority),
  };
}

function safeCompletionError(error: SafeCompletionError): SafeCompletionError {
  const allowed = new Set([
    "durable_authority_invalid",
    "registration_attempt_missing",
    "registration_workflow_conflict",
    "registration_workflow_invalid_transition",
    "registration_identity_not_consumed",
    "registration_verified_identity_conflict",
    "completion_persistence_failed",
    "tenant_transaction_failed",
    "invalid_input",
    "slug_conflict",
    "domain_conflict",
    "membership_conflict",
    "idempotency_mismatch",
    "identity_unverified",
  ]);
  return allowed.has(error.code)
    ? { code: error.code, retryable: error.retryable === true }
    : { code: "durable_authority_invalid", retryable: false };
}

function safeTenant(result: CreateStarterTenantResult): SafeTenantProjection {
  return {
    storeSlug: result.store.slug,
    storefrontUrl: result.storefrontUrl,
    panelUrl: result.panelUrl,
    provisioningStatus: "ready",
  };
}

export function projectSelfServeCompletionOutcome(
  outcome: ResumeTenantResult | ReconcileTenantResult,
): SelfServeCallbackServiceResult {
  switch (outcome.kind) {
    case "tenant_created":
      return { kind: "tenant_created_session_pending", ...safeTenant(outcome.result) };
    case "tenant_recovered":
      return { kind: "tenant_recovered_session_pending", ...safeTenant(outcome.result) };
    case "tenant_replayed":
    case "tenant_already_created":
      return { kind: "tenant_already_created_session_pending", ...safeTenant(outcome.result) };
    case "in_progress":
    case "pending":
      return { kind: "in_progress", retryable: true };
    case "commit_unknown":
      return { kind: "commit_unknown", retryable: false };
    case "reconciliation_required":
      return { kind: "reconciliation_required", retryable: false };
    case "completion_state_unknown":
      return { kind: "completion_state_unknown", retryable: true };
    case "recovery_absent":
      return { kind: "recovery_absent", retryable: false };
    case "failed":
      return { kind: "completion_failed", retryable: false };
    case "rejected":
      return { kind: "rejected", error: safeCompletionError(outcome.error) };
  }
}

export function createSelfServeHttpActivationApproval(
  environment: SelfServeHttpActivationEnvironment,
): SelfServeHttpActivationApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") {
    throw new Error("self_serve_http_activation_not_approved");
  }
  const approval = {
    purpose: "phase2b1b2a_self_serve_http_wiring",
    environment,
    registration: "disabled_public_activation",
    sessions: "forbidden",
    providerNetworking: "injected_only",
  } as SelfServeHttpActivationApproval;
  defineCapability(approval, ACTIVATION_CAPABILITY);
  Object.seal(approval);
  return Object.freeze(approval);
}

export function createDisabledSelfServeRuntime(): DisabledSelfServeRuntime {
  return Object.freeze({ kind: "disabled" });
}

export function assertPersistentSelfServeRuntime(runtime: SelfServeRuntime): asserts runtime is PersistentSelfServeRuntime {
  if (
    !runtime || runtime.kind !== "persistent" ||
    (runtime as Partial<PersistentSelfServeRuntime>)[RUNTIME_CAPABILITY] !== true ||
    !Object.isFrozen(runtime)
  ) throw new Error("self_serve_http_activation_not_approved");
}

export function createPersistentSelfServeRuntime(
  options: PersistentSelfServeRuntimeOptions,
): PersistentSelfServeRuntime {
  const validated = validateOptions(options);

  const audit = (event: SelfServeHttpAuditEvent): void => {
    try {
      const pending = options.audit(Object.freeze({ ...event }));
      if (pending && typeof (pending as PromiseLike<void>).then === "function") {
        void Promise.resolve(pending).catch(() => undefined);
      }
    } catch {
      // Audit cannot replace durable application authority.
    }
  };

  const runtime = {
    kind: "persistent" as const,
    bodyPolicy: validated.bodyPolicy,
    callbackAuthority: options.callbackAuthority,
    panelOrigin: validated.panelOrigin,
    platformDomainSuffix: options.platformDomainSuffix,
    async verifyRequest(input: SelfServeRequestGateInput) {
      const decision = await options.requestGate.verify(input);
      if (!["allowed", "unauthorized", "forbidden", "rate_limited", "unavailable"].includes(decision)) {
        return "unavailable" as const;
      }
      return decision;
    },
    beginRegistration(registration: SelfServeRegistrationStartInput) {
      return beginSelfServeRegistration({
        enabled: true,
        registration,
        attemptStore: options.registrationAttemptStore,
        now: () => canonicalClock(options.clock),
        oidc: {
          begin: async ({ returnTo }) => beginOidcAuthorization({
            provider: options.oidcProvider,
            transactionStore: options.oidcTransactionStore,
            redirectUri: options.callbackAuthority,
            returnTo,
            expectedIssuer: validated.providerAuthority.issuer,
            expectedAudience: validated.providerAuthority.audience,
            expectedAuthorizationOrigin: validated.providerAuthority.authorizationOrigin,
            now: () => canonicalClock(options.clock),
          }),
          cancel: (state) => options.oidcTransactionStore.discard(state),
        },
      });
    },
    async completeCallback(callback: OidcCallbackInput): Promise<SelfServeCallbackServiceResult> {
      const completed = await completeOidcCallback({
        provider: options.oidcProvider,
        transactionStore: options.oidcTransactionStore,
        callback,
        now: () => canonicalClock(options.clock),
      });
      const attempt = await options.registrationAttemptStore.consume(callback.state, canonicalClock(options.clock));
      const recorded = await options.registrationCompletion.recordVerifiedIdentity({
        attemptId: attempt.id,
        expectedVersion: 1,
        identity: {
          issuer: completed.identity.issuer,
          subject: completed.identity.subject,
          email: completed.identity.email,
          emailVerified: completed.identity.emailVerified,
          ...(completed.identity.displayName ? { displayName: completed.identity.displayName } : {}),
        },
      });
      if (recorded.kind === "rejected") return { kind: "rejected", error: safeCompletionError(recorded.error) };
      return projectSelfServeCompletionOutcome(
        await options.registrationCompletion.resumeTenantCreation(attempt.id),
      );
    },
    async rejectProviderCallback(state: string) {
      if (typeof state !== "string" || state.length < 16 || state.length > 1_024 || state !== state.trim()) {
        throw new Error("oidc_invalid_state");
      }
      await options.oidcTransactionStore.consume(state, canonicalClock(options.clock));
    },
    audit,
  } as PersistentSelfServeRuntime;
  defineCapability(runtime, RUNTIME_CAPABILITY);
  return Object.freeze(runtime);
}
