import { NextResponse } from "next/server";
import { getStoreDetail } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { provisionAdminDeploymentForStore } from "@/lib/admin-deployment-coolify";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(_: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  const { slug } = await params;
  const store = await getStoreDetail(auth, slug);

  if (!store) {
    return NextResponse.json({ error: "Proje bulunamadi." }, { status: 404 });
  }

  try {
    await ensureStoreConfigFromOwnerAuthority(slug);
    const deployment = await provisionAdminDeploymentForStore(slug, { waitForRuntime: false });
    return NextResponse.json({ success: true, deployment }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin deployment otomasyonu basarisiz oldu." },
      { status: 500 }
    );
  }
}
