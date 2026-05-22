import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { isRedisLockError } from "@/lib/redis";
import { migrateStoreDomain } from "@/lib/store-domain-migration";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const body = (await request.json()) as {
      domain?: string;
    };

    const result = await migrateStoreDomain(auth, slug, {
      storefrontDomain: body.domain ?? "",
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Domain migration basarisiz oldu.",
      },
      { status: isRedisLockError(error) ? 409 : 400 },
    );
  }
}
