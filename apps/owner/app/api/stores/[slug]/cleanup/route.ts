import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { cleanupStoreResources } from "@/lib/store-cleanup";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const force = body && typeof body === "object" && "force" in body ? Boolean((body as { force?: unknown }).force) : false;
    const result = await cleanupStoreResources(auth.user.id, slug, { force });
    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Proje cleanup islemi basarisiz oldu.",
      },
      { status: 500 },
    );
  }
}
