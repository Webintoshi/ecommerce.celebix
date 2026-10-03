import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { getStoreDetail } from "@/lib/control-plane";
import { readCoolifySupabaseRuntimeAuthority } from "@/lib/coolify-runtime-authority";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";
import { getStoreSupabaseSecret, upsertStoreSupabaseSecret } from "@/lib/store-secrets";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const POST=retiredPlatformMutation;
