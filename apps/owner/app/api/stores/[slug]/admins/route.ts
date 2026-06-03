import { NextResponse } from "next/server";
import { assertStoreConsistencyForAdminMutation, createOrAssignStoreAdmin } from "@/lib/control-plane";
import { getOwnerAuthContext } from "@/lib/owner-auth";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "Owner oturumu gerekli." }, { status: 401 });
  }

  const previewBlock = blockOwnerActionInPreview("write");

  if (previewBlock) {
    return previewBlock;
  }

  try {
    const { slug } = await params;
    const body = (await request.json()) as {
      email?: string;
      fullName?: string;
      password?: string;
      role?: "super_admin" | "product_manager" | "content_creator" | "order_manager";
      taskDefinition?: string;
    };

    const email = body.email?.trim() || "";
    const password = body.password || "";
    const role = body.role;

    if (!slug || !email || !password || !role) {
      return NextResponse.json({ error: "Tum store admin alanlari zorunludur." }, { status: 400 });
    }

    await assertStoreConsistencyForAdminMutation(auth, slug, "Store admin atamasi yapmadan");

    const result = await createOrAssignStoreAdmin(auth, {
      email,
      fullName: body.fullName,
      password,
      role,
      storeSlug: slug,
      taskDefinition: body.taskDefinition
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Store admin kaydedilemedi."
      },
      { status: 400 }
    );
  }
}
