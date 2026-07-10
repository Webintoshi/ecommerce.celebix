import type {
  CreateStarterTenantInput,
  CreateStarterTenantResult,
  SaaSContractError,
  StoreMembership,
} from "@celebix/saas-contracts";
import type { IdentityBoundaryResult, ValidatedRegistrationDetails } from "./self-serve-identity";
import type { OidcVerifiedIdentity } from "./self-serve-oidc";
import type { SelfServeRegistrationInput } from "./self-serve-registration";
import type { TenantCoreClient } from "./self-serve-tenant-core-client";

const ATTEMPT_LIFETIME_MS = 10 * 60_000;
const PANEL_SESSION_LIFETIME_MS = 8 * 60 * 60_000;
const PANEL_ORIGIN = "https://panel.celebix.site";

export const SELF_SERVE_SAAS_REGISTRATION_ENABLED = false;

export type RegistrationFlowState =
  | "disabled"
  | "awaiting_identity"
  | "creating_tenant"
  | "provisioning"
  | "ready"
  | "failed";

export interface RegistrationAttempt {
  state: string;
  details: ValidatedRegistrationDetails;
  createdAt: string;
  expiresAt: string;
}

export interface RegistrationAttemptStore {
  save(attempt: RegistrationAttempt): Promise<void>;
  consume(state: string, now?: Date): Promise<RegistrationAttempt>;
}

export interface RegistrationOidcPort {
  begin(input: { returnTo: string }): Promise<{
    state: string;
    authorizationUrl: string;
    expiresAt: string;
  }>;
  complete(input: { code: string; state: string }): Promise<OidcVerifiedIdentity>;
}

export interface ActiveStoreSelection {
  storeId: string;
  membershipId: string;
  selectedAt: string;
}

export interface PanelSession {
  id: string;
  principal: {
    id: string;
    issuer: string;
    subject: string;
  };
  memberships: readonly StoreMembership[];
  activeStore: ActiveStoreSelection;
  createdAt: string;
  rotatedAt: string;
  expiresAt: string;
}

export interface PanelSessionStore {
  create(session: PanelSession): Promise<void>;
}

export type TenantInputBuilder = (
  identity: OidcVerifiedIdentity,
  details: ValidatedRegistrationDetails,
) => Promise<IdentityBoundaryResult>;

type BeginRegistrationResult =
  | {
      ok: true;
      state: "awaiting_identity";
      authorizationUrl: string;
      expiresAt: string;
    }
  | {
      ok: false;
      state: "disabled" | "failed";
      code: string;
      status: number;
      errors?: readonly string[];
    };

type CompleteRegistrationResult =
  | {
      ok: true;
      state: "provisioning" | "ready";
      redirectTo: string;
      operationId: string;
    }
  | {
      ok: false;
      state: "failed";
      status: number;
      error: SaaSContractError;
    };

function normalizeSlug(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİI]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

function validateAndSanitizeRegistration(
  input: SelfServeRegistrationInput,
  now: Date,
): { ok: true; details: ValidatedRegistrationDetails } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const storeName = input.storeName?.trim().replace(/\s+/g, " ") ?? "";
  const storeSlug = normalizeSlug(input.storeSlug ?? "");

  if (!storeName) errors.push("Mağaza adı gerekli.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug) || storeSlug.length < 3) {
    errors.push("Geçerli bir mağaza adresi gerekli.");
  }
  if (!input.privacyConsent) errors.push("KVKK ve gizlilik onayı gerekli.");

  if (errors.length > 0) return { ok: false, errors };

  const acceptedAt = now.toISOString();
  return {
    ok: true,
    details: {
      storeName,
      storeSlug,
      locale: "tr",
      currency: "TRY",
      themeKey: "starter",
      privacyAcceptedAt: acceptedAt,
      ...(input.marketingConsent ? { marketingAcceptedAt: acceptedAt } : {}),
    },
  };
}

export class InMemoryRegistrationAttemptStore implements RegistrationAttemptStore {
  private readonly attempts = new Map<string, RegistrationAttempt>();
  private readonly consumed = new Set<string>();

  async save(attempt: RegistrationAttempt) {
    if (this.attempts.has(attempt.state) || this.consumed.has(attempt.state)) {
      throw new Error("registration_attempt_conflict");
    }
    this.attempts.set(attempt.state, structuredClone(attempt));
  }

  async consume(state: string, now = new Date()) {
    if (this.consumed.has(state)) throw new Error("registration_attempt_replayed");
    const attempt = this.attempts.get(state);
    if (!attempt) throw new Error("registration_attempt_missing");
    this.attempts.delete(state);
    this.consumed.add(state);
    if (Date.parse(attempt.expiresAt) <= now.getTime()) throw new Error("registration_attempt_expired");
    return structuredClone(attempt);
  }
}

