import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLightPostgresRuntime } from "@celebix/platform-config/src/light-postgres-runtime";
import { createServerClient as createServiceSupabaseClient } from "@/lib/supabase";
import { getSupabaseAnonKey, getSupabaseCookieOptions, getSupabaseServerUrl } from "@/lib/supabase-shared";

type LightPostgresCompatModule = {
  createLightPostgresCompatClient: (options: {
    env: NodeJS.ProcessEnv;
    mode: "light_postgres";
  }) => unknown;
};

function getRuntimeRequire(): (id: string) => unknown {
  const moduleBuiltin = (
    process as NodeJS.Process & {
      getBuiltinModule?: (name: string) => unknown;
    }
  ).getBuiltinModule?.("module") as
    | { createRequire?: (specifier: string) => (id: string) => unknown }
    | undefined;
  const createRequire = moduleBuiltin?.createRequire;

  if (!createRequire) {
    throw new Error("Node createRequire runtime bu ortamda kullanilamiyor.");
  }

  return createRequire(import.meta.url);
}

function createLightPostgresSessionClient(): SupabaseClient {
  const compatModule = getRuntimeRequire()(
    "@celebix/platform-config/src/light-postgres-compat.cjs",
  ) as LightPostgresCompatModule;

  return compatModule.createLightPostgresCompatClient({
    env: process.env,
    mode: "light_postgres",
  }) as SupabaseClient;
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
