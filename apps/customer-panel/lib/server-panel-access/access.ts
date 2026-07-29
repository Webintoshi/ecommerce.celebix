import "server-only";

import type { TenantContext } from "@celebix/saas-contracts";

import type { PanelSession } from "../session.ts";
import type {
  PanelSessionResolveResult,
  PostgresPanelSessionRepository,
} from "../panel-session-persistence/postgres-panel-session-repository.ts";

export type ServerPanelSessionAuthority = Pick<PostgresPanelSessionRepository, "resolveSession">;

export type ServerPanelAccessResult =
  | Readonly<{ kind: "authenticated"; session: Readonly<PanelSession>; tenantContext: TenantContext }>
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "unauthorized" }>
  | Readonly<{ kind: "unavailable" }>;

function freeze<T extends object>(value: T): Readonly<T> {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object" && !Object.isFrozen(nested)) freeze(nested);
  }
  return Object.freeze(value);
}

function nonAuthority(kind: "unauthenticated" | "unauthorized" | "unavailable"): ServerPanelAccessResult {
  return Object.freeze({ kind });
}

function projectResolvedAuthority(
  result: Extract<PanelSessionResolveResult, { kind: "resolved" }>,
): ServerPanelAccessResult {
  const { session, tenantContext } = result;
  if (
    !tenantContext ||
    !session.activeStoreId ||
    session.principalId !== tenantContext.principal.id ||
    session.activeStoreId !== tenantContext.store.id
  ) return nonAuthority("unauthorized");

  const safeSession: PanelSession = {
    id: session.sessionId,
    principal: tenantContext.principal,
    activeStoreId: session.activeStoreId,
    createdAt: session.issuedAt,
    rotatedAt: session.rotatedAt,
    expiresAt: session.expiresAt,
  };
  return freeze({
    kind: "authenticated" as const,
    session: freeze(safeSession),
    tenantContext,
  });
}

export async function resolveDurableServerPanelAccess(input: {
  credential: string | null;
  requestId: string;
  now: Date;
  authority: ServerPanelSessionAuthority;
}): Promise<ServerPanelAccessResult> {
  if (input.credential === null) return nonAuthority("unauthenticated");
  let result: PanelSessionResolveResult;
  try {
    result = await input.authority.resolveSession({
      credential: input.credential,
      requestId: input.requestId,
      now: input.now,
    });
  } catch {
    return nonAuthority("unavailable");
  }
  if (result.kind === "resolved") return projectResolvedAuthority(result);
  if (result.kind === "unauthenticated") return nonAuthority("unauthenticated");
  if (result.kind === "unavailable") return nonAuthority("unavailable");
  return nonAuthority("unauthorized");
}
