import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { getStoreDetail, updateStoreManagementProfile } from "@/lib/control-plane";
import { cleanupStoreResources } from "@/lib/store-cleanup";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "Owner oturumu gerekli." }, { status: 401 });
  }

  const { slug } = await params;
  const store = await getStoreDetail(auth, slug);

  if (!store) {
    return NextResponse.json({ error: "Proje bulunamadi." }, { status: 404 });
  }

  return NextResponse.json({ store });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const body = (await request.json()) as {
      status?: "draft" | "active" | "paused";
      tagline?: string;
      supportEmail?: string;
      supportPhone?: string;
      clientCompanyName?: string;
      clientContactName?: string;
      clientContactEmail?: string;
      clientContactPhone?: string;
      internalOwner?: string;
      lifecycleStage?: "onboarding" | "building" | "launch_ready" | "live" | "growth";
      priority?: "normal" | "high" | "critical";
      nextAction?: string;
      launchTarget?: string;
      ownerNotes?: string;
      billingStatus?: "healthy" | "follow_up" | "hold";
      packageStartDate?: string;
      packageDurationMonths?: number | null;
    };

    await updateStoreManagementProfile(auth, slug, {
      ...body,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Proje guncellenemedi."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      confirmSlug?: string;
    };

    if ((body.confirmSlug ?? "").trim().toLocaleLowerCase("tr") !== slug.toLocaleLowerCase("tr")) {
      return NextResponse.json(
        { error: "Silme onayi icin proje slug bilgisini dogru girmeniz gerekiyor." },
        { status: 400 },
      );
    }

    const result = await cleanupStoreResources(auth.user.id, slug, {
      force: true,
      allowNonDisposable: true,
    });

    if (!result.deleted) {
      return NextResponse.json(
        {
          error: "Proje tam olarak silinemedi. Detaylar result icinde dondu.",
          result,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proje silinemedi.";
    const status = /bulunamadi/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
