const DERYCRAFT_STORE_SLUG = "derycraftcomtr";

export const DERYCRAFT_AUTH_MIGRATION_CODE = "requires_auth_migration";
export const DERYCRAFT_AUTH_MIGRATION_MESSAGE =
  "Musteri hesabi girisi bu light_postgres gecis provasinda gecici olarak pasif. Misafir odeme kullanilabilir.";
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

export function resolveStorefrontRuntimeStoreSlug(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    readEnv(["STORE_SLUG", "NEXT_PUBLIC_STORE_SLUG"], env) ||
    "shared"
  );
}

export function resolveStorefrontRuntimeDatabaseMode(
  env: NodeJS.ProcessEnv = process.env,
): "light_postgres" | "full_supabase" {
  return readEnv(["DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"], env)?.toLowerCase() ===
    "light_postgres"
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
  return isDerycraftLightPostgresRuntime(env);
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
