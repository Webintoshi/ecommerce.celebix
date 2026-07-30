import type { DatabaseMode, StoreAuthProvider } from "@celebix/platform-config";

export type StoreAdminAssignmentMode = "logto_light_postgres" | "supabase_legacy";

export function resolveStoreAdminAssignmentMode(store: {
  databaseMode: DatabaseMode;
  authProvider: StoreAuthProvider;
}): StoreAdminAssignmentMode {
  if (store.databaseMode === "light_postgres" && store.authProvider === "logto") {
    return "logto_light_postgres";
  }

  if (store.databaseMode === "full_supabase" && store.authProvider === "supabase") {
    return "supabase_legacy";
  }

  throw new Error(
    `Desteklenmeyen store admin mimarisi: ${store.databaseMode}/${store.authProvider}`,
  );
}
