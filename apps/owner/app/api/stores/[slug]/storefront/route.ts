import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getStoreConfig, repairStoreConfig, updateStoreStorefrontConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { scaffoldStorefrontApp } from "@/lib/storefront-scaffold";
import { prepareStorefrontDeployment } from "@/lib/storefront-deployment";
import { provisionStorefrontDeploymentForStore } from "@/lib/storefront-deployment-coolify";
import { getRepoRoot } from "@celebix/platform-config";
import { syncStoreAuthorityRepoForStore, syncStorefrontRepoForStore } from "@/lib/storefront-repo-sync";
import {
  type DeploymentWindowHandle,
  releaseGeneratedDeploymentWindow,
  reserveGeneratedDeploymentWindow,
} from "@/lib/generated-deployment-guard";
import { isRedisLockError } from "@/lib/redis";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";

interface StorefrontRouteProps {
  params: Promise<{ slug: string }>;
}

export async function POST(_request: Request, { params }: StorefrontRouteProps) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const { slug } = await params;
    await ensureStoreConfigFromOwnerAuthority(slug);
    const store = getStoreConfig(slug) ? repairStoreConfig(slug) : null;

    if (!store) {
      return NextResponse.json({ error: "Magaza bulunamadi." }, { status: 404 });
    }

    const relativeAppDirectory = store.storefront?.appDir?.trim() || null;
    const appDirectory =
      relativeAppDirectory ? path.join(getRepoRoot(), relativeAppDirectory) : null;
    const shouldScaffold =
      store.storefront?.status === "not_started" ||
      !relativeAppDirectory ||
      !appDirectory ||
      !fs.existsSync(appDirectory);

    let result = shouldScaffold
      ? await scaffoldStorefrontApp(slug)
      : {
          appDirectory,
          relativeAppDirectory,
        };

    if (result.relativeAppDirectory) {
      updateStoreStorefrontConfig(slug, {
        appDir: result.relativeAppDirectory,
        status: "scaffolded",
      });
    }

    let repoSync = null;
    let blueprint = await prepareStorefrontDeployment(slug);

    if (blueprint.status === "pending-repo-sync") {
      repoSync = await syncStorefrontRepoForStore(slug);
      blueprint = await prepareStorefrontDeployment(slug);
    }

    const deploymentWindow: DeploymentWindowHandle = await reserveGeneratedDeploymentWindow({
      slug,
      target: "storefront",
    });
    let deployment;

    try {
      deployment = await provisionStorefrontDeploymentForStore(slug, { waitForRuntime: true });

      const authoritySync = await syncStoreAuthorityRepoForStore(slug);

      if (authoritySync.status !== "synced") {
        throw new Error(authoritySync.message || "Store authority repo senkronu tamamlanamadi.");
      }

      await syncOwnerStoresAndMetrics();

      return NextResponse.json(
        {
          success: true,
          slug,
          appDir: result.relativeAppDirectory,
          blueprint,
          repoSync,
          deployment,
        },
        { status: 201 }
      );
    } finally {
      await releaseGeneratedDeploymentWindow(deploymentWindow);
      await syncOwnerStoresAndMetrics().catch(() => undefined);
    }
  } catch (error) {
    if (isRedisLockError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Storefront klasoru olusturulamadi."
      },
      { status: 500 }
    );
  }
}
