import { NextResponse } from "next/server";
import { listDashboardStores } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import {
  createOwnerStoreWithProvisioning,
  OwnerStoreCreatePreflightError,
  type OwnerStoreCreateRequestBody,
} from "@/lib/owner-store-create-service";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";
import { isRedisLockError } from "@/lib/redis";

export async function GET() {
  const auth = await getOwnerAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "Owner oturumu gerekli." }, { status: 401 });
  }

  const stores = await listDashboardStores(auth);
  return NextResponse.json({ stores });
}

export async function POST(request: Request) {
  try {
    const auth = await getOwnerAuthContext();

    if (!isSuperAdmin(auth)) {
      return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
    }

    const previewBlock = blockOwnerActionInPreview("create_store");

    if (previewBlock) {
      return previewBlock;
    }

    const body = (await request.json()) as OwnerStoreCreateRequestBody;
    const created = await createOwnerStoreWithProvisioning({ auth, body });

    return NextResponse.json(
      created,
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof OwnerStoreCreatePreflightError) {
      return NextResponse.json(
        {
          error: error.message,
          preflightErrors: error.result.errors,
          deploymentBranches: error.result.deploymentBranches,
        },
        { status: error.result.status },
      );
    }

    if (isRedisLockError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Magaza olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
