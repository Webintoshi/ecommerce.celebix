export type CustomerAuthProvider = "supabase" | "logto";

function readEnv(keys: readonly string[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
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

  const databaseMode = readEnv(["DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"], env)
    ?.toLowerCase();

  return databaseMode === "light_postgres" ? "logto" : "supabase";
}

export function isLogtoCustomerAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getCustomerAuthProvider(env) === "logto";
}
