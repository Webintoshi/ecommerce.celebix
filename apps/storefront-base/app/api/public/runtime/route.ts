import { NextResponse } from "next/server";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

function readRuntime() {
  const slug =
    process.env.STORE_SLUG?.trim() ||
    process.env.NEXT_PUBLIC_STORE_SLUG?.trim() ||
    "generated-store";
  const storefrontDomain =
    process.env.NEXT_PUBLIC_STORE_DOMAIN?.trim() ||
    process.env.STORE_DOMAIN?.trim() ||
    safeHostname(STOREFRONT_RUNTIME.siteUrl) ||
    null;
  const adminDomain =
    process.env.NEXT_PUBLIC_ADMIN_DOMAIN?.trim() ||
    process.env.ADMIN_DOMAIN?.trim() ||
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
    authProvider: process.env.NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER || process.env.CUSTOMER_AUTH_PROVIDER || "supabase",
    customerAuthStatus: process.env.NEXT_PUBLIC_CUSTOMER_AUTH_STATUS || process.env.CUSTOMER_AUTH_STATUS || null,
    storageProvider: process.env.NEXT_PUBLIC_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER || null,
    analyticsProvider: process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER || process.env.ANALYTICS_PROVIDER || null,
    supabaseStatus: process.env.NEXT_PUBLIC_SUPABASE_STATUS || process.env.SUPABASE_STATUS || null,
    storefrontDomain,
    adminDomain,
    storefrontUrl,
    adminUrl,
  };
}

function safeHostname(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({
    ...readRuntime(),
    generatedAt: new Date().toISOString(),
  });
}
