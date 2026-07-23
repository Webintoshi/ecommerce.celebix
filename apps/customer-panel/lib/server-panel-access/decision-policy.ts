import type { ServerPanelAccessResult } from "./access.ts";

export class ServerPanelAccessUnavailableError extends Error {
  constructor() { super("panel_access_unavailable"); }
}

type AuthenticatedAccess = Extract<ServerPanelAccessResult, { kind: "authenticated" }>;

export type ServerPanelAccessDecision =
  | Readonly<{ kind: "render"; session: AuthenticatedAccess["session"]; tenantContext: AuthenticatedAccess["tenantContext"] }>
  | Readonly<{ kind: "redirect"; destination: "/login" | "/unauthorized" }>;

export function decideServerPanelAccess(result: ServerPanelAccessResult): ServerPanelAccessDecision {
  if (result.kind === "unauthenticated") return Object.freeze({ kind: "redirect", destination: "/login" });
  if (result.kind === "unauthorized") return Object.freeze({ kind: "redirect", destination: "/unauthorized" });
  if (result.kind === "unavailable") throw new ServerPanelAccessUnavailableError();
  return Object.freeze({ kind: "render", session: result.session, tenantContext: result.tenantContext });
}
