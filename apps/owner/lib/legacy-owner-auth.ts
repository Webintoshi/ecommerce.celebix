import "server-only";

import { createClient } from "@supabase/supabase-js";

type LegacyApiKey = {
  id?: string;
  name?: string;
  api_key?: string;
};

type LegacyAuthConfig = {
  anonKey: string;
  url: string;
};

type LegacyAuthConfigCache = {
  config: LegacyAuthConfig | null;
  expiresAt: number;
};

const SUPABASE_MANAGEMENT_API_URL = "https://api.supabase.com/v1";
const LEGACY_CONFIG_TTL_MS = 10 * 60 * 1000;

let legacyConfigCache: LegacyAuthConfigCache = {
  config: null,
  expiresAt: 0,
};

function getLegacyProjectRef(): string | null {
  const value = process.env.OWNER_SUPABASE_LEGACY_PROJECT_REF?.trim();
  return value || null;
}

function getSupabaseManagementToken(): string | null {
  const value = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  return value || null;
}

async function fetchLegacyAnonKey(projectRef: string, accessToken: string): Promise<string | null> {
  const response = await fetch(`${SUPABASE_MANAGEMENT_API_URL}/projects/${projectRef}/api-keys`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const keys = (await response.json()) as LegacyApiKey[];
  const anonKey =
    keys.find((entry) => entry.name === "anon")?.api_key ||
    keys.find((entry) => entry.id === "anon")?.api_key ||
    null;

  return anonKey?.trim() || null;
}

export async function getLegacyOwnerAuthConfig(): Promise<LegacyAuthConfig | null> {
  if (legacyConfigCache.config && legacyConfigCache.expiresAt > Date.now()) {
    return legacyConfigCache.config;
  }

  const projectRef = getLegacyProjectRef();
  const accessToken = getSupabaseManagementToken();

  if (!projectRef || !accessToken) {
    legacyConfigCache = {
      config: null,
      expiresAt: Date.now() + LEGACY_CONFIG_TTL_MS,
    };
    return null;
  }

  const anonKey = await fetchLegacyAnonKey(projectRef, accessToken);

  if (!anonKey) {
    legacyConfigCache = {
      config: null,
      expiresAt: Date.now() + LEGACY_CONFIG_TTL_MS,
    };
    return null;
  }

  const config: LegacyAuthConfig = {
    anonKey,
    url: `https://${projectRef}.supabase.co`,
  };

  legacyConfigCache = {
    config,
    expiresAt: Date.now() + LEGACY_CONFIG_TTL_MS,
  };

  return config;
}

export async function verifyLegacyOwnerPassword(email: string, password: string): Promise<boolean> {
  const config = await getLegacyOwnerAuthConfig();

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
