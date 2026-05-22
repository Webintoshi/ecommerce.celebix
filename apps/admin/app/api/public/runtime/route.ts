import { NextResponse } from "next/server";
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
  const supabaseUrl = getOptionalSupabaseUrl();
  const supabaseAnonKey = getOptionalSupabaseAnonKey();
  const supabaseServerUrl = getOptionalSupabaseServerUrl();
  const authCookieName = getOptionalSupabaseAuthStorageKey();
  const authBlocked = isLightPostgresAuthBlockedRuntime();
  const hasPublicSupabaseAuth = Boolean(supabaseUrl && supabaseAnonKey && authCookieName);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  if (!authBlocked && (!hasPublicSupabaseAuth || !supabaseServerUrl)) {
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
        authStrategy: "supabase_cookie_direct_v1",
        authCookieName,
        supabaseUrl,
        supabaseServerUrl,
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
    authStrategy: authBlocked ? "blocked_auth_setup" : "supabase_cookie_direct_v1",
    authCookieName,
    supabaseUrl,
    supabaseServerUrl,
    hasServiceRoleKey,
    deploymentMarker: process.env.CELEBIX_ADMIN_DEPLOYMENT_MARKER?.trim() || null,
    generatedAt: new Date().toISOString()
  });
}
