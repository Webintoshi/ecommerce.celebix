import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { getStoreDetail, updateStoreManagementProfile } from "@/lib/control-plane";

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
    };

    if (!body.status) {
      return NextResponse.json({ error: "Proje durumu zorunludur." }, { status: 400 });
    }

    await updateStoreManagementProfile(auth, slug, {
      ...body,
      status: body.status
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
