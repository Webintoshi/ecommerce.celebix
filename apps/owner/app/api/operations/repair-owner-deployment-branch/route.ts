import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { repairOwnerDeploymentBranch } from "@/lib/coolify-owner-deployment";

export async function POST() {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const result = await repairOwnerDeploymentBranch({ triggerDeploy: true });

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
