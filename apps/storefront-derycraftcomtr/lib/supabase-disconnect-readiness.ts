import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";

const DERYCRAFT_STORE_SLUG = "derycraftcomtr";
const DERYCRAFT_HOSTS = new Set(["derycraft.com.tr", "www.derycraft.com.tr"]);

export const DERYCRAFT_AUTH_MIGRATION_CODE = "customer_auth_unavailable";
export const DERYCRAFT_AUTH_MIGRATION_MESSAGE =
  "Musteri kimlik islemleri bu magaza icin guvenli giris ekraninda tamamlanir.";
export const DERYCRAFT_LOGTO_STABLE_CODE = "logto_stable";
export const DERYCRAFT_TEMPORARILY_DISABLED_CODE = "temporarily_disabled";
export const DERYCRAFT_REQUIRES_LIGHT_POSTGRES_SUPPORT_CODE = "requires_light_postgres_support";

function readEnv(keys: string[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeHost(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
}

function readHostFromUrl(value: string | null): string | null {
  const normalized = normalizeHost(value);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized.includes("://") ? normalized : `https://${normalized}`).hostname;
  } catch {
    return normalized;
  }
}

function resolveRuntimeHost(env: NodeJS.ProcessEnv = process.env): string | null {
  const configuredHost = readHostFromUrl(
    readEnv(["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_STORE_DOMAIN"], env),
  );

  if (configuredHost) {
    return configuredHost;
  }

  if (typeof window !== "undefined") {
    return normalizeHost(window.location.hostname);
  }

  return null;
}

function isDerycraftHost(env: NodeJS.ProcessEnv = process.env): boolean {
  const host = resolveRuntimeHost(env);
  return Boolean(host && DERYCRAFT_HOSTS.has(host));
}

export function resolveStorefrontRuntimeStoreSlug(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitSlug = readEnv(["STORE_SLUG", "NEXT_PUBLIC_STORE_SLUG"], env);
  if (explicitSlug) {
    return explicitSlug;
  }

  if (isDerycraftHost(env)) {
    return DERYCRAFT_STORE_SLUG;
  }

  return (
    "shared"
  );
}

export function resolveStorefrontRuntimeDatabaseMode(
  env: NodeJS.ProcessEnv = process.env,
): "light_postgres" | "full_supabase" {
  const explicitMode = readEnv(["DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"], env);
  if (explicitMode) {
    return explicitMode.toLowerCase() === "light_postgres"
      ? "light_postgres"
      : "full_supabase";
  }

  return resolveStorefrontRuntimeStoreSlug(env) === DERYCRAFT_STORE_SLUG
    ? "light_postgres"
    : "full_supabase";
}

export function isDerycraftLightPostgresRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    resolveStorefrontRuntimeDatabaseMode(env) === "light_postgres" &&
    resolveStorefrontRuntimeStoreSlug(env) === DERYCRAFT_STORE_SLUG
  );
}

export function isStorefrontCustomerAuthMigrationRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDerycraftLightPostgresRuntime(env) && !isLogtoCustomerAuthEnabled(env);
}

export function isStorefrontCouponValidationDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDerycraftLightPostgresRuntime(env);
}

export function isStorefrontProductReviewsDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDerycraftLightPostgresRuntime(env);
}

export function isStorefrontAbandonedCartDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDerycraftLightPostgresRuntime(env);
}

export function isStorefrontQuickOrderDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDerycraftLightPostgresRuntime(env);
}

export function isStorefrontAnalyticsWriteDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDerycraftLightPostgresRuntime(env);
}

export function isStorefrontPublicOrdersCustomersDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDerycraftLightPostgresRuntime(env);
}

export function getStorefrontSupabaseDisconnectRuntime() {
  const customerAuthStatus = isStorefrontCustomerAuthMigrationRequired()
    ? DERYCRAFT_AUTH_MIGRATION_CODE
    : isLogtoCustomerAuthEnabled()
      ? DERYCRAFT_LOGTO_STABLE_CODE
      : "configured";

  return {
    slug: resolveStorefrontRuntimeStoreSlug(),
    databaseMode: resolveStorefrontRuntimeDatabaseMode(),
    customerAuthStatus,
    reviewsStatus: isStorefrontProductReviewsDisabled()
      ? DERYCRAFT_TEMPORARILY_DISABLED_CODE
      : "configured",
    abandonedCartStatus: isStorefrontAbandonedCartDisabled()
      ? DERYCRAFT_TEMPORARILY_DISABLED_CODE
      : "configured",
    quickOrderStatus: isStorefrontQuickOrderDisabled()
      ? DERYCRAFT_TEMPORARILY_DISABLED_CODE
      : "configured",
    analyticsStatus: isStorefrontAnalyticsWriteDisabled()
      ? DERYCRAFT_TEMPORARILY_DISABLED_CODE
      : "configured",
    couponStatus: isStorefrontCouponValidationDisabled()
      ? DERYCRAFT_TEMPORARILY_DISABLED_CODE
      : "configured",
  } as const;
}
