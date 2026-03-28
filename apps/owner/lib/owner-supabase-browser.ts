"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOwnerSupabaseAnonKey, getOwnerSupabaseUrl } from "@/lib/owner-supabase-shared";

let cachedClient: SupabaseClient | null = null;

export function createOwnerBrowserClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createBrowserClient(getOwnerSupabaseUrl(), getOwnerSupabaseAnonKey());
  }

  return cachedClient;
}
