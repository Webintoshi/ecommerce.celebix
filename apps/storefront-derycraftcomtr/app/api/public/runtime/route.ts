import { NextResponse } from "next/server";
import { getActiveStoreSlug, getStoreConfig } from "@celebix/platform-config";
import { getStorefrontSupabaseDisconnectRuntime } from "@/lib/supabase-disconnect-readiness";

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
    storefrontDomain,
    adminDomain,
    storefrontUrl,
    adminUrl,
  };
}

export async function GET() {
  const disconnectRuntime = getStorefrontSupabaseDisconnectRuntime();

  return NextResponse.json({
    ...readRuntime(),
    ...disconnectRuntime,
    generatedAt: new Date().toISOString(),
  });
}
