import type {
  CreateStarterTenantInput,
  CreateStarterTenantResult,
  SaaSContractError,
} from "@celebix/saas-contracts";
import { createCanonicalTenantFingerprint } from "@celebix/saas-data";
import {
  buildPanelSessionSetCookie,
  createPanelSession,
  type PanelSession,
  type PanelSessionCookiePolicy,
  type PanelSessionStore,
} from "./session.ts";
import {
  PANEL_OIDC_CALLBACK_URL,
  PANEL_ORIGIN,
} from "./config.ts";

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
  requestedAt: string;
  canonicalFingerprint?: string;
  status: RegistrationCompletionStatus;
  createdAt: string;
  expiresAt: string;
  verifiedPrincipal?: PanelVerifiedIdentity & { emailVerified: true };
  tenantInputSnapshot?: CreateStarterTenantInput;
  tenantResult?: CreateStarterTenantResult;
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
      immutableValueChanged(current.details, attempt.details) ||
      current.idempotencyKey !== attempt.idempotencyKey ||
      current.requestedAt !== attempt.requestedAt ||
      current.createdAt !== attempt.createdAt ||
      current.expiresAt !== attempt.expiresAt ||
      immutableValueChanged(current.canonicalFingerprint, attempt.canonicalFingerprint) ||
      immutableValueChanged(current.verifiedPrincipal, attempt.verifiedPrincipal) ||
      immutableValueChanged(current.tenantInputSnapshot, attempt.tenantInputSnapshot) ||
      immutableValueChanged(current.tenantResult, attempt.tenantResult) ||
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
  | { ok: true; input: CreateStarterTenantInput; canonicalFingerprint?: string }
  | { ok: false; error: SaaSContractError };

