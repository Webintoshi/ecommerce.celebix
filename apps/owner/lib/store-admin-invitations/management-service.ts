import { createHmac } from "node:crypto";
import { INVITATION_MANAGEMENT_CODES, parseInvitationManagementRequest, type InvitationManagementRequest, type InvitationManagementResponse } from "../../../../packages/saas-contracts/src/store-admin-invitation-internal-protocol.ts";
import type { createInvitationService } from "./service.ts";
import type { createInvitationManagerResolver } from "./repository.ts";

export function createInvitationManagementService(d: {
  panelOrigin: string; sessionKeys: ReadonlyMap<string, Uint8Array>; clock(): Date;
  resolver: ReturnType<typeof createInvitationManagerResolver>; service: ReturnType<typeof createInvitationService>;
}) {
  const central = new URL(d.panelOrigin).hostname;
  function rejected(code: string): InvitationManagementResponse {
    const safe = INVITATION_MANAGEMENT_CODES.includes(code as never) ? code as typeof INVITATION_MANAGEMENT_CODES[number] : "unavailable";
    return { schemaVersion: 4, kind: "invitation_management_rejected", code: safe, retryable: ["unavailable", "configuration_unavailable", "commit_unknown"].includes(safe) };
  }
  return Object.freeze({ async manage(raw: InvitationManagementRequest): Promise<InvitationManagementResponse> {
    let input: InvitationManagementRequest;
    try { input = parseInvitationManagementRequest(JSON.stringify(raw)); } catch { return rejected("invalid_input"); }
    if (input.requestHostname === central) return rejected("membership_denied");
    try {
      const tokenKeyId = input.sessionCredential.slice(3, -44), key = d.sessionKeys.get(tokenKeyId);
      if (!key || key.byteLength < 32 || key.byteLength > 64) return rejected("membership_denied");
      const now = d.clock(); if (!(now instanceof Date) || !Number.isFinite(+now)) return rejected("unavailable");
      const tokenDigest = createHmac("sha256", key).update(`celebix-panel-session-v1\n${input.sessionCredential}`).digest("hex");
      const resolved = await d.resolver.resolve({ tokenKeyId, tokenDigest, hostname: input.requestHostname, now: new Date(now) });
      if (resolved.kind !== "manager") return rejected(resolved.kind);
      const a = resolved.value;
      if (input.action === "list") {
        const result = await d.service.list(a);
        return "value" in result ? { schemaVersion: 4, kind: "invitation_listed", items: result.value.items, hasMore: result.value.hasMore } : rejected(result.kind);
      }
      const result = input.action === "send" ? await d.service.issue(a, input.intent) : await d.service[input.action](a, input.intent);
      return "value" in result ? { schemaVersion: 4, kind: "invitation_mutated", item: result.value, replayed: result.kind === "operation_replayed" } : rejected(result.kind);
    } catch { return rejected("unavailable"); }
  } });
}
