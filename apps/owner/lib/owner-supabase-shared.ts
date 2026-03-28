function requireEnvValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} tanimli degil.`);
  }

  return value;
}

function normalizeUrl(value: string): string {
  const cleaned = value.replace(/^["']|["']$/g, "");
  const normalized = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  return normalized.replace(/\/$/, "");
}

export function getOwnerSupabaseUrl(): string {
  return normalizeUrl(requireEnvValue("NEXT_PUBLIC_OWNER_SUPABASE_URL"));
}

export function getOwnerSupabaseAnonKey(): string {
  return requireEnvValue("NEXT_PUBLIC_OWNER_SUPABASE_ANON_KEY");
}

export function getOwnerSupabaseServiceRoleKey(): string {
  return requireEnvValue("OWNER_SUPABASE_SERVICE_ROLE_KEY");
}

export function getOwnerSupabaseProjectRef(): string | null {
  return process.env.OWNER_SUPABASE_PROJECT_REF?.trim() || null;
}
