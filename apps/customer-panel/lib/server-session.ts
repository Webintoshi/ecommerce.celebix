import "server-only";

import { randomUUID } from "node:crypto";

import { cookies, headers } from "next/headers";
import { resolveServerPanelSessionFromCookieStore } from "@/lib/server-panel-access/cookie";
import { resolveDefaultServerPanelAccess } from "@/lib/server-panel-access/default";

export async function resolveServerPanelSession() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return resolveServerPanelSessionFromCookieStore({
    cookieStore,
    requestId: randomUUID(),
    now: new Date(),
    hostname: headerStore.get("host"),
    resolve: resolveDefaultServerPanelAccess,
  });
}
