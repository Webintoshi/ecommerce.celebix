import "server-only";

import {
  resolveDurableServerPanelAccess,
  type ServerPanelAccessResult,
  type ServerPanelSessionAuthority,
} from "./access.ts";

export type ServerPanelAccessRuntime = Readonly<{
  readiness: Readonly<{ mode: "disabled" | "approved_staging" | "unavailable" }>;
  resolveCredential(input: Readonly<{
    credential: string | null;
    requestId: string;
    now: Date;
  }>): Promise<ServerPanelAccessResult>;
}>;

const UNAUTHENTICATED = Object.freeze({ kind: "unauthenticated" as const });
const UNAVAILABLE = Object.freeze({ kind: "unavailable" as const });

export function createDisabledServerPanelAccessRuntime(): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode: "disabled" as const }),
    async resolveCredential() { return UNAUTHENTICATED; },
  });
}

export function createUnavailableServerPanelAccessRuntime(): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode: "unavailable" as const }),
    async resolveCredential(input) { return input.credential === null ? UNAUTHENTICATED : UNAVAILABLE; },
  });
}

export function createApprovedStagingServerPanelAccessRuntime(
  authority: ServerPanelSessionAuthority,
): ServerPanelAccessRuntime {
  if (!authority || typeof authority.resolveSession !== "function") {
    throw new Error("server_panel_access_runtime_invalid");
  }
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    async resolveCredential(input) {
      return resolveDurableServerPanelAccess({ ...input, authority });
    },
  });
}
