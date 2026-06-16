export type CustomerAuthMode = "supabase" | "logto" | "disabled";

export function normalizeRuntimeValue(value: string | undefined): string {
  return value?.trim().replace(/^["']|["']$/g, "").toLowerCase() ?? "";
}

export function resolveCustomerAuthMode(): CustomerAuthMode {
  const explicitProvider = normalizeRuntimeValue(
    process.env.NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER || process.env.CUSTOMER_AUTH_PROVIDER,
  );

  if (explicitProvider === "logto") {
    return "logto";
  }

  if (explicitProvider === "supabase") {
    return "supabase";
  }

  const authStatus = normalizeRuntimeValue(
    process.env.NEXT_PUBLIC_CUSTOMER_AUTH_STATUS || process.env.CUSTOMER_AUTH_STATUS,
  );

  if (authStatus === "logto_stable" || authStatus === "logto_canary") {
    return "logto";
  }

  const databaseMode = normalizeRuntimeValue(
    process.env.NEXT_PUBLIC_RUNTIME_DATABASE_MODE || process.env.DATABASE_MODE,
  );
  const supabaseStatus = normalizeRuntimeValue(
    process.env.NEXT_PUBLIC_SUPABASE_STATUS || process.env.SUPABASE_STATUS,
  );

  if (databaseMode === "light_postgres" || supabaseStatus === "none") {
    return "disabled";
  }

  return "supabase";
}

export function isGeneratedAuthMode(mode = resolveCustomerAuthMode()) {
  return mode === "logto" || mode === "disabled";
}
