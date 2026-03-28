import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getOwnerSupabaseAnonKey,
  getOwnerSupabaseServiceRoleKey,
  getOwnerSupabaseUrl
} from "@/lib/owner-supabase-shared";

export async function createOwnerServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(getOwnerSupabaseUrl(), getOwnerSupabaseAnonKey(), {
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
          // Server Components cannot always mutate cookies. Route handlers can.
        }
      }
    }
  });
}

export function createOwnerServiceClient(): SupabaseClient {
  return createClient(getOwnerSupabaseUrl(), getOwnerSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
