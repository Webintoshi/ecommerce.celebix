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

export function getSupabaseUrl(): string {
  return normalizeUrl(
    "NEXT_PUBLIC_SUPABASE_URL",
    requireEnvValue("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

export function getSupabaseServerUrl(): string {
  const serverUrl =
    process.env.SUPABASE_SERVER_URL ??
    process.env.SUPABASE_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  return normalizeUrl(
    process.env.SUPABASE_SERVER_URL?.trim()
      ? "SUPABASE_SERVER_URL"
      : process.env.SUPABASE_INTERNAL_URL?.trim()
        ? "SUPABASE_INTERNAL_URL"
        : "NEXT_PUBLIC_SUPABASE_URL",
    requireEnvValue(
      process.env.SUPABASE_SERVER_URL?.trim()
        ? "SUPABASE_SERVER_URL"
        : process.env.SUPABASE_INTERNAL_URL?.trim()
          ? "SUPABASE_INTERNAL_URL"
          : "NEXT_PUBLIC_SUPABASE_URL",
      serverUrl
    )
  );
}

export function getSupabaseAnonKey(): string {
  return requireEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnvValue("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}
