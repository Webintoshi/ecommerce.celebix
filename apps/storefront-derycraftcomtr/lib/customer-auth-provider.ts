export type CustomerAuthProvider = "supabase" | "logto";

const DERYCRAFT_STORE_SLUG = "derycraftcomtr";
const DERYCRAFT_HOSTS = new Set(["derycraft.com.tr", "www.derycraft.com.tr"]);

function readEnv(
  keys: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeHost(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
}

function readHostFromUrl(value: string | null): string | null {
  const normalized = normalizeHost(value);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized.includes("://") ? normalized : `https://${normalized}`).hostname;
  } catch {
    return normalized;
  }
}

function resolveRuntimeHost(env: NodeJS.ProcessEnv = process.env): string | null {
  const configuredHost = readHostFromUrl(
    readEnv(["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_STORE_DOMAIN"], env),
  );

  if (configuredHost) {
    return configuredHost;
  }

  if (typeof window !== "undefined") {
    return normalizeHost(window.location.hostname);
  }

  return null;
}

function isDerycraftHost(env: NodeJS.ProcessEnv = process.env): boolean {
  const host = resolveRuntimeHost(env);
  return Boolean(host && DERYCRAFT_HOSTS.has(host));
}

function resolveRuntimeStoreSlug(env: NodeJS.ProcessEnv = process.env): string {
  const explicitSlug = readEnv(["STORE_SLUG", "NEXT_PUBLIC_STORE_SLUG"], env);
  if (explicitSlug) {
    return explicitSlug;
  }

  if (isDerycraftHost(env)) {
    return DERYCRAFT_STORE_SLUG;
  }

  return "shared";
}

function resolveRuntimeDatabaseMode(
  env: NodeJS.ProcessEnv = process.env,
): "light_postgres" | "full_supabase" {
  const explicitMode = readEnv(["DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"], env);
  if (explicitMode) {
    return explicitMode.toLowerCase() === "light_postgres"
      ? "light_postgres"
      : "full_supabase";
  }

  return resolveRuntimeStoreSlug(env) === DERYCRAFT_STORE_SLUG
    ? "light_postgres"
    : "full_supabase";
}

function isDerycraftLightPostgresRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    resolveRuntimeDatabaseMode(env) === "light_postgres" &&
    resolveRuntimeStoreSlug(env) === DERYCRAFT_STORE_SLUG
  );
}

export function getCustomerAuthProvider(
  env: NodeJS.ProcessEnv = process.env,
): CustomerAuthProvider {
  const explicitProvider = readEnv(
    ["CUSTOMER_AUTH_PROVIDER", "NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER"],
    env,
  )?.toLowerCase();

  if (explicitProvider === "logto") {
    return "logto";
  }

  if (explicitProvider === "supabase") {
    return "supabase";
  }

  return isDerycraftLightPostgresRuntime(env) ? "logto" : "supabase";
}

export function isLogtoCustomerAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getCustomerAuthProvider(env) === "logto";
}
