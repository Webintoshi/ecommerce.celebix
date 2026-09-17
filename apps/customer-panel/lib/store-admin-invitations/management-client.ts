import { parseStoreAdminInvitationActionIntent, parseStoreAdminInvitationSendIntent, type StoreAdminInvitationActionIntent, type StoreAdminInvitationSendIntent } from "@celebix/saas-contracts";
import { parseInvitationManagementResponse, type InvitationManagementRequest } from "../../../../packages/saas-contracts/src/store-admin-invitation-internal-protocol.ts";
export function createInvitationManagementClient(fetcher: typeof fetch = fetch) {
  async function request(action: InvitationManagementRequest["action"], intent?: StoreAdminInvitationSendIntent | StoreAdminInvitationActionIntent) {
    try {
      const response = await fetcher(`/api/store-admin-invitations${action === "list" ? "" : `/${action}`}`, { method: action === "list" ? "GET" : "POST", credentials: "same-origin", cache: "no-store", ...(intent ? { headers: { "content-type": "application/json", "x-invitation-csrf": "1" }, body: JSON.stringify(intent) } : {}) });
      if (response.headers.get("content-type")?.split(";")[0] !== "application/json") throw Error("content");
      const text = await response.text(); if (new TextEncoder().encode(text).length > 262144) throw Error("size");
      return parseInvitationManagementResponse(text, response.status === 403 ? 409 : response.status, action);
    } catch { throw Error(action === "list" ? "Davet durumu doğrulanamadı." : "İşlem sonucu belirsiz. Aynı işlemi tekrar kontrol edin."); }
  }
  return Object.freeze({
    async list() { const result = await request("list"); if (result.kind !== "invitation_listed") throw Error("Davet durumu doğrulanamadı."); return { items: result.items, hasMore: result.hasMore }; },
    mutate(action: "send" | "resend" | "revoke", intent: StoreAdminInvitationSendIntent | StoreAdminInvitationActionIntent) { return request(action, action === "send" ? parseStoreAdminInvitationSendIntent(intent) : parseStoreAdminInvitationActionIntent(intent)); },
  });
}
export const invitationManagementClient = createInvitationManagementClient();
