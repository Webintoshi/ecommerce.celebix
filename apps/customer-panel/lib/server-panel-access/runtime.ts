import "server-only";

import {
  resolveDurableServerPanelAccess,
  type ServerPanelAccessResult,
  type ServerPanelSessionAuthority,
} from "./access.ts";
import {
  revokePersistentPanelSessionCredential,
  rotatePersistentPanelSessionCredential,
  type PanelSessionRevocationAuthority,
  type PanelSessionRevocationResult,
  type PanelSessionRotationAuthority,
  type PanelSessionRotationResult,
} from "../server-panel-session-controls/mutation.ts";

type ServerPanelRuntimeAuthority = ServerPanelSessionAuthority &
  PanelSessionRotationAuthority & PanelSessionRevocationAuthority;

export type ServerPanelAccessRuntime = Readonly<{
  readiness: Readonly<{ mode: "disabled" | "approved_staging" | "unavailable" }>;
  panelOrigin: string | null;
  resolveCredential(input: Readonly<{
    credential: string | null;
    requestId: string;
    now: Date;
  }>): Promise<ServerPanelAccessResult>;
  rotateCredential(input: Readonly<{
    currentCredential: string;
    operationId: string;
    requestedStoreId: string;
    now: Date;
  }>): Promise<PanelSessionRotationResult>;
  revokeCredential(input: Readonly<{
    credential: string;
    reason: "logout";
    now: Date;
  }>): Promise<PanelSessionRevocationResult>;
}>;

const UNAUTHENTICATED = Object.freeze({ kind: "unauthenticated" as const });
const UNAVAILABLE = Object.freeze({ kind: "unavailable" as const });

export function createDisabledServerPanelAccessRuntime(): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode: "disabled" as const }),
    panelOrigin: null,
    async resolveCredential() { return UNAUTHENTICATED; },
    async rotateCredential() { return UNAVAILABLE; },
    async revokeCredential() { return UNAVAILABLE; },
  });
}

export function createUnavailableServerPanelAccessRuntime(): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode: "unavailable" as const }),
    panelOrigin: null,
    async resolveCredential(input) { return input.credential === null ? UNAUTHENTICATED : UNAVAILABLE; },
    async rotateCredential() { return UNAVAILABLE; },
    async revokeCredential() { return UNAVAILABLE; },
  });
}

export function createApprovedStagingServerPanelAccessRuntime(
  authority: ServerPanelRuntimeAuthority,
  panelOrigin: string,
): ServerPanelAccessRuntime {
  if (
    !authority || typeof authority.resolveSession !== "function" ||
    typeof authority.rotateSession !== "function" || typeof authority.recoverOperation !== "function" ||
    typeof authority.revokeSession !== "function" || typeof panelOrigin !== "string" ||
    !panelOrigin.startsWith("https://")
  ) {
    throw new Error("server_panel_access_runtime_invalid");
  }
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin,
    async resolveCredential(input) {
      return resolveDurableServerPanelAccess({ ...input, authority });
    },
    async rotateCredential(input) {
      return rotatePersistentPanelSessionCredential({ ...input, authority });
    },
    async revokeCredential(input) {
      if (input.reason !== "logout") return UNAVAILABLE;
      return revokePersistentPanelSessionCredential({ ...input, authority });
    },
  });
}
