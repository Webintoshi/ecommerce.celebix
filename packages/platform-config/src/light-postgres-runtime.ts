export type RuntimeDatabaseMode = "light_postgres" | "full_supabase";
export type RuntimeAuthSetupStatus = "configured" | "blocked_auth_setup";

type RuntimeKeyGroups = {
  mode?: string[];
  databaseUrl?: string[];
  databaseName?: string[];
  sslMode?: string[];
  authStatus?: string[];
};

const DEFAULT_MODE_KEYS = [
  "DATABASE_MODE",
  "NEXT_PUBLIC_RUNTIME_DATABASE_MODE",
];

const DEFAULT_DATABASE_URL_KEYS = [
  "LIGHT_POSTGRES_DATABASE_URL",
  "DATABASE_URL",
];

const DEFAULT_DATABASE_NAME_KEYS = [
  "LIGHT_POSTGRES_DATABASE_NAME",
  "STORE_SLUG",
];

const DEFAULT_SSL_MODE_KEYS = [
  "LIGHT_POSTGRES_DATABASE_SSLMODE",
  "DATABASE_SSLMODE",
];

const DEFAULT_AUTH_STATUS_KEYS = [
  "AUTH_SETUP_STATUS",
  "NEXT_PUBLIC_AUTH_SETUP_STATUS",
];

function readEnvValue(
  env: NodeJS.ProcessEnv,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeDatabaseMode(value: string | null | undefined): RuntimeDatabaseMode {
  return value?.trim().toLowerCase() === "light_postgres"
    ? "light_postgres"
    : "full_supabase";
}

function normalizeAuthStatus(value: string | null | undefined): RuntimeAuthSetupStatus {
  return value?.trim().toLowerCase() === "blocked_auth_setup"
    ? "blocked_auth_setup"
    : "configured";
}

export function resolveRuntimeDatabaseMode(
  env: NodeJS.ProcessEnv = process.env,
  overrides: RuntimeKeyGroups = {},
): RuntimeDatabaseMode {
  return normalizeDatabaseMode(
    readEnvValue(env, overrides.mode ?? DEFAULT_MODE_KEYS),
  );
}

export function isLightPostgresRuntime(
  env: NodeJS.ProcessEnv = process.env,
  overrides: RuntimeKeyGroups = {},
): boolean {
  return resolveRuntimeDatabaseMode(env, overrides) === "light_postgres";
}

export function resolveLightPostgresDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  overrides: RuntimeKeyGroups = {},
): string | null {
  return readEnvValue(env, overrides.databaseUrl ?? DEFAULT_DATABASE_URL_KEYS);
}

export function resolveLightPostgresDatabaseName(
  env: NodeJS.ProcessEnv = process.env,
  overrides: RuntimeKeyGroups = {},
): string | null {
  return readEnvValue(env, overrides.databaseName ?? DEFAULT_DATABASE_NAME_KEYS);
}

export function resolveLightPostgresSslMode(
  env: NodeJS.ProcessEnv = process.env,
  overrides: RuntimeKeyGroups = {},
): string {
  return (
    readEnvValue(env, overrides.sslMode ?? DEFAULT_SSL_MODE_KEYS)?.toLowerCase() ||
    "require"
  );
}

export function resolveLightPostgresDefaultSslMode(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.LIGHT_POSTGRES_DEFAULT_SSLMODE?.trim().toLowerCase() ||
    env.LIGHT_POSTGRES_DATABASE_SSLMODE?.trim().toLowerCase() ||
    env.DATABASE_SSLMODE?.trim().toLowerCase() ||
    "require"
  );
}

export function hasSupabasePublicAuthEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
}

export function hasSupabaseServiceRoleEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function hasSupabaseAuthEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return hasSupabasePublicAuthEnv(env) && hasSupabaseServiceRoleEnv(env);
}

export function resolveRuntimeAuthSetupStatus(
  env: NodeJS.ProcessEnv = process.env,
  overrides: RuntimeKeyGroups = {},
): RuntimeAuthSetupStatus {
  const explicit = normalizeAuthStatus(
    readEnvValue(env, overrides.authStatus ?? DEFAULT_AUTH_STATUS_KEYS),
  );

  if (explicit === "blocked_auth_setup") {
    return explicit;
  }

  if (isLightPostgresRuntime(env, overrides) && !hasSupabaseAuthEnv(env)) {
    return "blocked_auth_setup";
  }

  return "configured";
}
