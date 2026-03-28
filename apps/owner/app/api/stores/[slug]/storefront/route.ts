import { NextResponse } from "next/server";
import { getStoreConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { scaffoldStorefrontApp } from "@/lib/storefront-scaffold";

interface StorefrontRouteProps {
  params: Promise<{ slug: string }>;
}

export async function POST(_request: Request, { params }: StorefrontRouteProps) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const store = getStoreConfig(slug);

    if (!store) {
      return NextResponse.json({ error: "Magaza bulunamadi." }, { status: 404 });
    }

    const result = scaffoldStorefrontApp(slug);
    await syncOwnerStoresAndMetrics();

    return NextResponse.json(
      {
        success: true,
        slug,
        appDir: result.relativeAppDirectory
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Storefront klasoru olusturulamadi."
      },
      { status: 500 }
    );
  }
}
