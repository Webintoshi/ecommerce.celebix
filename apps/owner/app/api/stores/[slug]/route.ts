import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { getStoreDetail, updateStoreManagementProfile } from "@/lib/control-plane";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
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

export const PATCH=retiredPlatformMutation;

export const DELETE=retiredPlatformMutation;
