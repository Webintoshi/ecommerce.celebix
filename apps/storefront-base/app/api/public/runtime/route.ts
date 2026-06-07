import { NextResponse } from "next/server";
import { getActiveStoreSlug, getStoreConfig } from "@celebix/platform-config";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

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

  return {
    slug,
    databaseMode: STOREFRONT_RUNTIME.databaseMode,
    customerAuthProvider:
      process.env.CUSTOMER_AUTH_PROVIDER || process.env.NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER || "supabase",
    customerAuthStatus:
      process.env.CUSTOMER_AUTH_STATUS || process.env.NEXT_PUBLIC_CUSTOMER_AUTH_STATUS || "configured",
    storageProvider: process.env.STORAGE_PROVIDER || process.env.NEXT_PUBLIC_STORAGE_PROVIDER || "supabase",
    analyticsProvider:
      process.env.ANALYTICS_PROVIDER || process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER || "umami",
    supabaseStatus:
      process.env.SUPABASE_STATUS ||
      process.env.NEXT_PUBLIC_SUPABASE_STATUS ||
      (STOREFRONT_RUNTIME.databaseMode === "light_postgres" ? "none" : "configured"),
    storefrontDomain,
    adminDomain,
    storefrontUrl,
    adminUrl,
    r2: {
      publicUrl: process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || null,
      prefix: process.env.R2_PREFIX || process.env.NEXT_PUBLIC_R2_PREFIX || null,
      productImagesPrefix: process.env.R2_PRODUCT_IMAGES_PREFIX || null,
      storefrontReadStatus:
        process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL ? "configured" : "pending",
    },
    umami: {
      scriptUrl:
        process.env.UMAMI_SCRIPT_URL ||
        process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ||
        "https://analytics.celebix.co/script.js",
      websiteId: process.env.UMAMI_WEBSITE_ID || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || null,
      storefrontTrackingStatus:
        process.env.UMAMI_WEBSITE_ID || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
          ? "configured"
          : "pending",
    },
  };
}

export async function GET() {
  return NextResponse.json({
    ...readRuntime(),
    generatedAt: new Date().toISOString(),
  });
}
