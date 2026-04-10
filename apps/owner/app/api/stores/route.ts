import { NextResponse } from "next/server";
import { createStore, updateStoreStorefrontConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import {
  listDashboardStores,
  recordOwnerAuditLog,
  syncOwnerStoresAndMetrics,
  updateOwnerStoreR2Authority,
} from "@/lib/control-plane";
import { getSupabaseBootstrapStatus, provisionSupabaseForStore } from "@/lib/supabase-bootstrap";
import { getR2BootstrapStatus, provisionR2ForStore } from "@/lib/r2-bootstrap";
import { prepareStoreAdminDeployment } from "@/lib/admin-deployment";
import { provisionAdminDeploymentForStore } from "@/lib/admin-deployment-coolify";
import { seedStarterStorefrontContent } from "@/lib/starter-storefront-seed";
import { scaffoldStorefrontApp } from "@/lib/storefront-scaffold";
import { prepareStorefrontDeployment } from "@/lib/storefront-deployment";
import { provisionStorefrontDeploymentForStore } from "@/lib/storefront-deployment-coolify";
import { syncStorefrontRepoForStore } from "@/lib/storefront-repo-sync";
import {
  type DeploymentWindowHandle,
  releaseGeneratedDeploymentWindow,
  reserveGeneratedDeploymentWindow,
} from "@/lib/generated-deployment-guard";
import { isRedisLockError } from "@/lib/redis";

function shouldAutoProvisionGeneratedApps(): boolean {
  const raw = process.env.OWNER_AUTO_PROVISION_GENERATED_APPS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
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
    };

    const result = createStore({
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
    });

    const warnings: string[] = [];
    const bootstrapStatus = await getSupabaseBootstrapStatus();
    const r2BootstrapStatus = await getR2BootstrapStatus();

    await syncOwnerStoresAndMetrics();

    if (bootstrapStatus.configured) {
      try {
        await provisionSupabaseForStore(result.store);
        try {
          const starterSeed = await seedStarterStorefrontContent(result.store);

          if (starterSeed.status === "skipped") {
            warnings.push(starterSeed.message);
          }
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? error.message
              : "Starter storefront icerigi otomatik olarak yazilamadi.",
          );
        }
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "Supabase otomatik kurulumu tamamlanamadi.");
      }
    } else {
      warnings.push(bootstrapStatus.lastError || "Supabase otomasyonu icin owner env eksik.");
    }

    if (r2BootstrapStatus.configured) {
      try {
        const r2Provisioning = await provisionR2ForStore(result.store);
        await updateOwnerStoreR2Authority(result.store.slug, {
          bucketName: r2Provisioning.bucketName,
          publicUrl: r2Provisioning.publicUrl,
          managedDomain: r2Provisioning.managedDomain,
        });
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "R2 otomatik kurulumu tamamlanamadi.");
      }
    } else {
      warnings.push(r2BootstrapStatus.lastError || "R2 otomasyonu icin owner env eksik.");
    }

    try {
      await prepareStoreAdminDeployment(result.store.slug);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Admin deployment blueprint hazirlanamadi.");
    }
    const shouldAutoProvisionApps = shouldAutoProvisionGeneratedApps();

    if (shouldAutoProvisionApps) {
      let deploymentWindow: DeploymentWindowHandle | null = null;

      try {
        deploymentWindow = await reserveGeneratedDeploymentWindow({
          slug: result.store.slug,
          target: "admin",
        });
        await provisionAdminDeploymentForStore(result.store.slug, { waitForRuntime: false });
      } catch (error) {
        if (deploymentWindow) {
          await releaseGeneratedDeploymentWindow(deploymentWindow);
        }

        warnings.push(error instanceof Error ? error.message : "Admin deployment otomasyonu tamamlanamadi.");
      }
    } else {
      warnings.push("Admin deployment otomasyonu varsayilan olarak kapali. Gerekirse store detayindan manuel tetikle.");
    }
    try {
      if (result.store.storefront?.status === "not_started") {
        const scaffoldResult = await scaffoldStorefrontApp(result.store.slug);
        updateStoreStorefrontConfig(result.store.slug, {
          appDir: scaffoldResult.relativeAppDirectory,
          status: "scaffolded",
        });
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Storefront scaffold tamamlanamadi.");
    }
    try {
      await prepareStorefrontDeployment(result.store.slug);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Storefront deployment blueprint hazirlanamadi.");
    }
    try {
      const repoSync = await syncStorefrontRepoForStore(result.store.slug);

      if (repoSync.status !== "synced") {
        warnings.push(repoSync.message || "Storefront repo senkronu tamamlanamadi.");
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Storefront repo senkronu tamamlanamadi.");
    }
    if (shouldAutoProvisionApps) {
      let deploymentWindow: DeploymentWindowHandle | null = null;

      try {
        deploymentWindow = await reserveGeneratedDeploymentWindow({
          slug: result.store.slug,
          target: "storefront",
        });
        const storefrontDeployment = await provisionStorefrontDeploymentForStore(result.store.slug, {
          waitForRuntime: false,
        });

        if (storefrontDeployment.status !== "configured") {
          warnings.push(
            storefrontDeployment.message ||
              "Storefront deployment tamamlandi ancak canli runtime henuz tutarli degil.",
          );
        }
      } catch (error) {
        if (deploymentWindow) {
          await releaseGeneratedDeploymentWindow(deploymentWindow);
        }

        warnings.push(error instanceof Error ? error.message : "Storefront deployment otomasyonu tamamlanamadi.");
      }
    } else {
      warnings.push("Storefront deployment otomasyonu varsayilan olarak kapali. Gerekirse store detayindan manuel tetikle.");
    }
    await syncOwnerStoresAndMetrics();
    await recordOwnerAuditLog({
      actorId: auth.user.id,
      action: "store_created",
      targetType: "store",
      targetId: result.store.slug,
      details: {
        name: result.store.name,
        domain: result.store.domains.storefront,
        warnings
      }
    });

    return NextResponse.json({ ...result, warnings }, { status: 201 });
  } catch (error) {
    if (isRedisLockError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Magaza olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
