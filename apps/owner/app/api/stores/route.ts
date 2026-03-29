import { NextResponse } from "next/server";
import { createStore, getStores } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { listDashboardStores, recordOwnerAuditLog, syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { getSupabaseBootstrapStatus, provisionSupabaseForStore } from "@/lib/supabase-bootstrap";
import { getR2BootstrapStatus, provisionR2ForStore } from "@/lib/r2-bootstrap";

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
    };

    const result = createStore({
      name: body.name ?? "",
      slug: body.slug,
      domain: body.domain ?? "",
      theme: body.theme,
      tagline: body.tagline,
      supportEmail: body.supportEmail,
      supportPhone: body.supportPhone
    });

    const warnings: string[] = [];
    const bootstrapStatus = await getSupabaseBootstrapStatus();
    const r2BootstrapStatus = await getR2BootstrapStatus();

    if (bootstrapStatus.configured) {
      try {
        await provisionSupabaseForStore(result.store);
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "Supabase otomatik kurulumu tamamlanamadi.");
      }
    }

    if (r2BootstrapStatus.configured) {
      try {
        await provisionR2ForStore(result.store);
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "R2 otomatik kurulumu tamamlanamadi.");
      }
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
    const message = error instanceof Error ? error.message : "Magaza olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
