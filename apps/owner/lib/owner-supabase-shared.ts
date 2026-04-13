function readTrimmedEnvValue(name: string): string | null {
  const value = process.env[name]?.trim();

  return value || null;
}

function requireEnvValue(name: string): string {
  const value = readTrimmedEnvValue(name);

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

export function getMissingOwnerSupabaseEnvNames(options?: {
  requireServiceRole?: boolean;
}): string[] {
  const missing: string[] = [];

  if (!readTrimmedEnvValue("NEXT_PUBLIC_OWNER_SUPABASE_URL")) {
    missing.push("NEXT_PUBLIC_OWNER_SUPABASE_URL");
  }

  if (!readTrimmedEnvValue("NEXT_PUBLIC_OWNER_SUPABASE_ANON_KEY")) {
    missing.push("NEXT_PUBLIC_OWNER_SUPABASE_ANON_KEY");
  }

  if (options?.requireServiceRole && !readTrimmedEnvValue("OWNER_SUPABASE_SERVICE_ROLE_KEY")) {
    missing.push("OWNER_SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}

export function formatMissingOwnerSupabaseEnvMessage(names: string[]): string {
  return `${names.join(", ")} tanimli degil.`;
}
