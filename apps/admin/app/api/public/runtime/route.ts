import { NextResponse } from "next/server";
import { getStoreRuntime } from "@/lib/store-runtime";

export async function GET() {
  const runtime = getStoreRuntime();

  return NextResponse.json({
    slug: runtime.slug,
    name: runtime.name,
    storefrontDomain: runtime.storefrontDomain,
    adminDomain: runtime.adminDomain,
    storefrontUrl: runtime.storefrontUrl,
    adminUrl: runtime.adminUrl,
    generatedAt: new Date().toISOString()
  });
}
