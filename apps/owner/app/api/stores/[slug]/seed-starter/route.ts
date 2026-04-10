import { NextResponse } from "next/server";
import { getStoreDetail } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";
import { seedStarterStorefrontContent } from "@/lib/starter-storefront-seed";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  const { slug } = await params;
  const store = await getStoreDetail(auth, slug);

  if (!store) {
    return NextResponse.json({ error: "Proje bulunamadi." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
      sourceStorefrontUrl?: string;
    };
    const config = await ensureStoreConfigFromOwnerAuthority(slug);
    const result = await seedStarterStorefrontContent(config, {
      force: Boolean(body.force),
      sourceStorefrontUrl: body.sourceStorefrontUrl,
    });

    return NextResponse.json(
      {
        success: true,
        slug,
        ...result,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Starter storefront content yeniden yazilamadi.",
      },
      { status: 500 },
    );
  }
}
