import "server-only";

import { createClient } from "@supabase/supabase-js";

type LegacyAuthConfig = {
  anonKey: string;
  url: string;
};

function getLegacySupabaseUrl(): string | null {
  const value = process.env.SUPABASE_LEGACY_URL?.trim();
  return value || null;
}

function getLegacySupabaseAnonKey(): string | null {
  const value = process.env.SUPABASE_LEGACY_ANON_KEY?.trim();
  return value || null;
}

function getLegacyAdminAuthConfig(): LegacyAuthConfig | null {
  const url = getLegacySupabaseUrl();
  const anonKey = getLegacySupabaseAnonKey();

  if (!url || !anonKey) {
    return null;
  }

  return {
    url,
    anonKey,
  };
}

export async function verifyLegacyAdminPassword(email: string, password: string): Promise<boolean> {
  const config = getLegacyAdminAuthConfig();

  if (!config) {
    return false;
  }

  const legacyClient = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await legacyClient.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  return Boolean(!error && data.session);
}
