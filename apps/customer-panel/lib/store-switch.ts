import type { StoreMembership } from "@celebix/saas-contracts";
import { rejectInvalidPanelMutation } from "./request-security.ts";
import {
  buildPanelSessionSetCookie,
  rotatePanelSessionForStore,
  type PanelSession,
  type PanelSessionCookiePolicy,
  type PanelSessionStore,
} from "./session.ts";

interface StoreSwitchDependencies {
  resolveSession(request: Request): Promise<PanelSession | null>;
  getMemberships(principalId: string): Promise<readonly StoreMembership[]>;
  sessionStore: PanelSessionStore;
  cookiePolicy: PanelSessionCookiePolicy;
  now?: () => Date;
}

function json(code: string, status: number) {
  return Response.json({ code }, { status, headers: { "cache-control": "no-store" } });
}

export function createPanelStoreSwitchHandler(dependencies: StoreSwitchDependencies) {
  return async function panelStoreSwitch(request: Request) {
    const rejected = rejectInvalidPanelMutation(request);
    if (rejected) return rejected;

    const session = await dependencies.resolveSession(request).catch(() => null);
    if (!session) return json("unauthenticated", 401);

    let storeId = "";
    try {
      const body = await request.json() as { storeId?: unknown };
      storeId = typeof body.storeId === "string" ? body.storeId : "";
    } catch {
      return json("invalid_input", 400);
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(storeId)) return json("invalid_input", 400);

    const memberships = await dependencies.getMemberships(session.principal.id).catch(() => []);
    const rotated = await rotatePanelSessionForStore({
      store: dependencies.sessionStore,
      session,
      memberships,
      selectionHint: storeId,
      now: dependencies.now?.() ?? new Date(),
    });
    if (!rotated.ok) return json(rotated.error.code, rotated.error.code === "unauthenticated" ? 401 : 403);

    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        "set-cookie": buildPanelSessionSetCookie(rotated.session.id, dependencies.cookiePolicy),
      },
    });
  };
}
