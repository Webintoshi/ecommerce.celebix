import { NextResponse } from "next/server";
import { getStoreConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { provisionSupabaseForStore } from "@/lib/supabase-bootstrap";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";

interface ProvisionSupabaseRouteProps {
  params: Promise<{ slug: string }>;
}

export async function POST(_request: Request, { params }: ProvisionSupabaseRouteProps) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const { slug } = await params;
    await ensureStoreConfigFromOwnerAuthority(slug);
    const store = getStoreConfig(slug);

    if (!store) {
      return NextResponse.json({ error: "Magaza bulunamadi." }, { status: 404 });
    }

    const isSelfHostedCoolifyStore = store.supabase.provider === "self_hosted_coolify";

    if (store.bootstrap?.supabaseProvisioning === "configured") {
      return NextResponse.json({ error: "Bu magazanin Supabase baglantisi zaten kurulu." }, { status: 409 });
    }

    if (
      store.bootstrap?.supabaseProvisioning === "failed" &&
      store.supabase.projectRef !== "pending-owner-bootstrap" &&
      !isSelfHostedCoolifyStore
    ) {
      return NextResponse.json(
        {
          error: `Bu magazada daha once acilmis bir Supabase projesi var: ${store.supabase.projectRef}. Yeni proje acilmamasi icin otomatik retry durduruldu.`
        },
        { status: 409 }
      );
    }

    const result = await provisionSupabaseForStore(store);
    await syncOwnerStoresAndMetrics();

    return NextResponse.json(
      {
        success: true,
        slug,
        provider: result.provider,
        projectRef: result.projectRef,
        projectUrl: result.projectUrl,
        dashboardUrl: result.dashboardUrl ?? null,
        organization: result.organization.slug
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Supabase provisioning basarisiz oldu."
      },
      { status: 500 }
    );
  }
}
