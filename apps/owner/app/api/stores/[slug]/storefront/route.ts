import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getStoreConfig, repairStoreConfig, updateStoreStorefrontConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { syncOwnerStoresAndMetrics } from "@/lib/control-plane";
import { scaffoldStorefrontApp } from "@/lib/storefront-scaffold";
import { prepareStorefrontDeployment } from "@/lib/storefront-deployment";
import { provisionStorefrontDeploymentForStore } from "@/lib/storefront-deployment-coolify";
import { getRepoRoot } from "@celebix/platform-config";
import { syncStorefrontRepoForStore } from "@/lib/storefront-repo-sync";
import {
  type DeploymentWindowHandle,
  releaseGeneratedDeploymentWindow,
  reserveGeneratedDeploymentWindow,
} from "@/lib/generated-deployment-guard";
import { isRedisLockError } from "@/lib/redis";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";

interface StorefrontRouteProps {
  params: Promise<{ slug: string }>;
}

export const POST=retiredPlatformMutation;
