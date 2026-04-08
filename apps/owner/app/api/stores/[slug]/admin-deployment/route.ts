import { NextResponse } from "next/server";
import { getOwnerAuthContext } from "@/lib/owner-auth";
import { getStoreDetail } from "@/lib/control-plane";
import { prepareStoreAdminDeployment } from "@/lib/admin-deployment";

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

  try {
    const deployment = await prepareStoreAdminDeployment(slug);
    return NextResponse.json({ deployment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin deployment hazirlanamadi." },
      { status: 400 }
    );
  }
}
