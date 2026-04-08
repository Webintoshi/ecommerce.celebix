import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getStoreConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { scaffoldStorefrontApp } from "@/lib/storefront-scaffold";
import { prepareStorefrontDeployment } from "@/lib/storefront-deployment";
import { provisionStorefrontDeploymentForStore } from "@/lib/storefront-deployment-coolify";
import { getRepoRoot } from "@celebix/platform-config";

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
    const store = getStoreConfig(slug);

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
      ? scaffoldStorefrontApp(slug)
      : {
          appDirectory,
          relativeAppDirectory,
        };

    const blueprint = await prepareStorefrontDeployment(slug);
    const deployment = await provisionStorefrontDeploymentForStore(slug);
    await syncOwnerStoresAndMetrics();

    return NextResponse.json(
      {
        success: true,
        slug,
        appDir: result.relativeAppDirectory,
        blueprint,
        deployment,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Storefront klasoru olusturulamadi."
      },
      { status: 500 }
    );
  }
}
