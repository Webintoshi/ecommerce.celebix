import { NextResponse } from "next/server";
import { createOrAssignAffiliate } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";

export async function POST(request: Request) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      email?: string;
      fullName?: string;
      password?: string;
      storeSlug?: string;
      commissionRate?: number;
    };

    const email = body.email?.trim() || "";
    const password = body.password || "";
    const storeSlug = body.storeSlug?.trim() || "";
    const commissionRate = Number(body.commissionRate ?? 0);

    if (!email || !password || !storeSlug || Number.isNaN(commissionRate)) {
      return NextResponse.json({ error: "Tum affiliate alanlari zorunludur." }, { status: 400 });
    }

    const result = await createOrAssignAffiliate({
      actorId: auth.user.id,
      email,
      fullName: body.fullName,
      password,
      storeSlug,
      commissionRate
    });

    return NextResponse.json({ success: true, affiliate: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Affiliate kaydedilemedi."
      },
      { status: 400 }
    );
  }
}
