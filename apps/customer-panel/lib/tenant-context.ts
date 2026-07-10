import {
  isPlanFeatureEnabled,
  type PlanEntitlements,
  type ResolvedStoreHost,
  type SaaSContractError,
  type StoreMembership,
  type StoreStatus,
  type TenantContext,
} from "@celebix/saas-contracts";

export interface AuthenticatedPrincipal {
  id: string;
  issuer: string;
  subject: string;
}

export interface PanelStoreRecord {
  id: string;
  slug: string;
  status: StoreStatus;
  locale: string;
}

type TenantContextBuildResult =
  | { ok: true; context: TenantContext }
  | { ok: false; error: SaaSContractError };

function denied(code: SaaSContractError["code"]): TenantContextBuildResult {
  return { ok: false, error: { schemaVersion: 1, code, retryable: false } };
}

export function buildTenantContext(input: {
  requestId: string;
  principal: AuthenticatedPrincipal;
  membership: StoreMembership;
  membershipAuthority: { issuer: string; subject: string };
  store: PanelStoreRecord;
  entitlements: PlanEntitlements;
  resolvedHost?: ResolvedStoreHost;
}): TenantContextBuildResult {
  if (
    input.membership.principalId !== input.principal.id ||
    input.membershipAuthority.issuer !== input.principal.issuer ||
    input.membershipAuthority.subject !== input.principal.subject
  ) {
    return denied("membership_denied");
  }
  if (input.membership.status !== "active") return denied("membership_denied");
  if (input.store.status !== "active") return denied("store_inactive");
  if (input.membership.storeId !== input.store.id) return denied("membership_denied");

  if (input.resolvedHost) {
    if (input.resolvedHost.storeId !== input.store.id) return denied("host_store_mismatch");
    if (input.resolvedHost.storeSlug !== input.store.slug) return denied("host_store_mismatch");
    if (input.resolvedHost.status !== "active") return denied("host_unverified");
  }

  return {
    ok: true,
    context: {
      schemaVersion: 1,
      requestId: input.requestId,
      principal: {
        id: input.principal.id,
        issuer: input.principal.issuer,
        subject: input.principal.subject,
      },
      store: {
        id: input.store.id,
        slug: input.store.slug,
        status: "active",
      },
      membership: {
        id: input.membership.id,
        role: input.membership.role,
        status: "active",
      },
      entitlements: structuredClone(input.entitlements),
      ...(input.resolvedHost
        ? { resolvedHost: structuredClone(input.resolvedHost) as ResolvedStoreHost & { status: "active" } }
        : {}),
      locale: input.store.locale,
    },
  };
}

export function canUseTenantFeature(context: TenantContext, feature: string) {
  return isPlanFeatureEnabled(context.entitlements, feature);
}
