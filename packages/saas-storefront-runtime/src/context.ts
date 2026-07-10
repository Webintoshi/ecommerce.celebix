import {
  SAAS_CONTRACT_SCHEMA_VERSION,
  type PlanEntitlements,
  type ResolvedStoreHost,
  type StoreId,
  type StoreStatus,
} from "@celebix/saas-contracts";

import { buildCanonicalStorefrontUrl } from "./canonical-url.ts";
import { StorefrontResolutionError } from "./errors.ts";
import { normalizeStoreHostname, type TrustedHostPolicy } from "./host.ts";
import type { StoreDomainResolver } from "./resolver.ts";

export interface StorefrontStoreRecord {
  id: StoreId;
  slug: string;
  status: StoreStatus;
  locale: string;
  currency: string;
  themeKey: string;
  entitlements: PlanEntitlements;
}

export interface StorefrontRequestContext {
  schemaVersion: typeof SAAS_CONTRACT_SCHEMA_VERSION;
  requestId: string;
  resolvedHost: ResolvedStoreHost & { status: "active" };
  store: {
    id: StoreId;
    slug: string;
    status: "active";
    locale: string;
    currency: string;
    themeKey: string;
  };
  entitlements: PlanEntitlements;
  canonicalOrigin: string;
  namespaceVersion: number;
}

export interface ResolveStorefrontRequestContextInput {
  requestId: string;
  trustedHost: string;
  resolver: StoreDomainResolver;
  loadStorefrontStore: (
    authoritativeStoreId: StoreId,
    resolvedHost: ResolvedStoreHost & { status: "active" },
  ) => StorefrontStoreRecord | null | Promise<StorefrontStoreRecord | null>;
  hostPolicy?: TrustedHostPolicy;
}

export async function resolveStorefrontRequestContext(
  input: ResolveStorefrontRequestContextInput,
): Promise<StorefrontRequestContext | StorefrontResolutionError> {
  let normalizedHostname: string;
  try {
    normalizedHostname = normalizeStoreHostname(input.trustedHost, input.hostPolicy).hostname;
  } catch {
    return new StorefrontResolutionError("invalid_input");
  }

  const resolution = await input.resolver.resolveExactHostname(normalizedHostname);
  if (resolution instanceof StorefrontResolutionError) {
    return resolution;
  }

  if (resolution.status !== "active") {
    return new StorefrontResolutionError(
      resolution.status === "pending_verification" ? "host_unverified" : "store_inactive",
    );
  }

  let resolvedHostname: string;
  let canonicalHostname: string;
  try {
    resolvedHostname = normalizeStoreHostname(resolution.hostname, input.hostPolicy).hostname;
    canonicalHostname = normalizeStoreHostname(resolution.canonicalHostname, input.hostPolicy).hostname;
  } catch {
    return new StorefrontResolutionError("invalid_input");
  }

  if (resolvedHostname !== resolution.hostname || canonicalHostname !== resolution.canonicalHostname) {
    return new StorefrontResolutionError("invalid_input");
  }

  if (resolvedHostname !== normalizedHostname) {
    return new StorefrontResolutionError("host_store_mismatch");
  }

  const activeHost = resolution as ResolvedStoreHost & { status: "active" };
  const store = await input.loadStorefrontStore(activeHost.storeId, activeHost);
  if (!store || store.status !== "active") {
    return new StorefrontResolutionError("store_inactive");
  }

  if (store.id !== activeHost.storeId) {
    return new StorefrontResolutionError("host_store_mismatch");
  }

  let canonicalOrigin: string;
  try {
    const canonicalUrl = buildCanonicalStorefrontUrl(activeHost, "/", input.hostPolicy);
    canonicalOrigin = new URL(canonicalUrl).origin;
  } catch {
    return new StorefrontResolutionError("invalid_input");
  }

  return {
    schemaVersion: SAAS_CONTRACT_SCHEMA_VERSION,
    requestId: input.requestId,
    resolvedHost: activeHost,
    store: {
      id: store.id,
      slug: store.slug,
      status: "active",
      locale: store.locale,
      currency: store.currency,
      themeKey: store.themeKey,
    },
    entitlements: store.entitlements,
    canonicalOrigin,
    namespaceVersion: activeHost.cacheVersion,
  };
}
