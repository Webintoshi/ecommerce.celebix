import type {
  CreateStarterTenantInput,
  CreateStarterTenantResult,
  SaaSContractError,
} from "@celebix/saas-contracts";
import {
  buildPanelSessionSetCookie,
  createPanelSession,
  type PanelSession,
  type PanelSessionCookiePolicy,
  type PanelSessionStore,
} from "./session.ts";

const PANEL_ORIGIN = "https://panel.celebix.site";

export type RegistrationCompletionStatus =
  | "awaiting_identity"
  | "identity_verified"
  | "tenant_created"
  | "session_created"
  | "failed";

export interface PanelVerifiedIdentity {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: boolean;
}

export interface StoredRegistrationAttempt {
  id: string;
  state: string;
  details: {
    storeName: string;
    storeSlug: string;
    locale: string;
    currency: string;
    themeKey: string;
    privacyAcceptedAt: string;
    marketingAcceptedAt?: string;
  };
  idempotencyKey: string;
  canonicalFingerprint: string;
  status: RegistrationCompletionStatus;
  createdAt: string;
  expiresAt: string;
  verifiedPrincipal?: { issuer: string; subject: string };
  tenantOperation?: {
    operationId: string;
    principalId: string;
    storeId: string;
    provisioningStatus: CreateStarterTenantResult["provisioningStatus"];
  };
  pendingSession?: PanelSession;
  safeError?: SaaSContractError;
}

export interface RegistrationCompletionStore {
  save(attempt: StoredRegistrationAttempt): Promise<void>;
  update(attempt: StoredRegistrationAttempt): Promise<void>;
  findByState(state: string, now: Date): Promise<StoredRegistrationAttempt | null>;
  findById(id: string, now: Date): Promise<StoredRegistrationAttempt | null>;
}

function cloneAttempt(attempt: StoredRegistrationAttempt) {
  return structuredClone(attempt);
}

const ALLOWED_STATUS_TRANSITIONS: Record<RegistrationCompletionStatus, ReadonlySet<RegistrationCompletionStatus>> = {
  awaiting_identity: new Set(["identity_verified", "failed"]),
  identity_verified: new Set(["tenant_created", "failed"]),
  tenant_created: new Set(["tenant_created", "session_created", "failed"]),
  session_created: new Set(["session_created"]),
  failed: new Set(["failed"]),
};

function immutableValueChanged(current: unknown, next: unknown) {
  return current !== undefined && JSON.stringify(current) !== JSON.stringify(next);
}

export class InMemoryRegistrationCompletionStore implements RegistrationCompletionStore {
  private readonly attempts = new Map<string, StoredRegistrationAttempt>();
  private readonly stateToId = new Map<string, string>();

  constructor(initial: readonly StoredRegistrationAttempt[] = []) {
    for (const attempt of initial) {
      if (this.attempts.has(attempt.id) || this.stateToId.has(attempt.state)) {
        throw new Error("registration_state_conflict");
      }
      this.attempts.set(attempt.id, cloneAttempt(attempt));
      this.stateToId.set(attempt.state, attempt.id);
    }
  }

  async save(attempt: StoredRegistrationAttempt) {
    if (this.attempts.has(attempt.id)) throw new Error("registration_attempt_conflict");
    if (this.stateToId.has(attempt.state)) throw new Error("registration_state_conflict");
    this.attempts.set(attempt.id, cloneAttempt(attempt));
    this.stateToId.set(attempt.state, attempt.id);
  }

  async update(attempt: StoredRegistrationAttempt) {
    const current = this.attempts.get(attempt.id);
    if (!current) throw new Error("registration_attempt_missing");
    if (
      current.state !== attempt.state ||
      current.idempotencyKey !== attempt.idempotencyKey ||
      current.canonicalFingerprint !== attempt.canonicalFingerprint ||
      immutableValueChanged(current.verifiedPrincipal, attempt.verifiedPrincipal) ||
      immutableValueChanged(current.tenantOperation, attempt.tenantOperation) ||
      immutableValueChanged(current.pendingSession, attempt.pendingSession)
    ) {
      throw new Error("registration_attempt_immutable_field_changed");
    }
    if (current.status !== attempt.status && !ALLOWED_STATUS_TRANSITIONS[current.status].has(attempt.status)) {
      throw new Error("registration_attempt_status_invalid");
    }
    this.attempts.set(attempt.id, cloneAttempt(attempt));
  }

  async findByState(state: string, now: Date) {
    const id = this.stateToId.get(state);
    return id ? this.findById(id, now) : null;
  }

