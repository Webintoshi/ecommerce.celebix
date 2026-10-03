import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { getStoreConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { provisionSupabaseForStore } from "@/lib/supabase-bootstrap";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";

interface ProvisionSupabaseRouteProps {
  params: Promise<{ slug: string }>;
}

export const POST=retiredPlatformMutation;
