import type { CreateStarterTenantInput, SaaSContractError } from "@celebix/saas-contracts";
import type { OidcVerifiedIdentity } from "./self-serve-oidc";

const RESERVED_STARTER_SLUGS = new Set(["admin", "api", "auth", "celebix", "owner", "panel", "www"]);

function normalizeStarterSlug(input: string) {
  const turkishCharacters: Record<string, string> = {
    ç: "c",
    ğ: "g",
    ı: "i",
    İ: "i",
    ö: "o",
    ş: "s",
    ü: "u",
  };
  return input
    .trim()
    .split("")
    .map((character) => turkishCharacters[character] ?? character)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

function hasStarterSlugIssue(slug: string) {
  return (
    slug.length < 3 ||
    slug.length > 48 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    RESERVED_STARTER_SLUGS.has(slug)
  );
}

export interface ValidatedRegistrationDetails {
  storeName: string;
  storeSlug: string;
  locale: string;
  currency: string;
  themeKey: string;
  privacyAcceptedAt: string;
  marketingAcceptedAt?: string;
}

interface IdentityBoundaryDependencies {
  now?: () => Date;
  idempotencyKey?: string;
  onCanonicalFingerprint?: (canonicalFingerprint: string) => void;
}

export type IdentityBoundaryResult =
  | { ok: true; input: CreateStarterTenantInput }
  | { ok: false; error: SaaSContractError };

function safeError(code: SaaSContractError["code"], field?: string): IdentityBoundaryResult {
  return {
    ok: false,
    error: {
      schemaVersion: 1,
      code,
      retryable: false,
      ...(field ? { field } : {}),
    },
  };
}

function canonicalUtc(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function canonicalFingerprint(input: Omit<CreateStarterTenantInput, "idempotencyKey">) {
  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    principal: {
      issuer: input.principal.issuer,
      subject: input.principal.subject,
    },
    store: input.store,
    consents: input.consents,
    requestedAt: input.requestedAt,
  });
}

export async function buildCreateStarterTenantInput(
  identity: OidcVerifiedIdentity,
  details: ValidatedRegistrationDetails,
  dependencies: IdentityBoundaryDependencies = {},
): Promise<IdentityBoundaryResult> {
  if (!identity.emailVerified) {
    return safeError("identity_unverified");
  }
  if (!identity.issuer.trim() || !identity.subject.trim() || !identity.email.trim()) {
    return safeError("invalid_input", "principal");
  }

  const storeName = details.storeName.trim().replace(/\s+/g, " ");
  const storeSlug = normalizeStarterSlug(details.storeSlug);
  if (!storeName) return safeError("invalid_input", "store.name");
  if (hasStarterSlugIssue(storeSlug)) return safeError("invalid_input", "store.slug");

  const privacyAcceptedAt = canonicalUtc(details.privacyAcceptedAt);
  if (!privacyAcceptedAt) return safeError("invalid_input", "consents.privacyAcceptedAt");
  const marketingAcceptedAt = details.marketingAcceptedAt
    ? canonicalUtc(details.marketingAcceptedAt)
    : null;
  if (details.marketingAcceptedAt && !marketingAcceptedAt) {
    return safeError("invalid_input", "consents.marketingAcceptedAt");
  }

  const requestedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const withoutKey: Omit<CreateStarterTenantInput, "idempotencyKey"> = {
    schemaVersion: 1,
    principal: {
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email.trim().toLowerCase(),
      emailVerified: true,
    },
    store: {
      name: storeName,
      slug: storeSlug,
      locale: details.locale.trim() || "tr",
      currency: details.currency.trim().toUpperCase() || "TRY",
      themeKey: details.themeKey.trim() || "starter",
    },
    consents: {
      privacyAcceptedAt,
      ...(marketingAcceptedAt ? { marketingAcceptedAt } : {}),
    },
    requestedAt,
  };
  const fingerprint = canonicalFingerprint(withoutKey);
  dependencies.onCanonicalFingerprint?.(fingerprint);
  const idempotencyKey = dependencies.idempotencyKey ?? "";

  if (!/^[A-Za-z0-9_-]{16,200}$/.test(idempotencyKey)) {
    return safeError("invalid_input", "idempotencyKey");
  }

  return {
    ok: true,
    input: {
      ...withoutKey,
      idempotencyKey,
    },
  };
}
