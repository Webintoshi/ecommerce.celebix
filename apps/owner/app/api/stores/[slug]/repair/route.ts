import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { runStoreProvisioningWorkflow } from "@/lib/store-provisioning";
import { isRedisLockError } from "@/lib/redis";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const POST=retiredPlatformMutation;
