"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-shared";

let browserClient: SupabaseClient | null = null;

export function getOptionalBrowserSupabaseClient(): SupabaseClient | null {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  browserClient = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
  return browserClient;
}

export function getBrowserSupabaseClient(): SupabaseClient {
  const client = getOptionalBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase browser auth is not configured");
  }

  return client;
}
