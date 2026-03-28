function requireEnvValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} tanimli degil.`);
  }

  return value;
}

function requirePublicEnvValue(name: string, value: string | undefined): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} tanimli degil.`);
  }

  return normalized;
}

function normalizeUrl(value: string): string {
  const cleaned = value.replace(/^["']|["']$/g, "");
  const normalized = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  return normalized.replace(/\/$/, "");
}

export function getOwnerSupabaseUrl(): string {
  return normalizeUrl(
    requirePublicEnvValue("NEXT_PUBLIC_OWNER_SUPABASE_URL", process.env.NEXT_PUBLIC_OWNER_SUPABASE_URL)
  );
}

export function getOwnerSupabaseAnonKey(): string {
  return requirePublicEnvValue("NEXT_PUBLIC_OWNER_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_OWNER_SUPABASE_ANON_KEY);
}

export function getOwnerSupabaseServiceRoleKey(): string {
  return requireEnvValue("OWNER_SUPABASE_SERVICE_ROLE_KEY");
}

export function getOwnerSupabaseProjectRef(): string | null {
  return process.env.OWNER_SUPABASE_PROJECT_REF?.trim() || null;
}
