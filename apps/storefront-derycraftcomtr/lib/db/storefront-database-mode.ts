import "server-only";

export type StorefrontDatabaseMode = "supabase" | "light_postgres";

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

export function resolveStorefrontDatabaseMode(
  value: string | undefined = process.env.DATABASE_MODE,
): StorefrontDatabaseMode {
  return value?.trim().toLowerCase() === "light_postgres"
    ? "light_postgres"
    : "supabase";
}

export function resolveStorefrontStoreSlug(): string {
  return (
    readEnv("STORE_SLUG") ??
    readEnv("NEXT_PUBLIC_STORE_SLUG") ??
    "shared"
  );
}

export function isDerycraftLightPostgresCandidateStore(
  storeSlug: string = resolveStorefrontStoreSlug(),
): boolean {
  return storeSlug === "derycraftcomtr";
}

export function shouldUseLightPostgresStorefront(): boolean {
  return (
    resolveStorefrontDatabaseMode() === "light_postgres" &&
    isDerycraftLightPostgresCandidateStore()
  );
}
