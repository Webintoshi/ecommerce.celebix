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

function readBrowserHost() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.hostname.trim().toLowerCase() || null;
}

function isDerycraftCustomerAuthStore(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configuredSlug = readEnv(["STORE_SLUG", "NEXT_PUBLIC_STORE_SLUG"], env)?.toLowerCase();
  if (configuredSlug === DERYCRAFT_STORE_SLUG) {
    return true;
  }

  const browserHost = readBrowserHost();
  return Boolean(browserHost && DERYCRAFT_HOSTS.has(browserHost));
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

  if (isDerycraftCustomerAuthStore(env)) {
    return "logto";
  }

  return "supabase";
}

export function isLogtoCustomerAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getCustomerAuthProvider(env) === "logto";
}
