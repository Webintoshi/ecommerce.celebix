import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { getStoreConfig } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { syncOwnerStoresAndMetrics, updateOwnerStoreR2Authority } from "@/lib/control-plane";
import { provisionR2ForStore } from "@/lib/r2-bootstrap";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";

interface ProvisionR2RouteProps {
  params: Promise<{ slug: string }>;
}

export const POST=retiredPlatformMutation;
