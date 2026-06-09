import { NextResponse } from "next/server";
import { getActiveStoreSlug, getStoreConfig } from "@celebix/platform-config";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

function readEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function readRuntime() {
  const slug = getActiveStoreSlug();
  const store = getStoreConfig(slug);
  const storefrontDomain =
    process.env.NEXT_PUBLIC_STORE_DOMAIN?.trim() ||
    store?.domains.storefront ||
    null;
  const adminDomain =
    process.env.NEXT_PUBLIC_ADMIN_DOMAIN?.trim() ||
    store?.domains.admin ||
    null;
  const storefrontUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (storefrontDomain ? `https://${storefrontDomain}` : null);
  const adminUrl =
    process.env.NEXT_PUBLIC_ADMIN_URL?.trim() ||
    (adminDomain ? `https://${adminDomain}` : null);
  const storageProvider =
    readEnv("STORAGE_PROVIDER", "NEXT_PUBLIC_STORAGE_PROVIDER") ||
    store?.storageProvider ||
    "r2";
  const analyticsProvider =
    readEnv("ANALYTICS_PROVIDER", "NEXT_PUBLIC_ANALYTICS_PROVIDER") ||
    store?.analyticsProvider ||
    "umami";
  const supabaseStatus =
    readEnv("SUPABASE_STATUS", "NEXT_PUBLIC_SUPABASE_STATUS") ||
    store?.supabaseStatus ||
    (STOREFRONT_RUNTIME.databaseMode === "light_postgres" ? "none" : "legacy");
  const customerAuthStatus =
    readEnv(
      "CUSTOMER_AUTH_STATUS",
      "NEXT_PUBLIC_CUSTOMER_AUTH_STATUS",
      "AUTH_SETUP_STATUS",
      "NEXT_PUBLIC_AUTH_SETUP_STATUS",
    ) ||
    (store?.logto?.customerAppStatus === "configured" ||
    store?.logto?.customerClientId?.trim() ||
    store?.logto?.customerAppId?.trim()
      ? "logto_stable"
      : null) ||
    (STOREFRONT_RUNTIME.databaseMode === "light_postgres" ? "pending_auth_setup" : null);
  const r2Prefix =
    readEnv("R2_PREFIX", "NEXT_PUBLIC_R2_PREFIX") ||
    store?.r2?.prefix ||
    store?.media?.prefix ||
    null;
  const r2PublicUrl =
    readEnv("R2_PUBLIC_URL", "NEXT_PUBLIC_R2_PUBLIC_URL") ||
    store?.r2?.publicUrl ||
    store?.media?.publicBaseUrl ||
    null;
  const umamiScriptUrl =
    readEnv("UMAMI_SCRIPT_URL", "NEXT_PUBLIC_UMAMI_SCRIPT_URL") ||
    store?.umami?.scriptUrl ||
    null;
  const umamiHost =
    readEnv("UMAMI_BASE_URL", "NEXT_PUBLIC_UMAMI_BASE_URL") ||
    store?.umami?.host ||
    null;

  return {
    slug,
    databaseMode: STOREFRONT_RUNTIME.databaseMode,
    storageProvider,
    analyticsProvider,
    supabaseStatus,
    customerAuthStatus,
    storefrontDomain,
    adminDomain,
    storefrontUrl,
    adminUrl,
    r2: {
      status: storageProvider === "r2" ? "configured" : "disabled",
      prefix: r2Prefix,
      publicUrl: r2PublicUrl,
    },
    media: {
      provider: storageProvider,
      status: storageProvider === "r2" ? "configured" : "disabled",
      prefix: r2Prefix,
      publicBaseUrl: r2PublicUrl,
    },
    umami: {
      status: analyticsProvider === "umami" ? "pending_or_configured" : "disabled",
      host: umamiHost,
      scriptUrl: umamiScriptUrl,
    },
  };
}

export async function GET() {
  return NextResponse.json({
    ...readRuntime(),
    generatedAt: new Date().toISOString(),
  });
}
