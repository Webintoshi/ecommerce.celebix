import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";
import { runStoreProvisioningWorkflow } from "@/lib/store-provisioning";
import { isRedisLockError } from "@/lib/redis";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(_: Request, { params }: RouteContext) {
  try {
    const auth = await getOwnerAuthContext();

    if (!isSuperAdmin(auth)) {
      return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
    }

    const previewBlock = blockOwnerActionInPreview("repair");

    if (previewBlock) {
      return previewBlock;
    }

    const { slug } = await params;
    const result = await runStoreProvisioningWorkflow({
      auth,
      slug,
      mode: "repair",
    });

    return NextResponse.json(
      {
        success: result.provisioningState === "ready",
        repaired: result.repaired,
        provisioningState: result.provisioningState,
        steps: result.steps,
        blockers: result.blockers,
      },
      { status: result.provisioningState === "ready" ? 200 : 202 },
    );
  } catch (error) {
    if (isRedisLockError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Store repair basarisiz oldu." },
      { status: 500 },
    );
  }
}
