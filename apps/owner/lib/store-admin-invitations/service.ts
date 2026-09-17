import { createHash, randomUUID } from "node:crypto";
import { parseStoreAdminInvitationActionIntent, parseStoreAdminInvitationSendIntent, parseStoreAdminInvitationView, type StoreAdminInvitationActionIntent, type StoreAdminInvitationSendIntent, type StoreAdminInvitationView } from "@celebix/saas-contracts";
import type { InvitationDeliveryConfig } from "./delivery-config.ts";
import { renderInvitationEmail } from "./email.ts";
import type { InvitationAuthority, InvitationCandidate, InvitationIdentityRepository, InvitationResult, InvitationSource } from "./repository.ts";
import { sealInvitationRequest } from "./request-seal.ts";
import type { InvitationPayloadKeyring } from "./seal.ts";
import { createStoreAdminInvitationToken } from "./token.ts";

type Mutation = InvitationResult<"issued" | "resent" | "revoked" | "operation_replayed", StoreAdminInvitationView>;
interface Dependencies { repository: InvitationIdentityRepository; config: InvitationDeliveryConfig | null; keyring: InvitationPayloadKeyring; clock(): Date }

export function createInvitationService(d: Dependencies) {
  const config = d.config ? Object.freeze({ ...d.config }) : null;
  const now = () => { const value = d.clock(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("clock_invalid"); return new Date(value); };
  function candidate(source: InvitationSource, invitationId: string, generation: number): InvitationCandidate {
    const token = createStoreAdminInvitationToken();
    const request = renderInvitationEmail({ token: token.token, recipient: source.email, sender: config!.sender, displayName: source.displayName, storeName: source.storeName, role: source.role, expiresAt: source.expiresAt, acceptanceOrigin: config!.acceptanceOrigin });
    const sealed = sealInvitationRequest(request, { invitationId, generation }, d.keyring);
    try { return Object.freeze({ invitationId, deliveryId: randomUUID(), tokenDigest: token.digest, generation, sealVersion: "ar1", keyId: sealed.keyId, ciphertext: sealed.bytes.toString("hex"), ciphertextDigest: sealed.digest, rendererVersion: 1 }); }
    finally { sealed.bytes.fill(0); }
  }
  function allowed(a: InvitationAuthority, source: InvitationSource) {
    return config && a.storeId === config.allowedStoreId && source.storeId === a.storeId && source.email === config.allowedRecipient && Date.parse(source.expiresAt) > now().getTime();
  }
  function safe(result: Mutation): Mutation {
    if ("value" in result) return Object.freeze({ kind: result.kind, value: parseStoreAdminInvitationView(result.value) });
    return Object.freeze({ kind: result.kind });
  }
  async function mutate(kind: "issue" | "resend" | "revoke", authority: InvitationAuthority, raw: unknown): Promise<Mutation> {
    let intent: StoreAdminInvitationSendIntent | StoreAdminInvitationActionIntent;
    try { intent = kind === "issue" ? parseStoreAdminInvitationSendIntent(raw) : parseStoreAdminInvitationActionIntent(raw); }
    catch { return { kind: "invalid_input" }; }
    try {
      // Public intent is never merged into authenticated authority.
      const a = Object.freeze({ ...authority });
      const fingerprint = createHash("sha256").update("celebix-store-admin-invitation-operation:v1\n").update(JSON.stringify([kind, a.storeId, a.principalId, a.membershipId, intent])).digest("hex");
      const operation = () => ({ operationId: intent.operationId, fingerprint, now: now() });
      const existing = await d.repository.recoverOperation(a, operation());
      if (existing.kind !== "operation_not_found") return safe(existing);
      if (!config || a.storeId !== config.allowedStoreId) return { kind: "configuration_unavailable" };
      let result: Mutation;
      if (kind === "issue") {
        const input = intent as StoreAdminInvitationSendIntent;
        const source = await d.repository.source(a, { ...input, now: now() });
        if (!('value' in source)) return source;
        if (source.value.sourceRecordId !== input.sourceRecordId || source.value.sourceRecordVersion !== input.expectedRecordVersion || !allowed(a, source.value)) return { kind: "configuration_unavailable" };
        result = await d.repository.issue(a, { ...input, ...operation(), candidate: candidate(source.value, randomUUID(), 1) });
      } else if (kind === "resend") {
        const input = intent as StoreAdminInvitationActionIntent;
        const source = await d.repository.resendSource(a, { ...input, now: now() });
        if (!('value' in source)) return source;
        if (source.value.invitationId !== input.invitationId || source.value.version !== input.expectedVersion || !allowed(a, source.value)) return { kind: "configuration_unavailable" };
        result = await d.repository.resend(a, { ...input, ...operation(), candidate: candidate(source.value, source.value.invitationId, source.value.generation + 1) });
      } else {
        result = await d.repository.revoke(a, { ...intent as StoreAdminInvitationActionIntent, ...operation() });
      }
      if (result.kind === "commit_unknown") {
        const recovered = await d.repository.recoverOperation(a, operation());
        // Absence is not proof of failure while an uncertain transaction may still commit.
        return recovered.kind === "operation_replayed" ? safe(recovered) : { kind: "commit_unknown" };
      }
      return safe(result);
    } catch { return { kind: "unavailable" }; }
  }
  return Object.freeze({
    issue: (a: InvitationAuthority, intent: StoreAdminInvitationSendIntent) => mutate("issue", a, intent),
    resend: (a: InvitationAuthority, intent: StoreAdminInvitationActionIntent) => mutate("resend", a, intent),
    revoke: (a: InvitationAuthority, intent: StoreAdminInvitationActionIntent) => mutate("revoke", a, intent),
    async list(a: InvitationAuthority) {
      try {
        const result = await d.repository.list(a, now());
        if (!("value" in result)) return Object.freeze({ kind: result.kind });
        return Object.freeze({ kind: "listed" as const, value: Object.freeze({ items: Object.freeze(result.value.items.map(parseStoreAdminInvitationView)), hasMore: result.value.hasMore }) });
      } catch { return Object.freeze({ kind: "unavailable" as const }); }
    },
  });
}
