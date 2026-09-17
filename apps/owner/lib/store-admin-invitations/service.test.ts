import assert from "node:assert/strict";
import test from "node:test";
import { createInvitationService } from "./service.ts";
import { openInvitationRequest } from "./request-seal.ts";
import type { InvitationCandidate, InvitationIdentityRepository } from "./repository.ts";

const id = "123e4567-e89b-42d3-a456-426614174000", other = "223e4567-e89b-42d3-a456-426614174000";
const authority = { storeId: id, principalId: id, membershipId: id, planId: id, planCode: "starter", planVersion: 1 };
const now = "2026-09-17T00:00:00.000Z", expiresAt = "2026-09-18T00:00:00.000Z";
const config = { apiKey: "re_fake123", sender: "sender@example.com", acceptanceOrigin: "https://accounts.example.com", allowedStoreId: id, allowedRecipient: "recipient@example.com" };
const keyring = { activeKeyId: "invite_01", keys: { invite_01: Buffer.alloc(32, 7) } };
const source = { sourceRecordId: id, sourceRecordVersion: 1, storeId: id, storeName: "Store", email: config.allowedRecipient, displayName: "Recipient", role: "admin" as const, expiresAt };
const view = { id, sourceRecordId: id, email: config.allowedRecipient, displayName: "Recipient", role: "admin" as const, status: "pending" as const, deliveryStatus: "queued" as const, expiresAt, createdAt: now, updatedAt: now, version: 1, generation: 1 };
function setup(overrides: Partial<InvitationIdentityRepository> = {}) {
  const candidates: InvitationCandidate[] = [], fingerprints: string[] = [];
  let saved: typeof view | undefined;
  const repository = {
    async recoverOperation(_a, i) { fingerprints.push(i.fingerprint); return saved ? { kind: "operation_replayed", value: saved } : { kind: "operation_not_found" }; },
    async source() { return { kind: "source", value: source }; },
    async issue(_a, i) { candidates.push(i.candidate); fingerprints.push(i.fingerprint); saved = view; return { kind: "issued", value: view }; },
    async list() { return { kind: "listed", value: { items: [], hasMore: true } }; },
    ...overrides,
  } as InvitationIdentityRepository;
  return { candidates, fingerprints, service: createInvitationService({ repository, config, keyring, clock: () => new Date(now) }) };
}
test("issue seals real rendered request and repeat operation returns original job with no new candidate", async () => {
  const h = setup(), intent = { sourceRecordId: id, expectedRecordVersion: 1, operationId: other };
  assert.deepEqual(await h.service.issue(authority, intent), { kind: "issued", value: view });
  assert.deepEqual(await h.service.issue(authority, intent), { kind: "operation_replayed", value: view });
  assert.equal(h.candidates.length, 1); assert.equal(new Set(h.fingerprints).size, 1);
  const candidate = h.candidates[0]!;
  const request = openInvitationRequest({ version: "ar1", keyId: candidate.keyId, bytes: Buffer.from(candidate.ciphertext, "hex"), digest: candidate.ciphertextDigest }, { invitationId: candidate.invitationId, generation: 1 }, keyring);
  assert.equal(request.to, config.allowedRecipient); assert.match(request.html, /Store/); assert.match(request.text, /#token=[A-Za-z0-9_-]{43}/);
  assert.equal(JSON.stringify(await h.service.list(authority)).includes("hasMore\":true"), true);
});
test("wrong store/recipient and expired source create no durable job and public extra authority is rejected", async () => {
  for (const selected of [{ ...source, storeId: other }, { ...source, email: "other@example.com" }, { ...source, expiresAt: now }]) {
    const h = setup({ async source() { return { kind: "source", value: selected }; } });
    assert.equal((await h.service.issue(authority, { sourceRecordId: id, expectedRecordVersion: 1, operationId: other })).kind, "configuration_unavailable");
    assert.equal(h.candidates.length, 0);
  }
  const h = setup();
  assert.equal((await h.service.issue(authority, { sourceRecordId: id, expectedRecordVersion: 1, operationId: other, storeId: id } as never)).kind, "invalid_input");
  assert.equal(h.candidates.length, 0);
});
test("uncertain issue COMMIT recovers once without reissuing or leaking raw errors", async () => {
  let recoveries = 0, issues = 0;
  const h = setup({ async recoverOperation() { return ++recoveries === 1 ? { kind: "operation_not_found" } : { kind: "operation_replayed", value: view }; }, async issue() { issues++; return { kind: "commit_unknown" }; } });
  assert.deepEqual(await h.service.issue(authority, { sourceRecordId: id, expectedRecordVersion: 1, operationId: other }), { kind: "operation_replayed", value: view });
  assert.equal(issues, 1); assert.equal(recoveries, 2);
  const broken = setup({ async source() { throw new Error("secret-token-provider-body"); } });
  assert.deepEqual(await broken.service.issue(authority, { sourceRecordId: id, expectedRecordVersion: 1, operationId: other }), { kind: "unavailable" });
});
test("resend uses immutable snapshot and next generation; revoke carries no candidate or membership mutation", async () => {
  let candidate: InvitationCandidate | undefined, revoked = 0;
  const h = setup({ async source() { throw new Error("must not read mutable source"); }, async resendSource() { return { kind: "source", value: { ...source, invitationId: id, generation: 2, version: 3 } }; }, async resend(_a, i) { candidate = i.candidate; return { kind: "resent", value: { ...view, generation: 3, version: 4 } }; }, async revoke(_a, i) { assert.equal("candidate" in i, false); revoked++; return { kind: "revoked", value: { ...view, status: "revoked", version: 2 } }; } });
  assert.equal((await h.service.resend(authority, { invitationId: id, expectedVersion: 3, operationId: other })).kind, "resent");
  assert.equal(candidate?.invitationId, id); assert.equal(candidate?.generation, 3);
  assert.equal((await h.service.revoke(authority, { invitationId: id, expectedVersion: 1, operationId: other })).kind, "revoked"); assert.equal(revoked, 1);
});