  async findById(id: string, now: Date) {
    const attempt = this.attempts.get(id);
    if (!attempt || Date.parse(attempt.expiresAt) <= now.getTime()) return null;
    return cloneAttempt(attempt);
  }
}

interface TenantCorePort {
  createStarterTenant(input: CreateStarterTenantInput): Promise<
    | { ok: true; value: CreateStarterTenantResult }
    | { ok: false; error: SaaSContractError }
  >;
}

type TenantInputBuildResult =
  | { ok: true; input: CreateStarterTenantInput }
  | { ok: false; error: SaaSContractError };

interface CompletionDependencies {
  completionStore: RegistrationCompletionStore;
  panelSessionStore: PanelSessionStore;
  buildTenantInput(
    identity: PanelVerifiedIdentity,
    details: StoredRegistrationAttempt["details"],
    idempotencyKey: string,
  ): Promise<TenantInputBuildResult>;
  tenantCoreClient: TenantCorePort;
  now?: () => Date;
}

type CompletionResult =
  | { ok: true; session: PanelSession; redirectTo: string; operationId: string }
  | { ok: false; code: string; retryable: boolean; status: number };

function denied(code: string, status = 403, retryable = false): CompletionResult {
  return { ok: false, code, retryable, status };
}

function identityMatches(
  expected: { issuer: string; subject: string },
  actual: { issuer: string; subject: string },
) {
  return expected.issuer === actual.issuer && expected.subject === actual.subject;
}

function validTenantResult(result: CreateStarterTenantResult) {
  return (
    result.provisioningStatus !== "failed" &&
    result.membership.status === "active" &&
    result.membership.storeId === result.store.id &&
    result.store.status === "active"
  );
}

async function establishSession(
  attempt: StoredRegistrationAttempt,
  dependencies: CompletionDependencies,
  now: Date,
): Promise<CompletionResult> {
  if (!attempt.verifiedPrincipal || !attempt.tenantOperation) {
    return denied("registration_attempt_invalid", 409);
  }

  let current = cloneAttempt(attempt);
  const verifiedPrincipal = current.verifiedPrincipal;
  const tenantOperation = current.tenantOperation;
  if (!verifiedPrincipal || !tenantOperation) return denied("registration_attempt_invalid", 409);
  if (current.status === "session_created") {
    if (!current.pendingSession) return denied("registration_attempt_invalid", 409);
    const existing = await dependencies.panelSessionStore.read(current.pendingSession.id);
    return existing
      ? {
          ok: true,
          session: existing,
          redirectTo: tenantOperation.provisioningStatus === "ready" ? `${PANEL_ORIGIN}/` : `${PANEL_ORIGIN}/setup`,
          operationId: tenantOperation.operationId,
        }
      : denied("registration_recovery_denied", 403);
  }

  if (!current.pendingSession) {
    current.pendingSession = createPanelSession({
      principal: {
        id: tenantOperation.principalId,
        issuer: verifiedPrincipal.issuer,
        subject: verifiedPrincipal.subject,
      },
      activeStoreId: tenantOperation.storeId,
      now,
    });
    await dependencies.completionStore.update(current);
  }

  const pending = current.pendingSession;
  const existing = await dependencies.panelSessionStore.read(pending.id);
  if (!existing) {
    try {
      await dependencies.panelSessionStore.create(pending);
    } catch {
      return denied("panel_session_retry_required", 503, true);
    }
  }

  current = { ...current, status: "session_created" };
  try {
    await dependencies.completionStore.update(current);
  } catch {
    return denied("panel_session_retry_required", 503, true);
  }
  return {
    ok: true,
    session: pending,
    redirectTo: tenantOperation.provisioningStatus === "ready" ? `${PANEL_ORIGIN}/` : `${PANEL_ORIGIN}/setup`,
    operationId: tenantOperation.operationId,
  };
}

