import { NextResponse } from "next/server";
import { getStoreConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { provisionR2ForStore } from "@/lib/r2-bootstrap";

interface ProvisionR2RouteProps {
  params: Promise<{ slug: string }>;
}

export async function POST(_request: Request, { params }: ProvisionR2RouteProps) {
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

    const result = await provisionR2ForStore(store);
    await syncOwnerStoresAndMetrics();

    return NextResponse.json(
      {
        success: true,
        slug,
        bucketName: result.bucketName,
        publicUrl: result.publicUrl,
        managedDomain: result.managedDomain,
        adminEnvLocalPath: result.adminEnvLocalPath
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "R2 provisioning basarisiz oldu."
      },
      { status: 500 }
    );
  }
}
