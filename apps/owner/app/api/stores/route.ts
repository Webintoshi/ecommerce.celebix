import { NextResponse } from "next/server";
import {
  createStore,
  resolveDefaultDatabaseMode,
  type DatabaseMode,
} from "@celebix/platform-config";
import {
  ensureOwnerStoreAuthorityForSlug,
  listDashboardStores,
  recordOwnerAuditLog,
} from "@/lib/control-plane";
import { validateNewStoreDeploymentBranches } from "@/lib/deployment-branch-guard";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { isRedisLockError } from "@/lib/redis";
import { hasUnresolvedCleanupRun } from "@/lib/store-lifecycle";
import {
  runStoreProvisioningWorkflow,
  validateProvisioningEnvironmentReadiness,
} from "@/lib/store-provisioning";

function predictStoreSlug(name: string, explicitSlug?: string): string {
  const candidate = explicitSlug?.trim() || name.trim();

  return candidate
    .toLocaleLowerCase("tr")
    .replace(/Ã„Â±/g, "i")
    .replace(/Ã„Å¸/g, "g")
    .replace(/ÃƒÂ¼/g, "u")
    .replace(/Ã…Å¸/g, "s")
    .replace(/ÃƒÂ¶/g, "o")
    .replace(/ÃƒÂ§/g, "c")
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
    const requestedDatabaseMode = resolveDefaultDatabaseMode(body.databaseMode);
    const legacyModeSelected = requestedDatabaseMode === "full_supabase";

    const predictedSlug = predictStoreSlug(body.name ?? "", body.slug);

    if (predictedSlug && (await hasUnresolvedCleanupRun(predictedSlug))) {
      return NextResponse.json(
        { error: `"${predictedSlug}" icin cozulmemis cleanup tombstone kaydi var. Ayni slug ile tekrar acilamaz.` },
        { status: 409 },
      );
    }

    if (predictedSlug) {
      const branchValidation = validateNewStoreDeploymentBranches(predictedSlug);

      if (branchValidation.errors.length > 0) {
        return NextResponse.json(
          {
            error: branchValidation.errors.join(" "),
            deploymentBranches: {
              owner: branchValidation.ownerBranch,
              admin: branchValidation.adminBranch,
              storefront: branchValidation.storefrontBranch,
            },
          },
          { status: 409 },
        );
      }
    }

    const environmentReadiness = await validateProvisioningEnvironmentReadiness({
      databaseMode: requestedDatabaseMode,
    });

    if (!environmentReadiness.ready) {
      return NextResponse.json(
        {
          error: environmentReadiness.errors[0] || "Provisioning authority hazir degil.",
          preflightErrors: environmentReadiness.errors,
        },
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
      databaseMode: requestedDatabaseMode,
    });

    await ensureOwnerStoreAuthorityForSlug(created.store.slug);

    await recordOwnerAuditLog({
      actorId: auth.user.id,
      action: "store_created",
      targetType: "store",
      targetId: created.store.slug,
      details: {
        name: created.store.name,
        domain: created.store.domains.storefront,
        databaseMode: requestedDatabaseMode,
        legacyModeSelected,
        provisioningState: "provisioning",
      },
    });

    const packageDurationMonths = parseDuration(body.packageDurationMonths);

    queueMicrotask(() => {
      void runStoreProvisioningWorkflow({
        auth,
        slug: created.store.slug,
        mode: "create",
        packageStartDate: body.packageStartDate,
        packageDurationMonths,
      }).catch(async (error) => {
        try {
          await recordOwnerAuditLog({
            actorId: auth.user.id,
            action: "store_provisioning_enqueue_failed",
            targetType: "store",
            targetId: created.store.slug,
            details: {
              message: error instanceof Error ? error.message : "Store provisioning baslatilamadi.",
            },
          });
        } catch {
          // Ignore audit follow-up failures for detached provisioning runs.
        }
      });
    });

    return NextResponse.json(
      {
        ...created,
        provisioningState: "provisioning",
        steps: [],
        blockers: [],
      },
      { status: 202 },
    );
  } catch (error) {
    if (isRedisLockError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Magaza olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
