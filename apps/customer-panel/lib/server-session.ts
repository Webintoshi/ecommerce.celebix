import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { resolveServerPanelSessionFromCookieStore } from "@/lib/server-panel-access/cookie";
import { resolveDefaultServerPanelAccess } from "@/lib/server-panel-access/default";

export async function resolveServerPanelSession() {
  const cookieStore = await cookies();
  return resolveServerPanelSessionFromCookieStore({
    cookieStore,
    requestId: randomUUID(),
    now: new Date(),
    resolve: resolveDefaultServerPanelAccess,
  });
}
