import {retiredPlatformMutation} from '@/lib/platform/legacy';
import { NextResponse } from "next/server";
import { createStore } from "@celebix/platform-config";
import { getOwnerAuthContext, isSuperAdmin } from "@/lib/owner-auth";
import { listDashboardStores, recordOwnerAuditLog } from "@/lib/control-plane";
import { hasUnresolvedCleanupRun } from "@/lib/store-lifecycle";
import { runStoreProvisioningWorkflow } from "@/lib/store-provisioning";
import { isRedisLockError } from "@/lib/redis";

function predictStoreSlug(name: string, explicitSlug?: string): string {
  const candidate = explicitSlug?.trim() || name.trim();

  return candidate
    .toLocaleLowerCase("tr")
    .replace(/Ä±/g, "i")
    .replace(/ÄŸ/g, "g")
    .replace(/Ã¼/g, "u")
    .replace(/ÅŸ/g, "s")
    .replace(/Ã¶/g, "o")
    .replace(/Ã§/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDuration(value: number | string | null | undefined): number | null | undefined {
  if (typeof value === "string") {
    return value.trim().length > 0 ? Number(value) : null;
  }

  return value ?? undefined;
}

export async function GET() {
  const auth = await getOwnerAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "Owner oturumu gerekli." }, { status: 401 });
  }

  const stores = await listDashboardStores(auth);
  return NextResponse.json({ stores });
}

export const POST=retiredPlatformMutation;
