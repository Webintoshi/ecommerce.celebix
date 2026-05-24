import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createLightPostgresCompatClient } from "../../../packages/platform-config/src/light-postgres-compat";

export function createAdminLightPostgresCompatClient(): SupabaseClient {
  return createLightPostgresCompatClient({
    env: process.env,
    mode: "light_postgres",
  }) as unknown as SupabaseClient;
}
