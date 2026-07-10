import "server-only";

import { cookies } from "next/headers";
import {
  DisabledPanelSessionStore,
  PANEL_SESSION_COOKIE_NAME,
  resolvePanelSession,
} from "@/lib/session";

const productionSessionStore = new DisabledPanelSessionStore();

export async function resolveServerPanelSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PANEL_SESSION_COOKIE_NAME)?.value ?? null;
  return resolvePanelSession(sessionId, productionSessionStore);
}