export async function completePanelRegistration(
  input: CompletionDependencies & { attemptId: string; identity: PanelVerifiedIdentity },
): Promise<CompletionResult> {
  const now = input.now?.() ?? new Date();
  let attempt = await input.completionStore.findById(input.attemptId, now);
  if (!attempt) return denied("registration_attempt_missing", 400);
  if (!input.identity.emailVerified || !input.identity.issuer.trim() || !input.identity.subject.trim()) {
    return denied("identity_unverified", 403);
  }

  if (attempt.verifiedPrincipal && !identityMatches(attempt.verifiedPrincipal, input.identity)) {
    return denied("registration_recovery_denied", 403);
  }
  if (attempt.status === "failed") return denied("registration_attempt_failed", 409);

  if (attempt.status === "awaiting_identity") {
    attempt = {
      ...attempt,
      verifiedPrincipal: { issuer: input.identity.issuer, subject: input.identity.subject },
      status: "identity_verified",
    };
    await input.completionStore.update(attempt);
  }

  if (attempt.status === "identity_verified") {
    const built = await input.buildTenantInput(input.identity, attempt.details, attempt.idempotencyKey);
    if (
      !built.ok ||
      built.input.idempotencyKey !== attempt.idempotencyKey ||
      !identityMatches(input.identity, built.input.principal)
    ) {
      const safeError = built.ok
        ? { schemaVersion: 1 as const, code: "invalid_input" as const, retryable: false }
        : built.error;
      await input.completionStore.update({ ...attempt, status: "failed", safeError });
      return denied(safeError.code, 400, safeError.retryable);
    }

    const tenant = await input.tenantCoreClient.createStarterTenant(built.input);
    if (!tenant.ok || !validTenantResult(tenant.value)) {
      const safeError = tenant.ok
        ? { schemaVersion: 1 as const, code: "tenant_transaction_failed" as const, retryable: false }
        : tenant.error;
      await input.completionStore.update({ ...attempt, status: "failed", safeError });
      return denied(safeError.code, safeError.retryable ? 503 : 409, safeError.retryable);
    }

    attempt = {
      ...attempt,
      status: "tenant_created",
      tenantOperation: {
        operationId: tenant.value.operationId,
        principalId: tenant.value.membership.principalId,
        storeId: tenant.value.store.id,
        provisioningStatus: tenant.value.provisioningStatus,
      },
    };
    await input.completionStore.update(attempt);
  }

  return establishSession(attempt, input, now);
}

export type RegistrationRecoveryAuthority =
  | { kind: "verified_identity"; identity: PanelVerifiedIdentity }
  | {
      kind: "authenticated_principal";
      principal: { id: string; issuer: string; subject: string };
    };

export async function recoverPanelRegistration(
  input: CompletionDependencies & {
    attemptId: string;
    authority: RegistrationRecoveryAuthority;
  },
): Promise<CompletionResult> {
  const now = input.now?.() ?? new Date();
  const attempt = await input.completionStore.findById(input.attemptId, now);
  if (!attempt?.verifiedPrincipal || !attempt.tenantOperation) {
    return denied("registration_recovery_denied", 403);
  }

  const authority = input.authority;
  const matches = authority?.kind === "verified_identity"
    ? authority.identity.emailVerified && identityMatches(attempt.verifiedPrincipal, authority.identity)
    : authority?.kind === "authenticated_principal"
      ? authority.principal.id === attempt.tenantOperation.principalId &&
        identityMatches(attempt.verifiedPrincipal, authority.principal)
      : false;
  if (!matches) return denied("registration_recovery_denied", 403);
  return establishSession(attempt, input, now);
}

interface CallbackDependencies extends CompletionDependencies {
  enabled: boolean;
  oidc: {
    complete(callback: { state: string; code: string }): Promise<PanelVerifiedIdentity>;
  };
  cookiePolicy: PanelSessionCookiePolicy;
}

function callbackJson(code: string, status: number) {
  return Response.json({ code }, { status, headers: { "cache-control": "no-store" } });
}

export function createPanelOidcCallbackHandler(dependencies: CallbackDependencies) {
  return async function panelOidcCallback(request: Request) {
    if (!dependencies.enabled) return callbackJson("panel_auth_disabled", 503);
    const url = new URL(request.url);
    const state = (url.searchParams.get("state") ?? "").trim();
    const code = (url.searchParams.get("code") ?? "").trim();
    if (!state || !code) return callbackJson("invalid_callback_state", 400);

    const attempt = await dependencies.completionStore.findByState(state, dependencies.now?.() ?? new Date());
    if (!attempt || attempt.status !== "awaiting_identity") {
      return callbackJson("invalid_callback_state", 400);
    }

    let identity: PanelVerifiedIdentity;
    try {
      identity = await dependencies.oidc.complete({ state, code });
    } catch {
      return callbackJson("invalid_callback_state", 400);
    }
    const completed = await completePanelRegistration({ ...dependencies, attemptId: attempt.id, identity });
    if (!completed.ok) return callbackJson(completed.code, completed.status);

    return new Response(null, {
      status: 303,
      headers: {
        location: completed.redirectTo,
        "cache-control": "no-store",
        "set-cookie": buildPanelSessionSetCookie(completed.session.id, dependencies.cookiePolicy),
      },
    });
  };
}

export function createDisabledPanelOidcCallbackHandler() {
  return async function disabledPanelOidcCallback() {
    return callbackJson("panel_auth_disabled", 503);
  };
}
