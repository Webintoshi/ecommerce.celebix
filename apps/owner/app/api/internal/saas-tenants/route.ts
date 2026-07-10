import type { CreateStarterTenantInput, SaaSErrorCode } from "@celebix/saas-contracts";

import {
  createUnavailableOwnerTenantCoreAdapter,
  type OwnerTenantCoreAdapter,
  type OwnerTenantCoreOutcome,
} from "../../../../lib/saas-tenant-core/adapter";

interface InternalSaaSTenantsRouteOptions {
  enabled: boolean;
  isTrustedRequest(request: Request): Promise<boolean>;
  adapter: OwnerTenantCoreAdapter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  const keys = Object.keys(record);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCreateStarterTenantInput(value: unknown): value is CreateStarterTenantInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schemaVersion", "idempotencyKey", "principal", "store", "consents", "requestedAt"]) ||
    value.schemaVersion !== 1 ||
    !isNonEmptyString(value.idempotencyKey) ||
    !isNonEmptyString(value.requestedAt)
  ) {
    return false;
  }

  const principal = value.principal;
  const store = value.store;
  const consents = value.consents;

  return (
    isRecord(principal) &&
    hasExactKeys(principal, ["issuer", "subject", "email", "emailVerified"]) &&
    isNonEmptyString(principal.issuer) &&
    isNonEmptyString(principal.subject) &&
    isNonEmptyString(principal.email) &&
    principal.emailVerified === true &&
    isRecord(store) &&
    hasExactKeys(store, ["name", "slug", "locale", "currency", "themeKey"]) &&
    isNonEmptyString(store.name) &&
    isNonEmptyString(store.slug) &&
    isNonEmptyString(store.locale) &&
    isNonEmptyString(store.currency) &&
    isNonEmptyString(store.themeKey) &&
    isRecord(consents) &&
    hasExactKeys(consents, ["privacyAcceptedAt"], ["marketingAcceptedAt"]) &&
    isNonEmptyString(consents.privacyAcceptedAt) &&
    (consents.marketingAcceptedAt === undefined || isNonEmptyString(consents.marketingAcceptedAt))
  );
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function errorResponse(status: number, code: "service_unavailable" | SaaSErrorCode, retryable = false) {
  return json(status, {
    ok: false,
    error: { schemaVersion: 1, code, retryable },
  });
}

function statusForOutcome(outcome: OwnerTenantCoreOutcome): number {
  if (outcome.ok) {
    return 201;
  }
  if (outcome.error.code === "service_unavailable") {
    return 503;
  }
  if (["slug_taken", "domain_conflict", "membership_conflict", "idempotency_mismatch"].includes(outcome.error.code)) {
    return 409;
  }
  if (["invalid_input", "identity_unverified"].includes(outcome.error.code)) {
    return 400;
  }
  return 500;
}

export function createInternalSaaSTenantsPostHandler(options: InternalSaaSTenantsRouteOptions) {
  return async function internalSaaSTenantsPost(request: Request): Promise<Response> {
    if (!options.enabled) {
      return errorResponse(503, "service_unavailable", true);
    }

    let trusted: boolean;
    try {
      trusted = await options.isTrustedRequest(request);
    } catch {
      return errorResponse(503, "service_unavailable", true);
    }

    if (!trusted) {
      return errorResponse(401, "unauthenticated");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "invalid_input");
    }

    if (!isCreateStarterTenantInput(body)) {
      return errorResponse(400, "invalid_input");
    }

    let outcome: OwnerTenantCoreOutcome;
    try {
      outcome = await options.adapter.createStarterTenant(body);
    } catch {
      return errorResponse(500, "tenant_transaction_failed", true);
    }
    return json(statusForOutcome(outcome), outcome);
  };
}

// A production trust verifier and data adapter require a separate security gate.
// The exported route cannot be enabled by environment configuration in this phase.
export const POST = createInternalSaaSTenantsPostHandler({
  enabled: false,
  isTrustedRequest: async () => false,
  adapter: createUnavailableOwnerTenantCoreAdapter(),
});
