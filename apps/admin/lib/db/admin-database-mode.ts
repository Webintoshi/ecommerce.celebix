import "server-only";

import { STORE_RUNTIME } from "@/lib/store-runtime";

export type AdminDatabaseMode = "supabase" | "light_postgres";

export function resolveAdminDatabaseMode(
  value: string | undefined = process.env.ADMIN_DATABASE_MODE,
): AdminDatabaseMode {
  return value?.trim().toLowerCase() === "light_postgres"
    ? "light_postgres"
    : "supabase";
}

export function isDerycraftLightPostgresCandidateStore(
  storeSlug: string = STORE_RUNTIME.slug,
): boolean {
  return storeSlug === "derycraftcomtr";
}

export function shouldUseLightPostgresAdmin(): boolean {
  return (
    resolveAdminDatabaseMode() === "light_postgres" &&
    isDerycraftLightPostgresCandidateStore()
  );
}