export class DisabledRegistrationAttemptStore implements RegistrationAttemptStore {
  async save() {
    throw new Error("registration_attempt_store_disabled");
  }

  async consume(): Promise<RegistrationAttempt> {
    throw new Error("registration_attempt_store_disabled");
  }
}

export class DisabledPanelSessionStore implements PanelSessionStore {
  async create() {
    throw new Error("panel_session_store_disabled");
  }
}

export async function beginSelfServeRegistration(input: {
  enabled: boolean;
  registration: SelfServeRegistrationInput;
  oidc: RegistrationOidcPort;
  attemptStore: RegistrationAttemptStore;
  now?: () => Date;
}): Promise<BeginRegistrationResult> {
  if (!input.enabled) {
    return {
      ok: false,
      state: "disabled",
      code: "self_serve_saas_registration_disabled",
      status: 503,
    };
  }

  const now = input.now?.() ?? new Date();
  const validated = validateAndSanitizeRegistration(input.registration, now);
  if (!validated.ok) {
    return {
      ok: false,
      state: "failed",
      code: "self_serve_registration_rejected",
      status: 400,
      errors: validated.errors,
    };
  }

  try {
    const authorization = await input.oidc.begin({ returnTo: "/kayit" });
    await input.attemptStore.save({
      state: authorization.state,
      details: validated.details,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ATTEMPT_LIFETIME_MS).toISOString(),
    });
    return {
      ok: true,
      state: "awaiting_identity",
      authorizationUrl: authorization.authorizationUrl,
      expiresAt: authorization.expiresAt,
    };
  } catch {
    return {
      ok: false,
      state: "failed",
      code: "self_serve_identity_start_failed",
      status: 503,
    };
  }
}

function orchestrationError(error: SaaSContractError, status = 403): CompleteRegistrationResult {
  return { ok: false, state: "failed", status, error };
}

function randomSessionId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function buildPanelSession(
  identity: OidcVerifiedIdentity,
  result: CreateStarterTenantResult,
  now: Date,
): PanelSession {
  return {
    id: randomSessionId(),
    principal: {
      id: result.membership.principalId,
      issuer: identity.issuer,
      subject: identity.subject,
    },
    memberships: [structuredClone(result.membership)],
    activeStore: {
      storeId: result.store.id,
      membershipId: result.membership.id,
      selectedAt: now.toISOString(),
    },
    createdAt: now.toISOString(),
    rotatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PANEL_SESSION_LIFETIME_MS).toISOString(),
  };
}

export async function completeSelfServeRegistration(input: {
  callback: { code: string; state: string };
  oidc: RegistrationOidcPort;
  attemptStore: RegistrationAttemptStore;
  buildTenantInput: TenantInputBuilder;
  tenantCoreClient: TenantCoreClient;
  panelSessionStore: PanelSessionStore;
  now?: () => Date;
}): Promise<CompleteRegistrationResult> {
  const now = input.now?.() ?? new Date();

  try {
    const identity = await input.oidc.complete(input.callback);
    const attempt = await input.attemptStore.consume(input.callback.state, now);

    if (!identity.emailVerified) {
      return orchestrationError({ schemaVersion: 1, code: "identity_unverified", retryable: false });
    }

    const tenantInput = await input.buildTenantInput(identity, attempt.details);
    if (!tenantInput.ok) return orchestrationError(tenantInput.error, 400);

    const tenant = await input.tenantCoreClient.createStarterTenant(tenantInput.input);
    if (!tenant.ok) return orchestrationError(tenant.error, tenant.error.retryable ? 503 : 409);
    if (tenant.value.provisioningStatus === "failed") {
      return orchestrationError({
        schemaVersion: 1,
        code: "tenant_transaction_failed",
        retryable: false,
        operationId: tenant.value.operationId,
      }, 409);
    }
    if (
      tenant.value.membership.status !== "active" ||
      tenant.value.membership.storeId !== tenant.value.store.id
    ) {
      return orchestrationError({ schemaVersion: 1, code: "membership_denied", retryable: false });
    }

    await input.panelSessionStore.create(buildPanelSession(identity, tenant.value, now));
    const provisioning = tenant.value.provisioningStatus !== "ready";
    return {
      ok: true,
      state: provisioning ? "provisioning" : "ready",
      redirectTo: provisioning ? `${PANEL_ORIGIN}/setup` : `${PANEL_ORIGIN}/`,
      operationId: tenant.value.operationId,
    };
  } catch {
    return orchestrationError({
      schemaVersion: 1,
      code: "tenant_transaction_failed",
      retryable: false,
      safeMessage: "Kayıt işlemi güvenli şekilde tamamlanamadı.",
    }, 503);
  }
}
