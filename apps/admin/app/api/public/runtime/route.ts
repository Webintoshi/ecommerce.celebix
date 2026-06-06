import { NextResponse } from "next/server";
import { getAdminAuthProvider } from "@/lib/admin-auth-provider";
import {
  getOptionalLogtoIssuer,
  LOGTO_ADMIN_SESSION_COOKIE_NAME,
} from "@/lib/logto-admin-auth";
import { getStoreRuntime } from "@/lib/store-runtime";
import {
  getOptionalSupabaseAnonKey,
  getOptionalSupabaseAuthStorageKey,
  getOptionalSupabaseServerUrl,
  getOptionalSupabaseUrl,
  isLightPostgresAuthBlockedRuntime,
} from "@/lib/supabase-shared";

export async function GET() {
  const runtime = getStoreRuntime();
  const authProvider = getAdminAuthProvider();
  const supabaseUrl = getOptionalSupabaseUrl();
  const supabaseAnonKey = getOptionalSupabaseAnonKey();
  const supabaseServerUrl = getOptionalSupabaseServerUrl();
  const authCookieName =
    authProvider === "logto"
      ? LOGTO_ADMIN_SESSION_COOKIE_NAME
      : getOptionalSupabaseAuthStorageKey();
  const authBlocked = isLightPostgresAuthBlockedRuntime();
  const hasPublicSupabaseAuth = Boolean(supabaseUrl && supabaseAnonKey && authCookieName);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const logtoIssuer = authProvider === "logto" ? getOptionalLogtoIssuer() : null;
  const authStrategy =
    authBlocked
      ? "blocked_auth_setup"
      : authProvider === "logto"
        ? "logto_oidc_bridge_v1"
        : "supabase_cookie_direct_v1";

  if (authProvider !== "logto" && !authBlocked && (!hasPublicSupabaseAuth || !supabaseServerUrl)) {
    return NextResponse.json(
      {
        slug: runtime.slug,
        name: runtime.name,
        databaseMode: runtime.databaseMode,
        authSetupStatus: runtime.authSetupStatus,
        storefrontDomain: runtime.storefrontDomain,
        adminDomain: runtime.adminDomain,
        storefrontUrl: runtime.storefrontUrl,
        adminUrl: runtime.adminUrl,
        authStrategy,
        authProvider,
        authCookieName,
        supabaseUrl,
        supabaseServerUrl,
        logtoIssuer,
        hasServiceRoleKey,
        deploymentMarker: process.env.CELEBIX_ADMIN_DEPLOYMENT_MARKER?.trim() || null,
        generatedAt: new Date().toISOString(),
        error: "Supabase public auth authority eksik.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    slug: runtime.slug,
    name: runtime.name,
    databaseMode: runtime.databaseMode,
    authSetupStatus: runtime.authSetupStatus,
    storefrontDomain: runtime.storefrontDomain,
    adminDomain: runtime.adminDomain,
    storefrontUrl: runtime.storefrontUrl,
    adminUrl: runtime.adminUrl,
    authStrategy,
    authProvider,
    authCookieName,
    supabaseUrl,
    supabaseServerUrl,
    logtoIssuer,
    hasServiceRoleKey,
    deploymentMarker: process.env.CELEBIX_ADMIN_DEPLOYMENT_MARKER?.trim() || null,
    generatedAt: new Date().toISOString(),
  });
}
