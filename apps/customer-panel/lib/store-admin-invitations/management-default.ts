import "server-only";
import { randomUUID } from "node:crypto";
import { CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS, parseCustomerPanelStagingAuthConfig } from "../panel-auth-authority/config.ts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { createAuthenticatedPanelBrowserBindingTransport } from "../panel-browser-binding-bootstrap/transport.ts";
import { createPanelBrowserBindingBootstrapApproval } from "../panel-browser-binding-bootstrap/activation.ts";
import { createInvitationManagementHttp, type InvitationManagementRuntime } from "./management-http.ts";
import { invitationPanelGate } from "./management-runtime.ts";
let ready: Promise<InvitationManagementRuntime | null> | undefined;
async function resolveRuntime() {
  if (process.env.CELEBIX_ADMIN_INVITATIONS_ENABLED !== "true") return null;
  return ready ??= (async () => {
    try {
      const config = parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map(name => [name, process.env[name]])));
      if (!invitationPanelGate(process.env, config)) return null;
      const access = await resolveDefaultServerPanelAccessRuntime(); if (access.readiness.mode !== "approved_staging" || access.panelOrigin !== config.authority.panelOrigin) return null;
      const transport = createAuthenticatedPanelBrowserBindingTransport({ activationApproval: createPanelBrowserBindingBootstrapApproval("approved_staging"), ownerInternalOrigin: config.authority.ownerOrigin, panelCallbackAuthority: config.authority.panelCallbackUrl, activeKeyId: config.keys.browserInternalKeyId, activeSecret: config.keys.browserInternal, fetch: globalThis.fetch, clock: () => new Date(), deadlineMs: 5000, maximumResponseBytes: 16384, audit() {} });
      return { access, manage: transport.manageInvitation };
    } catch { return null; }
  })();
}
export const handleInvitationManagement = createInvitationManagementHttp({ resolveRuntime, now: () => new Date(), requestId: randomUUID });
