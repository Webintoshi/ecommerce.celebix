import {
  isLightPostgresRuntime,
  resolveRuntimeAuthSetupStatus,
} from "@celebix/platform-config/src/light-postgres-runtime";

const ADMIN_RUNTIME_MODE_KEYS = [
  "ADMIN_DATABASE_MODE",
  "DATABASE_MODE",
  "NEXT_PUBLIC_RUNTIME_DATABASE_MODE",
] as const;

const ADMIN_RUNTIME_AUTH_STATUS_KEYS = [
  "AUTH_SETUP_STATUS",
  "NEXT_PUBLIC_AUTH_SETUP_STATUS",
] as const;

function requireEnvValue(name: string, value: string | undefined): string {
  const normalized = value?.trim().replace(/^["']|["']$/g, "");

  if (!normalized) {
    throw new Error(`${name} is not configured`);
  }

  return normalized;
}

function normalizeUrl(name: string, value: string): string {
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(normalized).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} is malformed`);
  }
}

function shouldPreferPublicSupabaseUrl(serverUrl: string, publicUrl: string): boolean {
  try {
    const server = new URL(serverUrl);
    const publicRuntime = new URL(publicUrl);

    return (
      server.protocol === "http:" &&
      publicRuntime.protocol === "https:" &&
      server.hostname === publicRuntime.hostname
    );
  } catch {
    return false;
  }
}

function readNormalizedUrl(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^["']|["']$/g, "");

  if (!normalized) {
    return null;
  }

  try {
    return normalizeUrl("SUPABASE_URL", normalized);
  } catch {
    return null;
  }
}

export function isLightPostgresAuthBlockedRuntime(): boolean {
  return (
    isLightPostgresRuntime(process.env, {
      mode: [...ADMIN_RUNTIME_MODE_KEYS],
    }) &&
    resolveRuntimeAuthSetupStatus(process.env, {
      mode: [...ADMIN_RUNTIME_MODE_KEYS],
      authStatus: [...ADMIN_RUNTIME_AUTH_STATUS_KEYS],
    }) === "blocked_auth_setup"
  );
}

export function getOptionalSupabaseUrl(): string | null {
  return readNormalizedUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabaseUrl(): string {
  const value = getOptionalSupabaseUrl();

  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  return value;
}

export function getOptionalSupabaseAuthStorageKey(): string | null {
  const supabaseUrl = getOptionalSupabaseUrl();

  if (!supabaseUrl) {
    return null;
  }

  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

export function getSupabaseAuthStorageKey(): string {
  const cookieName = getOptionalSupabaseAuthStorageKey();

  if (!cookieName) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  return cookieName;
}

export function getSupabaseCookieOptions() {
  return {
    name: getSupabaseAuthStorageKey(),
    path: "/",
    sameSite: "lax" as const,
    httpOnly: false,
    secure: getSupabaseUrl().startsWith("https://"),
    maxAge: 400 * 24 * 60 * 60,
  };
}

export function getOptionalSupabaseServerUrl(): string | null {
  const publicUrl = getOptionalSupabaseUrl();
  const rawServerUrl =
    process.env.SUPABASE_SERVER_URL ??
    process.env.SUPABASE_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const normalizedServerUrl = readNormalizedUrl(rawServerUrl);

  if (!normalizedServerUrl) {
    return publicUrl;
  }

  if (!publicUrl) {
    return normalizedServerUrl;
  }

  return shouldPreferPublicSupabaseUrl(normalizedServerUrl, publicUrl)
    ? publicUrl
    : normalizedServerUrl;
}

export function getSupabaseServerUrl(): string {
  const value = getOptionalSupabaseServerUrl();

  if (!value) {
    throw new Error("SUPABASE_SERVER_URL is not configured");
  }

  return value;
}

export function getOptionalSupabaseAnonKey(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return value || null;
}

export function getSupabaseAnonKey(): string {
  const value = getOptionalSupabaseAnonKey();

  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
  }

  return value;
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnvValue("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}
