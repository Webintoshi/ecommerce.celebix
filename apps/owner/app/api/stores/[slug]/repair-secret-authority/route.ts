import { NextResponse } from "next/server";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { getStoreDetail } from "@/lib/control-plane";
import { readCoolifySupabaseRuntimeAuthority } from "@/lib/coolify-runtime-authority";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { blockOwnerActionInPreview } from "@/lib/preview-action-guard";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";
import { getStoreSupabaseSecret, upsertStoreSupabaseSecret } from "@/lib/store-secrets";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(_: Request, { params }: RouteContext) {
  const auth = await getOwnerAuthContext();

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: "Bu islem icin super admin gerekli." }, { status: 403 });
  }

  const previewBlock = blockOwnerActionInPreview("repair");

  if (previewBlock) {
    return previewBlock;
  }

  const { slug } = await params;
  const store = await getStoreDetail(auth, slug);

  if (!store) {
    return NextResponse.json({ error: "Proje bulunamadi." }, { status: 404 });
  }

  try {
    const config = await ensureStoreConfigFromOwnerAuthority(slug);
    const resourceId = config.bootstrap?.supabaseResourceId?.trim() || null;
    const runtimeAuthority = await readCoolifySupabaseRuntimeAuthority(resourceId || "");

    if (runtimeAuthority) {
      await upsertStoreSupabaseSecret({
        slug,
        supabaseUrl: runtimeAuthority.publicUrl,
        supabaseServiceRoleKey: runtimeAuthority.serviceKey,
        supabaseAnonKey: runtimeAuthority.publicKey,
      });

      const serviceClient = createOwnerServiceClient();
      const currentMetadata =
        (await serviceClient
          .from("owner_stores")
          .select("metadata")
          .eq("slug", slug)
          .maybeSingle<{ metadata: Record<string, unknown> | null }>()).data?.metadata ?? {};
      const nextMetadata = {
        ...(currentMetadata ?? {}),
        bootstrap: {
          ...(((currentMetadata ?? {}) as Record<string, unknown>).bootstrap as Record<string, unknown> | undefined),
          supabaseDashboardUrl: runtimeAuthority.dashboardUrl,
        },
      };
      await serviceClient
        .from("owner_stores")
        .update({
          supabase_url: runtimeAuthority.publicUrl,
          metadata: nextMetadata,
        })
        .eq("slug", slug);
    }

    const secret = await getStoreSupabaseSecret(slug);

    return NextResponse.json(
      {
        success: true,
        repaired: Boolean(secret?.supabase_anon_key?.trim()),
        resourceId,
        coolifyConfigured: Boolean(process.env.COOLIFY_API_URL?.trim() && process.env.COOLIFY_API_TOKEN?.trim()),
        runtimeAuthorityFound: Boolean(runtimeAuthority),
        hasSecretUrl: Boolean(secret?.supabase_url?.trim()),
        hasSecretAnonKey: Boolean(secret?.supabase_anon_key?.trim()),
        hasSecretServiceRoleKey: Boolean(secret?.supabase_service_role_key?.trim()),
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Secret authority onarimi basarisiz oldu." },
      { status: 500 }
    );
  }
}
