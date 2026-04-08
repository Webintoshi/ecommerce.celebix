import { NextResponse } from "next/server";
import { getStoreDetail, getStoreConsistencyForSlug } from "@/lib/control-plane";
import { getOwnerAuthContext } from "@/lib/owner-auth";

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

  const consistency = await getStoreConsistencyForSlug(auth, slug);

  return NextResponse.json({
    slug,
    health: store.health,
    consistency
  });
}
