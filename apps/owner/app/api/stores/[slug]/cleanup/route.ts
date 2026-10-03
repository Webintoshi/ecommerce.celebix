import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { cleanupStoreResources } from "@/lib/store-cleanup";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const DELETE=retiredPlatformMutation;
