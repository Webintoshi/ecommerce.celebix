import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { assertStoreConsistencyForAdminMutation, createOrAssignStoreAdmin } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const POST=retiredPlatformMutation;
