export type CustomerAuthProvider = "supabase" | "logto";

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

export function getCustomerAuthProvider(
  env: NodeJS.ProcessEnv = process.env,
): CustomerAuthProvider {
  return readEnv(["CUSTOMER_AUTH_PROVIDER", "NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER"], env)
    ?.toLowerCase() === "logto"
    ? "logto"
    : "supabase";
}

export function isLogtoCustomerAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getCustomerAuthProvider(env) === "logto";
}
