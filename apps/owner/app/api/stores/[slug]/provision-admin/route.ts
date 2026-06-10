import { NextResponse } from "next/server";
import { getStoreDetail } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { provisionAdminDeploymentForStore } from "@/lib/admin-deployment-coolify";
import { syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";
import {
  type DeploymentWindowHandle,
  releaseGeneratedDeploymentWindow,
  reserveGeneratedDeploymentWindow,
} from "@/lib/generated-deployment-guard";
import { isRedisLockError } from "@/lib/redis";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";
import { syncAdminRepoForStore, syncStoreAuthorityRepoForStore } from "@/lib/storefront-repo-sync";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(_: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  const previewBlock = blockOwnerActionInPreview("deploy");

  if (previewBlock) {
    return previewBlock;
  }

  const { slug } = await params;
  const store = await getStoreDetail(auth, slug);

  if (!store) {
    return NextResponse.json({ error: "Proje bulunamadi." }, { status: 404 });
  }

  try {
    await ensureStoreConfigFromOwnerAuthority(slug);
    const deploymentWindow: DeploymentWindowHandle = await reserveGeneratedDeploymentWindow({
      slug,
      target: "admin",
    });

    try {
      const adminRepoSync = await syncAdminRepoForStore(slug);

      if (adminRepoSync.status !== "synced") {
        throw new Error(adminRepoSync.message || "Admin repo senkronu tamamlanamadi.");
      }

      const deployment = await provisionAdminDeploymentForStore(slug, { waitForRuntime: true });
      const authoritySync = await syncStoreAuthorityRepoForStore(slug);

      if (authoritySync.status !== "synced") {
        throw new Error(authoritySync.message || "Store authority repo senkronu tamamlanamadi.");
      }

      await syncOwnerStoresAndMetrics();
      return NextResponse.json({ success: true, deployment }, { status: 200 });
    } finally {
      await releaseGeneratedDeploymentWindow(deploymentWindow);
      await syncOwnerStoresAndMetrics().catch(() => undefined);
    }
  } catch (error) {
    if (isRedisLockError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin deployment otomasyonu basarisiz oldu." },
      { status: 500 }
    );
  }
}
