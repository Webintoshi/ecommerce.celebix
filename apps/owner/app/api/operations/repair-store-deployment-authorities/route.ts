import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { repairTrackedStoreDeploymentAuthorities } from "@/lib/coolify-store-deployment";

export async function POST() {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const result = await repairTrackedStoreDeploymentAuthorities({ triggerDeploy: false });

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
            : "Store deployment authority taramasi basarisiz oldu.",
      },
      { status: 500 },
    );
  }
}
