import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { getStoreDetail } from "@/lib/control-plane";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { provisionAdminDeploymentForStore } from "@/lib/admin-deployment-coolify";
import {
  type DeploymentWindowHandle,
  releaseGeneratedDeploymentWindow,
  reserveGeneratedDeploymentWindow,
} from "@/lib/generated-deployment-guard";
import { isRedisLockError } from "@/lib/redis";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const POST=retiredPlatformMutation;
