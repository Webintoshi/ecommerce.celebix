import { NextResponse } from "next/server";
import { getAdminAuthProvider } from "@/lib/admin-auth-provider";
import { getOptionalLogtoIssuer, LOGTO_ADMIN_SESSION_COOKIE_NAME } from "@/lib/logto-admin-auth";
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
  const storageProvider = process.env.STORAGE_PROVIDER || process.env.NEXT_PUBLIC_STORAGE_PROVIDER || "supabase";
  const analyticsProvider =
    process.env.ANALYTICS_PROVIDER || process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER || "umami";
  const supabaseStatus =
    process.env.SUPABASE_STATUS ||
    process.env.NEXT_PUBLIC_SUPABASE_STATUS ||
    (runtime.databaseMode === "light_postgres" ? "none" : "configured");
  const r2PublicUrl = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || null;
  const r2Prefix = process.env.R2_PREFIX || process.env.NEXT_PUBLIC_R2_PREFIX || null;
  const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || null;

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
        storageProvider,
        analyticsProvider,
        supabaseStatus,
        r2: {
          publicUrl: r2PublicUrl,
          prefix: r2Prefix,
          adminUploadStatus: r2PublicUrl ? "configured" : "pending",
        },
        umami: {
          websiteId: umamiWebsiteId,
          adminAnalyticsStatus: umamiWebsiteId ? "configured" : "pending",
        },
        optionalModules: {
          quick_order_links: process.env.OPTIONAL_MODULE_QUICK_ORDER_LINKS || "disabled",
          coupons: process.env.OPTIONAL_MODULE_COUPONS || "disabled",
          discounts: process.env.OPTIONAL_MODULE_DISCOUNTS || "disabled",
          lucky_wheel: process.env.OPTIONAL_MODULE_LUCKY_WHEEL || "disabled",
          marketplace: process.env.OPTIONAL_MODULE_MARKETPLACE || "disabled",
          accounting: process.env.OPTIONAL_MODULE_ACCOUNTING || "disabled",
        },
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
    storageProvider,
    analyticsProvider,
    supabaseStatus,
    r2: {
      publicUrl: r2PublicUrl,
      prefix: r2Prefix,
      adminUploadStatus: r2PublicUrl ? "configured" : "pending",
    },
    umami: {
      websiteId: umamiWebsiteId,
      adminAnalyticsStatus: umamiWebsiteId ? "configured" : "pending",
    },
    optionalModules: {
      quick_order_links: process.env.OPTIONAL_MODULE_QUICK_ORDER_LINKS || "disabled",
      coupons: process.env.OPTIONAL_MODULE_COUPONS || "disabled",
      discounts: process.env.OPTIONAL_MODULE_DISCOUNTS || "disabled",
      lucky_wheel: process.env.OPTIONAL_MODULE_LUCKY_WHEEL || "disabled",
      marketplace: process.env.OPTIONAL_MODULE_MARKETPLACE || "disabled",
      accounting: process.env.OPTIONAL_MODULE_ACCOUNTING || "disabled",
    },
    authCookieName,
    supabaseUrl,
    supabaseServerUrl,
    logtoIssuer,
    hasServiceRoleKey,
    deploymentMarker: process.env.CELEBIX_ADMIN_DEPLOYMENT_MARKER?.trim() || null,
    generatedAt: new Date().toISOString()
  });
}
