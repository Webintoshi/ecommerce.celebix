export type AdminAuthProvider = "supabase" | "logto";

function normalizeProvider(value: string | undefined): AdminAuthProvider {
  return value?.trim().toLowerCase() === "logto" ? "logto" : "supabase";
}

export function getAdminAuthProvider(): AdminAuthProvider {
  return normalizeProvider(
    process.env.ADMIN_AUTH_PROVIDER ?? process.env.NEXT_PUBLIC_ADMIN_AUTH_PROVIDER,
  );
}

export function isLogtoAdminAuthEnabled(): boolean {
  return getAdminAuthProvider() === "logto";
}
