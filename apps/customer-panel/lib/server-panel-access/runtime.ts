import "server-only";

import { normalizeAdminRequestHostname } from "@celebix/saas-data";

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

type AdminHostnameAuthority = Readonly<{
  resolvePublicBrand(input: Readonly<{ hostname: string; now: Date }>): Promise<Readonly<
    | { kind: "resolved"; brand: Readonly<{ storeSlug: string }> }
    | { kind: "admin_host_unknown" | "durable_authority_invalid" | "unavailable" }
  >>;
}>;

export type ServerPanelAccessRuntime = Readonly<{
  readiness: Readonly<{ mode: "disabled" | "approved_staging" | "unavailable" }>;
  panelOrigin: string | null;
  resolveCredential(input: Readonly<{
    credential: string | null;
    requestId: string;
    now: Date;
    hostname?: string | null;
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
  adminHostnames?: AdminHostnameAuthority,
): ServerPanelAccessRuntime {
  if (
    !authority || typeof authority.resolveSession !== "function" ||
    typeof authority.rotateSession !== "function" || typeof authority.recoverOperation !== "function" ||
    typeof authority.revokePrincipalSessions !== "function" || typeof panelOrigin !== "string" ||
    !panelOrigin.startsWith("https://")
  ) {
    throw new Error("server_panel_access_runtime_invalid");
  }
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin,
    async resolveCredential(input) {
      const access = await resolveDurableServerPanelAccess({ ...input, authority });
      if (access.kind !== "authenticated" || adminHostnames === undefined) return access;
      let hostname: string;
      try { hostname = normalizeAdminRequestHostname(input.hostname); } catch { return Object.freeze({ kind: "unauthorized" as const }); }
      if (hostname === new URL(panelOrigin).hostname) return Object.freeze({ kind: "unauthorized" as const });
      try {
        const resolved = await adminHostnames.resolvePublicBrand({ hostname, now: new Date(input.now) });
        return resolved.kind === "resolved" && resolved.brand.storeSlug === access.tenantContext.store.slug
          ? access
          : Object.freeze({ kind: resolved.kind === "unavailable" ? "unavailable" as const : "unauthorized" as const });
      } catch { return Object.freeze({ kind: "unavailable" as const }); }
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
