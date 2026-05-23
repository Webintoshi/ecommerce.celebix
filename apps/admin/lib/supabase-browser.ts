"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOptionalSupabaseAnonKey,
  getOptionalSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "@/lib/supabase-shared";

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabaseClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
  return browserClient;
}

export function getOptionalBrowserSupabaseClient(): SupabaseClient | null {
  if (browserClient) {
    return browserClient;
  }

  const url = getOptionalSupabaseUrl();
  const anonKey = getOptionalSupabaseAnonKey();

  if (!url || !anonKey) {
    return null;
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
