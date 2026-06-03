import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";
import { repairStoreDeploymentAuthority } from "@/lib/coolify-store-deployment";

interface RepairStoreDeploymentAuthorityRouteProps {
  params: Promise<{ slug: string }>;
}

export async function POST(_request: Request, { params }: RepairStoreDeploymentAuthorityRouteProps) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  const previewBlock = blockOwnerActionInPreview("repair");

  if (previewBlock) {
    return previewBlock;
  }

  try {
    const { slug } = await params;
    const result = await repairStoreDeploymentAuthority(slug, { triggerDeploy: false });

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Store deployment authority onarimi basarisiz oldu.",
      },
      { status: 500 },
    );
  }
}
