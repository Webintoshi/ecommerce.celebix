import { NextResponse } from "next/server";
import { getActiveStoreSlug, getStoreConfig } from "@celebix/platform-config";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import generatedRuntime from "@/celebix.generated-runtime.json";
import { CUSTOMER_AUTH_STATUS } from "@/lib/customer-auth-runtime";

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
    storageProvider: generatedRuntime.storageProvider,
    analyticsProvider: generatedRuntime.analyticsProvider,
    supabaseStatus: generatedRuntime.supabaseStatus,
    authProvider: generatedRuntime.authProvider,
    customerAuthProvider: generatedRuntime.customerAuthProvider,
    customerAuthStatus: CUSTOMER_AUTH_STATUS,
    storefrontDomain,
    adminDomain,
    storefrontUrl,
    adminUrl,
  };
}

export async function GET() {
  return NextResponse.json({
    ...readRuntime(),
    generatedAt: new Date().toISOString(),
  });
}
