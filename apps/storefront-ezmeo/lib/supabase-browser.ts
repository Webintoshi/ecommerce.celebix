import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase browser env değişkenleri eksik");
  }

  browserClient = createBrowserClient(url, anonKey, {
    cookieOptions: {
      name: "sb-jlrfjirbtcazhqqnrxfb-auth-token",
    },
  });

  return browserClient;
}
