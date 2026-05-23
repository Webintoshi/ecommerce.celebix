import "server-only";

export type AdminDatabaseMode = "supabase" | "light_postgres";

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

export function resolveAdminDatabaseMode(
  value: string | undefined = process.env.ADMIN_DATABASE_MODE ?? process.env.DATABASE_MODE,
): AdminDatabaseMode {
  return value?.trim().toLowerCase() === "light_postgres"
    ? "light_postgres"
    : "supabase";
}

export function resolveAdminStoreSlug(): string {
  return (
    readEnv("STORE_SLUG") ??
    readEnv("NEXT_PUBLIC_STORE_SLUG") ??
    "shared"
  );
}

export function shouldUseLightPostgresAdmin(
  storeSlug: string = resolveAdminStoreSlug(),
): boolean {
  return (
    resolveAdminDatabaseMode() === "light_postgres" &&
    storeSlug === "derycraftcomtr"
  );
}
