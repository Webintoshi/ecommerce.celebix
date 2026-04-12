"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOwnerSupabaseAnonKey, getOwnerSupabaseUrl } from "@/lib/owner-supabase-shared";

let cachedClient: SupabaseClient | null = null;

function expireCookie(name: string, domain?: string) {
  if (typeof document === "undefined") {
    return;
  }

  const cookieParts = [`${name}=`, "expires=Thu, 01 Jan 1970 00:00:00 GMT", "path=/"];

  if (domain) {
    cookieParts.push(`domain=${domain}`);
  }

  document.cookie = cookieParts.join("; ");
}

export function clearOwnerBrowserAuthArtifacts() {
  cachedClient = null;

  if (typeof window === "undefined") {
    return;
  }

  const keysToDelete = new Set<string>();
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
        keysToDelete.add(key);
      }
    }

    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);

      if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
        keysToDelete.add(key);
      }
    }

    for (const key of keysToDelete) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage-access failures. Login recovery should continue with cookie cleanup.
  }

  try {
    const visibleCookies = document.cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split("=")[0]?.trim())
      .filter((name): name is string => Boolean(name));
    const host = window.location.hostname;
    const parentDomain =
      host.split(".").length > 2 ? `.${host.split(".").slice(-2).join(".")}` : undefined;

    for (const name of visibleCookies) {
      if (!name.startsWith("sb-") && !name.includes("supabase")) {
        continue;
      }

      expireCookie(name);
      expireCookie(name, host);

      if (parentDomain) {
        expireCookie(name, parentDomain);
      }
    }
  } catch {
    // Ignore cookie-access failures. Server-side cleanup remains active.
  }
}

export function createOwnerBrowserClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createBrowserClient(getOwnerSupabaseUrl(), getOwnerSupabaseAnonKey());
  }

  return cachedClient;
}
