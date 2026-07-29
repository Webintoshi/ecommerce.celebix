import type { ValidatedRegistrationDetails } from "./self-serve-identity";
import {
  OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS,
  parseOwnerStagingAuthConfig,
  resolveOwnerStagingAuthMode,
} from "./self-serve-auth-authority/config.ts";
const ATTEMPT_LIFETIME_MS = 10 * 60_000;

type RegistrationUiEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveSelfServeRegistrationUiEnabled(source: RegistrationUiEnvironment): boolean {
  try {
    if (!source || typeof source !== "object" || Array.isArray(source)) return false;
    if (resolveOwnerStagingAuthMode(source) !== "approved_staging") return false;
    const snapshot = Object.fromEntries(
      OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, source[name]]),
    ) as RegistrationUiEnvironment;
    parseOwnerStagingAuthConfig(snapshot);
    return true;
  } catch {
    return false;
  }
}

export interface SelfServeRegistrationStartInput {
  storeName: string;
  storeSlug: string;
  marketingConsent: boolean;
  privacyConsent: boolean;
}

export interface RegistrationAttempt {
  id: string;
  state: string;
  details: ValidatedRegistrationDetails;
  idempotencyKey: string;
  requestedAt: string;
  canonicalFingerprint?: string;
  status: "awaiting_identity" | "identity_verified" | "tenant_created" | "session_created" | "failed" | "expired" | "cancelled";
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
  cancel(state: string): Promise<void>;
}

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
  input: SelfServeRegistrationStartInput,
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

function randomServerOwnedValue(prefix: "attempt" | "ssik") {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Buffer.from(bytes).toString("base64url")}`;
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
  async save() { throw new Error("registration_attempt_store_disabled"); }
  async consume(): Promise<RegistrationAttempt> { throw new Error("registration_attempt_store_disabled"); }
}

export async function beginSelfServeRegistration(input: {
  enabled: boolean;
  registration: SelfServeRegistrationStartInput;
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
    try {
      await input.attemptStore.save({
        id: randomServerOwnedValue("attempt"),
        state: authorization.state,
        details: validated.details,
        idempotencyKey: randomServerOwnedValue("ssik"),
        requestedAt: now.toISOString(),
        status: "awaiting_identity",
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ATTEMPT_LIFETIME_MS).toISOString(),
      });
    } catch (error) {
      await input.oidc.cancel(authorization.state).catch(() => undefined);
      throw error;
    }
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
