import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLightPostgresRuntime } from "@celebix/platform-config/src/light-postgres-runtime";
import { createServerClient as createServiceSupabaseClient } from "@/lib/supabase";
import { getSupabaseAnonKey, getSupabaseCookieOptions, getSupabaseServerUrl } from "@/lib/supabase-shared";

type LightPostgresCompatModule = {
  createAdminLightPostgresCompatClient: () => unknown;
};

function createRuntimeRequire(): (id: string) => unknown {
  const getBuiltinModule = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => { createRequire?: (filename: string) => (id: string) => unknown };
    }
  ).getBuiltinModule;

  const moduleLoader = getBuiltinModule?.("module");
  if (moduleLoader?.createRequire) {
    return moduleLoader.createRequire(import.meta.url);
  }

  const legacyRequire = (0, eval)("require");
  if (typeof legacyRequire === "function") {
    return legacyRequire as (id: string) => unknown;
  }

  throw new Error("Light Postgres compat loader is unavailable");
}

function createLightPostgresSessionClient(): SupabaseClient {
  const runtimeRequire = createRuntimeRequire();
  const compatModule = runtimeRequire("./light-postgres-compat-runtime.cjs") as LightPostgresCompatModule;

  return compatModule.createAdminLightPostgresCompatClient() as SupabaseClient;
}

export async function createSessionServerClient(): Promise<SupabaseClient> {
  if (isLightPostgresRuntime(process.env, {
    mode: ["ADMIN_DATABASE_MODE", "DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
  })) {
    return createLightPostgresSessionClient();
  }

  const cookieStore = await cookies();

  return createServerClient(getSupabaseServerUrl(), getSupabaseAnonKey(), {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Server Components may not always be able to mutate cookies.
        }
      },
    },
  });
}

export { createServiceSupabaseClient };
