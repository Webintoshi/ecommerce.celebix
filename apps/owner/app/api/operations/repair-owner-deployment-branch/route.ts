import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { repairOwnerDeploymentBranch } from "@/lib/coolify-owner-deployment";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";

export async function POST() {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  const previewBlock = blockOwnerActionInPreview("repair");

  if (previewBlock) {
    return previewBlock;
  }

  try {
    const result = await repairOwnerDeploymentBranch({ triggerDeploy: false });

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
            : "Owner deployment branch onarimi basarisiz oldu.",
      },
      { status: 500 },
    );
  }
}
