import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient as createServiceSupabaseClient } from "@/lib/supabase";
import { getSupabaseAnonKey, getSupabaseServerUrl } from "@/lib/supabase-shared";

export async function createSessionServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseServerUrl(), getSupabaseAnonKey(), {
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
