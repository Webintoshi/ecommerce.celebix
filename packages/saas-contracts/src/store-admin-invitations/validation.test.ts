import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STORE_ADMIN_INVITATION_DELIVERY_STATUSES,
  STORE_ADMIN_INVITATION_ROLES,
  STORE_ADMIN_INVITATION_STATUSES,
  normalizeStoreAdminInvitationEmail,
  parseStoreAdminInvitationActionIntent,
  parseStoreAdminInvitationSendIntent,
  parseStoreAdminInvitationView,
} from "./index.ts";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_RECORD_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const INVALID = "invalid_store_admin_invitation";

const invitation = {
  id: INVITATION_ID,
  sourceRecordId: SOURCE_RECORD_ID,
  email: "recipient+pilot@example.com",
  displayName: "Pilot Recipient",
  role: "admin",
  status: "pending",
  deliveryStatus: "queued",
  expiresAt: "2026-09-23T19:00:00.000Z",
  createdAt: "2026-09-16T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z",
  version: 1,
  generation: 1,
};

function rejectsInvalid(run: () => unknown): void {
  assert.throws(run, (error: unknown) => error instanceof TypeError && error.message === INVALID);
}

test("canonical email is shared with acceptance without rewriting mailbox aliases", () => {
  assert.equal(normalizeStoreAdminInvitationEmail("  Recipient+Pilot@Example.COM "), "recipient+pilot@example.com");
  assert.equal(normalizeStoreAdminInvitationEmail("first.last@example.com"), "first.last@example.com");

  for (const invalid of [
    "a\n@example.com",
    "x@y",
    "ü@example.com",
    "x+<bad>@example.com",
    "a b@example.com",
    '"quoted"@example.com',
    `${"a".repeat(65)}@example.com`,
    `${"a".repeat(243)}@example.com`,
    "x@-example.com",
    "x@example-.com",
    "x@example..com",
    "\u00a0recipient@example.com\u00a0",
    "\ufeffrecipient@example.com\ufeff",
    "\trecipient@example.com\t",
    "\nrecipient@example.com\n",
    null,
  ]) rejectsInvalid(() => normalizeStoreAdminInvitationEmail(invalid));
});

test("public invitation projection supports every invitation and delivery state", () => {
  assert.deepEqual(STORE_ADMIN_INVITATION_ROLES, ["admin", "editor", "analyst"]);
  assert.deepEqual(STORE_ADMIN_INVITATION_STATUSES, ["pending", "accepted", "revoked", "expired"]);
  assert.deepEqual(STORE_ADMIN_INVITATION_DELIVERY_STATUSES, ["queued", "sending", "provider_accepted", "delivered", "failed", "outcome_unknown"]);

  for (const status of STORE_ADMIN_INVITATION_STATUSES) {
    for (const deliveryStatus of [null, ...STORE_ADMIN_INVITATION_DELIVERY_STATUSES] as const) {
      const input: Record<string, unknown> = { ...invitation, status, deliveryStatus };
      const output = parseStoreAdminInvitationView(input);
      assert.deepEqual(output, input);
      assert.notStrictEqual(output, input);
      assert.equal(Object.isFrozen(output), true);
    }
  }
});

test("public invitation projection canonicalizes valid UTC whole-second timestamps", () => {
  const output = parseStoreAdminInvitationView({
    ...invitation,
    expiresAt: "2026-09-23T19:00:00Z",
    createdAt: "2026-09-16T12:00:00Z",
  });
  assert.equal(output.expiresAt, "2026-09-23T19:00:00.000Z");
  assert.equal(output.createdAt, "2026-09-16T12:00:00.000Z");
});

test("public invitation projection rejects private or unknown fields", () => {
  for (const key of ["token", "digest", "providerResponse", "storeId", "inviterPrincipalId"]) {
    rejectsInvalid(() => parseStoreAdminInvitationView({ ...invitation, [key]: "secret" }));
  }
});

test("public invitation projection rejects malformed identifiers, enums, text, timestamps and counters", () => {
  const invalidFields: ReadonlyArray<readonly [string, unknown]> = [
    ["id", "not-a-uuid"],
    ["sourceRecordId", "11111111-1111-0111-8111-111111111111"],
    ["role", "store_owner"],
    ["status", "active"],
    ["deliveryStatus", "sent"],
    ["displayName", ""],
    ["displayName", " Pilot Recipient "],
    ["displayName", "unsafe<script>"],
    ["displayName", "line\nbreak"],
    ["displayName", "x".repeat(161)],
    ["expiresAt", "2026-09-23"],
    ["createdAt", "2026-02-30T12:00:00Z"],
    ["updatedAt", "2026-09-16T12:00:00.00Z"],
    ["version", 0],
    ["version", 1.5],
    ["version", Number.MAX_SAFE_INTEGER + 1],
    ["generation", Number.NaN],
    ["generation", -1],
  ];
  for (const [key, value] of invalidFields) rejectsInvalid(() => parseStoreAdminInvitationView({ ...invitation, [key]: value }));
});

test("send intent carries source identity and concurrency data but no invitation authority", () => {
  const input = { sourceRecordId: SOURCE_RECORD_ID, expectedRecordVersion: 2, operationId: OPERATION_ID };
  const output = parseStoreAdminInvitationSendIntent(input);
  assert.deepEqual(output, input);
  assert.notStrictEqual(output, input);
  assert.equal(Object.isFrozen(output), true);

  for (const key of ["email", "role", "expiresAt", "storeId", "inviterPrincipalId", "token"]) {
    rejectsInvalid(() => parseStoreAdminInvitationSendIntent({ ...input, [key]: key === "role" ? "store_owner" : "injected" }));
  }
  rejectsInvalid(() => parseStoreAdminInvitationSendIntent({ ...input, sourceRecordId: "bad" }));
  rejectsInvalid(() => parseStoreAdminInvitationSendIntent({ ...input, expectedRecordVersion: 0 }));
  rejectsInvalid(() => parseStoreAdminInvitationSendIntent({ ...input, operationId: "bad" }));
});

test("action intent is exact and reusable for resend and revoke", () => {
  const input = { invitationId: INVITATION_ID, expectedVersion: 3, operationId: OPERATION_ID };
  const output = parseStoreAdminInvitationActionIntent(input);
  assert.deepEqual(output, input);
  assert.notStrictEqual(output, input);
  assert.equal(Object.isFrozen(output), true);

  for (const malformed of [
    { ...input, invitationId: "bad" },
    { ...input, expectedVersion: 0 },
    { ...input, operationId: "bad" },
    { ...input, storeId: INVITATION_ID },
    { ...input, role: "admin" },
  ]) rejectsInvalid(() => parseStoreAdminInvitationActionIntent(malformed));
});

test("parsers reject non-plain objects and accessor-backed inputs", () => {
  rejectsInvalid(() => parseStoreAdminInvitationView(Object.assign(Object.create({}), invitation)));
  rejectsInvalid(() => parseStoreAdminInvitationSendIntent(Object.create(null, {
    sourceRecordId: { enumerable: true, get: () => SOURCE_RECORD_ID },
    expectedRecordVersion: { enumerable: true, value: 1 },
    operationId: { enumerable: true, value: OPERATION_ID },
  })));
});