interface CompletionDependencies {
  completionStore: RegistrationCompletionStore;
  panelSessionStore: PanelSessionStore;
  buildTenantInput(
    identity: PanelVerifiedIdentity,
    attempt: StoredRegistrationAttempt,
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

function verifiedIdentityMatches(
  expected: PanelVerifiedIdentity,
  actual: PanelVerifiedIdentity,
) {
  return (
    identityMatches(expected, actual) &&
    expected.emailVerified &&
    actual.emailVerified &&
    expected.email.trim().toLowerCase() === actual.email.trim().toLowerCase()
  );
}

function normalizedVerifiedIdentity(identity: PanelVerifiedIdentity) {
  return {
    issuer: identity.issuer,
    subject: identity.subject,
    email: identity.email.trim().toLowerCase(),
    emailVerified: true as const,
  };
}

async function safeUpdate(
  store: RegistrationCompletionStore,
  attempt: StoredRegistrationAttempt,
) {
  try {
    await store.update(attempt);
    return true;
  } catch {
    return false;
  }
}

function snapshotMatchesAttempt(
  attempt: StoredRegistrationAttempt,
  identity: PanelVerifiedIdentity,
) {
  const snapshot = attempt.tenantInputSnapshot;
  if (!snapshot || !attempt.canonicalFingerprint) return false;
  return (
    snapshot.idempotencyKey === attempt.idempotencyKey &&
    snapshot.requestedAt === attempt.requestedAt &&
    snapshot.principal.issuer === identity.issuer &&
    snapshot.principal.subject === identity.subject &&
    snapshot.principal.email === identity.email.trim().toLowerCase() &&
    snapshot.principal.emailVerified === true &&
    snapshot.store.name === attempt.details.storeName &&
    snapshot.store.slug === attempt.details.storeSlug &&
    snapshot.store.locale === attempt.details.locale &&
    snapshot.store.currency === attempt.details.currency &&
    snapshot.store.themeKey === attempt.details.themeKey &&
    snapshot.consents.privacyAcceptedAt === attempt.details.privacyAcceptedAt &&
    snapshot.consents.marketingAcceptedAt === attempt.details.marketingAcceptedAt &&
    createCanonicalTenantFingerprint(snapshot) === attempt.canonicalFingerprint
  );
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
  if (!attempt.verifiedPrincipal || !attempt.tenantOperation || !attempt.tenantResult) {
    return denied("registration_attempt_invalid", 409);
  }

  let current = cloneAttempt(attempt);
  const verifiedPrincipal = current.verifiedPrincipal;
  const tenantOperation = current.tenantOperation;
  const tenantResult = current.tenantResult;
  if (!verifiedPrincipal || !tenantOperation || !tenantResult) {
    return denied("registration_attempt_invalid", 409);
  }
  if (current.status === "session_created") {
    if (!current.pendingSession) return denied("registration_attempt_invalid", 409);
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
    if (!(await safeUpdate(dependencies.completionStore, current))) {
      return denied("panel_session_retry_required", 503, true);
    }
  }

  const pending = current.pendingSession;
  let existing: PanelSession | null;
  try {
    existing = await dependencies.panelSessionStore.read(pending.id);
  } catch {
    return denied("panel_session_retry_required", 503, true);
  }
  if (!existing) {
    try {
      await dependencies.panelSessionStore.create(pending);
    } catch {
      return denied("panel_session_retry_required", 503, true);
    }
  }

  if (current.status !== "session_created") {
    current = { ...current, status: "session_created" };
    if (!(await safeUpdate(dependencies.completionStore, current))) {
      return denied("panel_session_retry_required", 503, true);
    }
  }
  return {
    ok: true,
    session: existing ?? pending,
    redirectTo: tenantResult.provisioningStatus === "ready" ? `${PANEL_ORIGIN}/` : `${PANEL_ORIGIN}/setup`,
    operationId: tenantOperation.operationId,
  };
}

export async function completePanelRegistration(
  input: CompletionDependencies & { attemptId: string; identity: PanelVerifiedIdentity },
): Promise<CompletionResult> {
  const now = input.now?.() ?? new Date();
  let attempt: StoredRegistrationAttempt | null;
  try {
    attempt = await input.completionStore.findById(input.attemptId, now);
  } catch {
    return denied("panel_completion_unavailable", 503, true);
  }
  if (!attempt) return denied("registration_attempt_missing", 400);
  if (
    !input.identity.emailVerified ||
    !input.identity.issuer.trim() ||
    !input.identity.subject.trim() ||
    !input.identity.email.trim()
  ) {
    return denied("identity_unverified", 403);
  }

  if (attempt.verifiedPrincipal && !verifiedIdentityMatches(attempt.verifiedPrincipal, input.identity)) {
    return denied("registration_recovery_denied", 403);
  }
  if (attempt.status === "failed") return denied("registration_attempt_failed", 409);

  if (attempt.status === "awaiting_identity") {
    attempt = {
      ...attempt,
      verifiedPrincipal: normalizedVerifiedIdentity(input.identity),
      status: "identity_verified",
    };
    if (!(await safeUpdate(input.completionStore, attempt))) {
      return denied("panel_completion_unavailable", 503, true);
    }
  }

  if (attempt.status === "identity_verified") {
    if (!attempt.tenantInputSnapshot) {
      let built: TenantInputBuildResult;
      try {
        built = await input.buildTenantInput(input.identity, cloneAttempt(attempt));
      } catch {
        return denied("tenant_transaction_failed", 503, true);
      }
      if (!built.ok) {
        if (built.error.retryable) return denied(built.error.code, 503, true);
        const failed = { ...attempt, status: "failed" as const, safeError: built.error };
        if (!(await safeUpdate(input.completionStore, failed))) {
          return denied("panel_completion_unavailable", 503, true);
        }
        return denied(built.error.code, 400, false);
      }
      const computedFingerprint = createCanonicalTenantFingerprint(built.input);
      if (
        built.input.idempotencyKey !== attempt.idempotencyKey ||
        built.input.requestedAt !== attempt.requestedAt ||
        !verifiedIdentityMatches(input.identity, built.input.principal) ||
        ("canonicalFingerprint" in built && built.canonicalFingerprint !== computedFingerprint)
      ) {
        const safeError = { schemaVersion: 1 as const, code: "invalid_input" as const, retryable: false };
        const failed = { ...attempt, status: "failed" as const, safeError };
        if (!(await safeUpdate(input.completionStore, failed))) {
          return denied("panel_completion_unavailable", 503, true);
        }
        return denied(safeError.code, 400, false);
      }
      attempt = {
        ...attempt,
        tenantInputSnapshot: structuredClone(built.input),
        canonicalFingerprint: computedFingerprint,
      };
      if (!(await safeUpdate(input.completionStore, attempt))) {
        return denied("panel_completion_unavailable", 503, true);
      }
    }

    if (!attempt.tenantInputSnapshot || !snapshotMatchesAttempt(attempt, input.identity)) {
      const safeError = {
        schemaVersion: 1 as const,
        code: "invalid_input" as const,
        retryable: false,
      };
      const failed = { ...attempt, status: "failed" as const, safeError };
      if (!(await safeUpdate(input.completionStore, failed))) {
        return denied("panel_completion_unavailable", 503, true);
      }
      return denied(safeError.code, 400, false);
    }

    let tenant: Awaited<ReturnType<TenantCorePort["createStarterTenant"]>>;
    try {
      tenant = await input.tenantCoreClient.createStarterTenant(
        structuredClone(attempt.tenantInputSnapshot),
      );
    } catch {
      return denied("tenant_transaction_failed", 503, true);
    }
    if (!tenant.ok || !validTenantResult(tenant.value)) {
      const safeError = tenant.ok
        ? { schemaVersion: 1 as const, code: "tenant_transaction_failed" as const, retryable: false }
        : tenant.error;
      if (safeError.retryable) return denied(safeError.code, 503, true);
      const failed = { ...attempt, status: "failed" as const, safeError };
      if (!(await safeUpdate(input.completionStore, failed))) {
        return denied("panel_completion_unavailable", 503, true);
      }
      return denied(safeError.code, 409, false);
    }

    attempt = {
      ...attempt,
      status: "tenant_created",
      tenantResult: structuredClone(tenant.value),
      tenantOperation: {
        operationId: tenant.value.operationId,
        principalId: tenant.value.membership.principalId,
        storeId: tenant.value.store.id,
        provisioningStatus: tenant.value.provisioningStatus,
      },
    };
    if (!(await safeUpdate(input.completionStore, attempt))) {
      return denied("panel_completion_unavailable", 503, true);
    }
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
  let attempt: StoredRegistrationAttempt | null;
  try {
    attempt = await input.completionStore.findById(input.attemptId, now);
  } catch {
    return denied("panel_completion_unavailable", 503, true);
  }
  if (!attempt?.verifiedPrincipal) {
    return denied("registration_recovery_denied", 403);
  }

  const authority = input.authority;
  if (authority?.kind === "verified_identity") {
    if (!verifiedIdentityMatches(attempt.verifiedPrincipal, authority.identity)) {
      return denied("registration_recovery_denied", 403);
    }
    if (attempt.status === "identity_verified") {
      if (!attempt.tenantInputSnapshot || !attempt.canonicalFingerprint) {
        return denied("registration_recovery_denied", 403);
      }
      return completePanelRegistration({
        ...input,
        attemptId: attempt.id,
        identity: authority.identity,
      });
    }
  } else if (authority?.kind === "authenticated_principal") {
    if (
      !attempt.tenantOperation ||
      authority.principal.id !== attempt.tenantOperation.principalId ||
      !identityMatches(attempt.verifiedPrincipal, authority.principal)
    ) {
      return denied("registration_recovery_denied", 403);
    }
  } else {
    return denied("registration_recovery_denied", 403);
  }

  if (
    (attempt.status !== "tenant_created" && attempt.status !== "session_created") ||
    !attempt.tenantOperation ||
    !attempt.tenantResult
  ) {
    return denied("registration_recovery_denied", 403);
  }
  return establishSession(attempt, input, now);
}

interface CallbackDependencies extends CompletionDependencies {
  enabled: boolean;
  oidc: {
    complete(callback: { state: string; code: string }): Promise<PanelVerifiedIdentity>;
  };
  cookiePolicy: PanelSessionCookiePolicy;
  callbackUrl?: string;
  serializeSessionCookie?: typeof buildPanelSessionSetCookie;
}

function callbackJson(code: string, status: number) {
  return Response.json({ code }, { status, headers: { "cache-control": "no-store" } });
}

export function createPanelOidcCallbackHandler(dependencies: CallbackDependencies) {
  return async function panelOidcCallback(request: Request) {
    if (!dependencies.enabled) return callbackJson("panel_auth_disabled", 503);
    const url = new URL(request.url);
    const callbackUrl = new URL(dependencies.callbackUrl ?? PANEL_OIDC_CALLBACK_URL);
    if (url.origin !== callbackUrl.origin || url.pathname !== callbackUrl.pathname) {
      return callbackJson("invalid_callback_url", 400);
    }
    const states = url.searchParams.getAll("state");
    const codes = url.searchParams.getAll("code");
    if (states.length !== 1 || codes.length !== 1) {
      return callbackJson("invalid_callback_state", 400);
    }
    const state = states[0].trim();
    const code = codes[0].trim();
    if (!state || !code) return callbackJson("invalid_callback_state", 400);

    let attempt: StoredRegistrationAttempt | null;
    try {
      attempt = await dependencies.completionStore.findByState(state, dependencies.now?.() ?? new Date());
    } catch {
      return callbackJson("panel_completion_unavailable", 503);
    }
    if (!attempt) {
      return callbackJson("invalid_callback_state", 400);
    }
    if (attempt.status !== "awaiting_identity") {
      return callbackJson("invalid_callback_state", 409);
    }

    let identity: PanelVerifiedIdentity;
    try {
      identity = await dependencies.oidc.complete({ state, code });
    } catch {
      return callbackJson("invalid_callback_state", 400);
    }
    let completed: CompletionResult;
    try {
      completed = await completePanelRegistration({ ...dependencies, attemptId: attempt.id, identity });
    } catch {
      return callbackJson("panel_completion_unavailable", 503);
    }
    if (!completed.ok) return callbackJson(completed.code, completed.status);

    let sessionCookie: string;
    try {
      sessionCookie = (dependencies.serializeSessionCookie ?? buildPanelSessionSetCookie)(
        completed.session.id,
        dependencies.cookiePolicy,
      );
    } catch {
      return callbackJson("panel_session_retry_required", 503);
    }

    return new Response(null, {
      status: 303,
      headers: {
        location: completed.redirectTo,
        "cache-control": "no-store",
        "set-cookie": sessionCookie,
      },
    });
  };
}

export function createDisabledPanelOidcCallbackHandler() {
  return async function disabledPanelOidcCallback() {
    return callbackJson("panel_auth_disabled", 503);
  };
}
