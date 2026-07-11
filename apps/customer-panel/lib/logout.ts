import { PANEL_LOGOUT_REDIRECT } from "./config.ts";
import { rejectInvalidPanelMutation } from "./request-security.ts";
import {
  buildPanelSessionClearCookie,
  getPanelSessionCookieName,
  isValidPanelSessionId,
  type PanelSessionCookiePolicy,
  type PanelSessionStore,
} from "./session.ts";

interface PanelLogoutDependencies {
  enabled: boolean;
  sessionStore: PanelSessionStore;
  cookiePolicy: PanelSessionCookiePolicy;
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function unavailable() {
  return Response.json(
    { code: "panel_auth_disabled" },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

function cleared(policy: PanelSessionCookiePolicy) {
  return new Response(null, {
    status: 303,
    headers: {
      location: PANEL_LOGOUT_REDIRECT,
      "cache-control": "no-store",
      "set-cookie": buildPanelSessionClearCookie(policy),
    },
  });
}

export function createPanelLogoutHandler(dependencies: PanelLogoutDependencies) {
  return async function panelLogout(request: Request) {
    const rejected = rejectInvalidPanelMutation(request);
    if (rejected) return rejected;
    if (!dependencies.enabled) return unavailable();

    const sessionId = readCookie(
      request,
      getPanelSessionCookieName(dependencies.cookiePolicy),
    );
    if (!sessionId || !isValidPanelSessionId(sessionId)) {
      return cleared(dependencies.cookiePolicy);
    }

    try {
      await dependencies.sessionStore.destroy(sessionId);
    } catch {
      return Response.json(
        { code: "panel_session_retry_required" },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    return cleared(dependencies.cookiePolicy);
  };
}
