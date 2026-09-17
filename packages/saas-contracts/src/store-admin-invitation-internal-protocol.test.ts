import assert from "node:assert/strict";
import test from "node:test";
import { parseInvitationResponse, parseInvitationConfirmationReady } from "./store-admin-invitation-internal-protocol.ts";
const now = new Date("2026-09-17T12:00:00.000Z"), expiry = "2026-09-17T12:04:00.000Z", callback = "https://panel.example.test/auth/callback";
const token = Buffer.alloc(32, 1).toString("base64url");
test("strict internal invitation response parser rejects authority extras, wrong operation, deadlines, status and discriminants", () => {
  const good = { schemaVersion: 3, kind: "invitation_confirmation", storeName: "Store", email: "recipient@example.test", role: "admin", expiresAt: expiry };
  assert.equal(parseInvitationResponse(JSON.stringify(good), 200, callback, now, "invitation_preview").kind, "invitation_confirmation");
  for (const mutation of [{ issuer: "injected" }, { subject: "injected" }, { grantCredential: `ig1.${token}` }, { role: "owner" }, { kind: "unknown" }, { expiresAt: "2026-09-17T12:06:00.000Z" }, { expiresAt: now.toISOString() }, { schemaVersion: 2 }]) assert.throws(() => parseInvitationResponse(JSON.stringify({ ...good, ...mutation }), 200, callback, now, "invitation_preview"));
  assert.throws(() => parseInvitationResponse(JSON.stringify(good), 200, callback, now, "invitation_accept"));
  assert.throws(() => parseInvitationResponse(JSON.stringify(good), 503, callback, now, "invitation_preview"));
  assert.throws(() => parseInvitationResponse(" " + JSON.stringify(good), 200, callback, now, "invitation_preview"));
});
test("accepted-access-retry is exact and cannot become a generic rejection or a success status", () => {
  const good = { schemaVersion: 3, kind: "invitation_accepted_access_retry", accepted: true, retryable: true };
  assert.deepEqual(parseInvitationResponse(JSON.stringify(good), 503, callback, now, "invitation_accept"), good);
  for (const mutation of [{ accepted: false }, { retryable: false }, { credential: `v1.test.${token}` }]) assert.throws(() => parseInvitationResponse(JSON.stringify({ ...good, ...mutation }), 503, callback, now, "invitation_accept"));
  assert.throws(() => parseInvitationResponse(JSON.stringify(good), 200, callback, now, "invitation_accept"));
});
test("callback continuation has literal path, canonical grant, no identity and original bounded deadline", () => {
  const good = { schemaVersion: 2, kind: "invitation_confirmation_ready", grantCredential: `ig1.${token}`, grantExpiresAt: expiry, continuationPath: "/invitations/confirm" };
  assert.deepEqual(parseInvitationConfirmationReady(JSON.stringify(good), now), good);
  for (const mutation of [{ continuationPath: "/invitations/confirm?token=secret" }, { grantExpiresAt: "2026-09-17T12:06:00.000Z" }, { email: "recipient@example.test" }, { grantCredential: `ig1.${token.slice(0, -1)}B` }]) assert.throws(() => parseInvitationConfirmationReady(JSON.stringify({ ...good, ...mutation }), now));
});
