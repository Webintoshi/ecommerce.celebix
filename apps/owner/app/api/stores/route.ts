import { NextResponse } from "next/server";
import { createStore, type DatabaseMode } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { listDashboardStores, recordOwnerAuditLog } from "@/lib/control-plane";
import { hasUnresolvedCleanupRun } from "@/lib/store-lifecycle";
import { runStoreProvisioningWorkflow } from "@/lib/store-provisioning";
import { isRedisLockError } from "@/lib/redis";

function predictStoreSlug(name: string, explicitSlug?: string): string {
  const candidate = explicitSlug?.trim() || name.trim();

  return candidate
    .toLocaleLowerCase("tr")
    .replace(/Ä±/g, "i")
    .replace(/ÄŸ/g, "g")
    .replace(/Ã¼/g, "u")
    .replace(/ÅŸ/g, "s")
    .replace(/Ã¶/g, "o")
    .replace(/Ã§/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDuration(value: number | string | null | undefined): number | null | undefined {
  if (typeof value === "string") {
    return value.trim().length > 0 ? Number(value) : null;
  }

  return value ?? undefined;
}

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

    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      domain?: string;
      theme?: string;
      tagline?: string;
      supportEmail?: string;
      supportPhone?: string;
      coolifyProjectName?: string;
      adminDeploymentName?: string;
      storefrontDeploymentName?: string;
      databaseMode?: DatabaseMode;
      packageStartDate?: string;
      packageDurationMonths?: number | string | null;
    };

    const predictedSlug = predictStoreSlug(body.name ?? "", body.slug);

    if (predictedSlug && (await hasUnresolvedCleanupRun(predictedSlug))) {
      return NextResponse.json(
        { error: `"${predictedSlug}" icin cozulmemis cleanup tombstone kaydi var. Aynı slug ile tekrar acilamaz.` },
        { status: 409 },
      );
    }

    const created = createStore({
      name: body.name ?? "",
      slug: body.slug,
      domain: body.domain ?? "",
      theme: body.theme,
      tagline: body.tagline,
      supportEmail: body.supportEmail,
      supportPhone: body.supportPhone,
      coolifyProjectName: body.coolifyProjectName,
      adminDeploymentName: body.adminDeploymentName,
      storefrontDeploymentName: body.storefrontDeploymentName,
      databaseMode: body.databaseMode,
    });

    const workflow = await runStoreProvisioningWorkflow({
      auth,
      slug: created.store.slug,
      mode: "create",
      packageStartDate: body.packageStartDate,
      packageDurationMonths: parseDuration(body.packageDurationMonths),
    });

    await recordOwnerAuditLog({
      actorId: auth.user.id,
      action: "store_created",
      targetType: "store",
      targetId: created.store.slug,
      details: {
        name: created.store.name,
        domain: created.store.domains.storefront,
        provisioningState: workflow.provisioningState,
        blockers: workflow.blockers.map((step) => step.message).filter((value): value is string => Boolean(value)),
      },
    });

    return NextResponse.json(
      {
        ...created,
        store: workflow.store,
        provisioningState: workflow.provisioningState,
        steps: workflow.steps,
        blockers: workflow.blockers,
      },
      { status: workflow.provisioningState === "ready" ? 201 : 202 },
    );
  } catch (error) {
    if (isRedisLockError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Magaza olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
