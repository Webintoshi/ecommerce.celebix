import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { getStoreDetail } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";
import { seedStarterStorefrontContent } from "@/lib/starter-storefront-seed";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const POST=retiredPlatformMutation;
