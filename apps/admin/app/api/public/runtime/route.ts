import { NextResponse } from "next/server";
import { getStoreRuntime } from "@/lib/store-runtime";
import {
  getSupabaseAuthStorageKey,
  getSupabaseServerUrl,
  getSupabaseUrl,
} from "@/lib/supabase-shared";

export async function GET() {
  const runtime = getStoreRuntime();
  const supabaseUrl = getSupabaseUrl();
  const supabaseServerUrl = getSupabaseServerUrl();

  return NextResponse.json({
    slug: runtime.slug,
    name: runtime.name,
    databaseMode: runtime.databaseMode,
    authSetupStatus: runtime.authSetupStatus,
    storefrontDomain: runtime.storefrontDomain,
    adminDomain: runtime.adminDomain,
    storefrontUrl: runtime.storefrontUrl,
    adminUrl: runtime.adminUrl,
    authStrategy: "supabase_cookie_direct_v1",
    authCookieName: getSupabaseAuthStorageKey(),
    supabaseUrl,
    supabaseServerUrl,
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    deploymentMarker: process.env.CELEBIX_ADMIN_DEPLOYMENT_MARKER?.trim() || null,
    generatedAt: new Date().toISOString()
  });
}
