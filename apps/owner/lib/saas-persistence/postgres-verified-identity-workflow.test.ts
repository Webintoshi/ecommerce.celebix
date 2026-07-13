import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { createCanonicalTenantFingerprint } from "@celebix/saas-data";

import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "./identity-crypto.ts";
import {
  IdentityPersistenceError,
  RegistrationPersistenceError,
  withIdentityTransactionLease,
  type IdentityPostgresClient,
} from "./postgres-identity-common.ts";
import { PostgresRegistrationAttemptStore } from "./postgres-registration-attempt-store.ts";
import { buildVerifiedTenantAuthority, parseVerifiedIdentitySnapshot } from "./verified-identity.ts";

class FakeClient implements IdentityPostgresClient {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  readonly queued: Array<Record<string, unknown>[]> = [];
  readonly errorListeners = new Set<(error: Error) => void>();
  throwOnRelease = false;
  hangOnAdvisoryUnlock = false;

  async query(text: string, values: readonly unknown[] = []): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
    this.calls.push({ text, values });
    if (this.hangOnAdvisoryUnlock && text.includes("pg_advisory_unlock")) {
      return new Promise(() => undefined);
    }
    const rows = this.queued.shift() ?? [];
    return { rowCount: rows.length, rows };
  }

  release(destroy?: boolean | Error) {
    this.releases.push(destroy);
    if (this.throwOnRelease) throw new Error("private release failure");
  }

  on(event: "error", listener: (error: Error) => void) {
    assert.equal(event, "error");
    this.errorListeners.add(listener);
    return this;
  }

  removeListener(event: "error", listener: (error: Error) => void) {
    assert.equal(event, "error");
    this.errorListeners.delete(listener);
    return this;
  }

  emitConnectionError() {
    for (const listener of this.errorListeners) listener(new Error("private connection failure"));
  }
}

const now = new Date("2026-07-12T10:02:00.000Z");
const attemptId = "attempt_A234567890123456";
const registrationState = "registration-secret-state";
const identity = {
  issuer: "https://identity.example.test",
  subject: "subject-123",
  email: "owner@example.test",
  emailVerified: true,
  displayName: "Store Owner",
} as const;
const registrationPayload = {
  id: attemptId,
  details: {
    storeName: "Safe Store",
    storeSlug: "safe-store",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
    privacyAcceptedAt: "2026-07-12T10:00:00.000Z",
  },
  idempotencyKey: "ssik_A234567890123456",
  requestedAt: "2026-07-12T10:00:00.000Z",
  createdAt: "2026-07-12T10:00:00.000Z",
  expiresAt: "2026-07-12T10:10:00.000Z",
};

function setup(client: FakeClient) {
  const hmacKey = randomBytes(32);
  const keyring = { old: randomBytes(32), current: randomBytes(32) };
  const stateDigester = createOpaqueStateDigester({ key: hmacKey, context: "test" });
  const payloadCipher = createAes256GcmPayloadCipher({
    currentKeyId: "current",
    resolveKey: (keyId) => keyring[keyId as keyof typeof keyring],
  });
  const dependencies = {
    pool: { connect: async () => client },
    stateDigester,
    payloadCipher,
    timeouts: { poolCheckoutMs: 50, statementMs: 500, lockMs: 250, idleTransactionMs: 750 },
    clock: () => now,
    audit: () => undefined,
    identityRole: "celebix_saas_identity" as const,
  };
  return { dependencies, stateDigester, payloadCipher, keyring };
}

function queuePreamble(client: FakeClient) {
  for (let index = 0; index < 5; index += 1) client.queued.push([]);
}

async function lease(client: FakeClient) {
  const fixture = setup(client);
  queuePreamble(client);
  client.queued.push([]);
  const outcome = await withIdentityTransactionLease(fixture.dependencies, "registration", async () => ({
    result: "claimed",
    leaseKey: attemptId,
  }));
  assert.equal(outcome.result, "claimed");
  assert.ok(outcome.lease);
  return outcome.lease;
}

test("tenant-completion lease cleanup is synchronous, queryless, and destroys the client exactly once", async () => {
  const client = new FakeClient();
  const claimed = await lease(client);
  const callCount = client.calls.length;
  assert.equal(claimed.release(), undefined);
  assert.equal(claimed.release(), undefined);
  assert.equal(client.calls.length, callCount);
  assert.equal(client.calls.some((call) => call.text.includes("pg_advisory_unlock")), false);
  assert.deepEqual(client.releases, [true]);
  assert.equal(client.errorListeners.size, 0);
});

test("tenant-completion lease cleanup swallows destruction failures and connection errors", async () => {
  for (const connectionFailed of [false, true]) {
    const client = new FakeClient();
    const claimed = await lease(client);
    client.throwOnRelease = true;
    if (connectionFailed) client.emitConnectionError();
    assert.doesNotThrow(() => claimed.release());
    assert.doesNotThrow(() => claimed.release());
    assert.deepEqual(client.releases, [true]);
    assert.equal(client.errorListeners.size, 0);
  }
});

test("a simulated never-settling advisory unlock cannot delay lease cleanup", async () => {
  const client = new FakeClient();
  client.hangOnAdvisoryUnlock = true;
  const claimed = await lease(client);
  const outcome = await Promise.race([
    Promise.resolve(claimed.release()).then(() => "released"),
    new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 40)),
  ]);
  assert.equal(outcome, "released");
  assert.deepEqual(client.releases, [true]);
});

test("lease destruction failures cannot create an unhandled rejection", async () => {
  const client = new FakeClient();
  const claimed = await lease(client);
  client.throwOnRelease = true;
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", listener);
  try {
    claimed.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(unhandled, []);
    assert.deepEqual(client.releases, [true]);
  } finally {
    process.off("unhandledRejection", listener);
  }
});

async function rows(client: FakeClient) {
  const material = setup(client);
  const digest = material.stateDigester.digest(registrationState);
  const registration = material.payloadCipher.encrypt({
    binding: { purpose: "saas.registration_workflows", stateDigest: digest, schemaVersion: 1, recordId: attemptId },
    payload: registrationPayload,
  });
  const authority = await buildVerifiedTenantAuthority(parseVerifiedIdentitySnapshot(identity), registrationPayload);
  const snapshot = material.payloadCipher.encrypt({
    binding: {
      purpose: "saas.registration_verified_identities",
      stateDigest: authority.canonicalFingerprint,
      schemaVersion: 1,
      recordId: attemptId,
    },
    payload: identity,
  });
  const base = {
    attempt_id: attemptId,
    state_digest: digest,
    payload_ciphertext: Buffer.from(registration.ciphertext),
    payload_iv: Buffer.from(registration.iv),
    encryption_key_id: registration.keyId,
    payload_schema_version: 1,
    status: "awaiting_identity",
    version: 1,
    canonical_fingerprint: null,
    requested_at: new Date(registrationPayload.requestedAt),
    created_at: new Date(registrationPayload.createdAt),
    expires_at: new Date(registrationPayload.expiresAt),
    consumed_at: new Date("2026-07-12T10:01:00.000Z"),
    terminal_at: null,
    failure_code: null,
    tenant_idempotency_digest: createHash("sha256").update(registrationPayload.idempotencyKey, "utf8").digest("hex"),
    verified_attempt_id: null,
    verified_canonical_fingerprint: null,
    verified_payload_ciphertext: null,
    verified_payload_iv: null,
    verified_encryption_key_id: null,
    verified_payload_schema_version: null,
    verified_recorded_at: null,
    completion_attempt_id: null,
    completion_canonical_fingerprint: null,
    completion_state: null,
    completion_version: null,
    completion_started_at: null,
    completion_updated_at: null,
    completion_commit_unknown_at: null,
    completion_completed_at: null,
    completion_recovery_absent_at: null,
  };
  const verified = {
    ...base,
    status: "identity_verified",
    version: 2,
    canonical_fingerprint: authority.canonicalFingerprint,
    verified_attempt_id: attemptId,
    verified_canonical_fingerprint: authority.canonicalFingerprint,
    verified_payload_ciphertext: Buffer.from(snapshot.ciphertext),
    verified_payload_iv: Buffer.from(snapshot.iv),
    verified_encryption_key_id: snapshot.keyId,
    verified_payload_schema_version: 1,
    verified_recorded_at: now,
    completion_attempt_id: attemptId,
    completion_canonical_fingerprint: authority.canonicalFingerprint,
    completion_state: "ready",
    completion_version: 1,
    completion_started_at: null,
    completion_updated_at: now,
    completion_commit_unknown_at: null,
    completion_completed_at: null,
    completion_recovery_absent_at: null,
  };
  return { ...material, base, verified, authority };
}

test("verified identity recording uses one atomic transaction and never emits plaintext identity", async () => {
  const client = new FakeClient();
  const fixture = await rows(client);
  queuePreamble(client);
  client.queued.push([fixture.base], [], [], [{
    ...fixture.base,
    status: "identity_verified",
    version: 2,
    canonical_fingerprint: fixture.authority.canonicalFingerprint,
  }]);
  const store = new PostgresRegistrationAttemptStore(fixture.dependencies);
  const result = await store.recordVerifiedIdentity({ attemptId, expectedVersion: 1, identity, now });

  assert.equal(result.kind, "recorded");
  assert.equal(result.authority.canonicalFingerprint, createCanonicalTenantFingerprint(result.authority.tenantInput));
  const insert = client.calls.find((call) => call.text.startsWith("INSERT INTO saas.registration_verified_identities"));
  assert.ok(insert);
  assert.doesNotMatch(JSON.stringify(insert.values), /identity\.example|subject-123|owner@example|Store Owner/);
  assert.match(client.calls.find((call) => call.text.startsWith("UPDATE saas.registration_workflows"))?.text ?? "", /consumed_at IS NOT NULL/);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.equal("markIdentityVerified" in store, false);
});

test("the same verified identity is idempotent while a different identity fails closed", async () => {
  const sameClient = new FakeClient();
  const sameFixture = await rows(sameClient);
  queuePreamble(sameClient);
  sameClient.queued.push([sameFixture.verified]);
  const same = await new PostgresRegistrationAttemptStore(sameFixture.dependencies).recordVerifiedIdentity({
    attemptId,
    expectedVersion: 1,
    identity,
    now,
  });
  assert.equal(same.kind, "already_recorded");
  assert.equal(sameClient.calls.some((call) => call.text.startsWith("INSERT INTO")), false);

  const conflictClient = new FakeClient();
  const conflictFixture = await rows(conflictClient);
  queuePreamble(conflictClient);
  conflictClient.queued.push([conflictFixture.verified]);
  await assert.rejects(
    new PostgresRegistrationAttemptStore(conflictFixture.dependencies).recordVerifiedIdentity({
      attemptId,
      expectedVersion: 1,
      identity: { ...identity, subject: "different-subject" },
      now,
    }),
    (error: unknown) => error instanceof RegistrationPersistenceError && error.code === "registration_verified_identity_conflict",
  );
  assert.equal(conflictClient.calls.at(-1)?.text, "ROLLBACK");
});

test("loading identity_verified requires one consistent authenticated snapshot", async () => {
  const missingClient = new FakeClient();
  const missingFixture = await rows(missingClient);
  queuePreamble(missingClient);
  missingClient.queued.push([{ ...missingFixture.base, status: "identity_verified", version: 2, canonical_fingerprint: missingFixture.authority.canonicalFingerprint }]);
  await assert.rejects(
    new PostgresRegistrationAttemptStore(missingFixture.dependencies).load(attemptId),
    IdentityPersistenceError,
  );

  for (const corruption of [
    { verified_attempt_id: "attempt_B234567890123456" },
    { verified_canonical_fingerprint: "b".repeat(64) },
    { verified_encryption_key_id: "unknown" },
    { verified_payload_iv: Buffer.alloc(12, 7) },
    { verified_payload_ciphertext: Buffer.alloc(32, 9) },
    { verified_payload_schema_version: 2 },
  ]) {
    const client = new FakeClient();
    const fixture = await rows(client);
    queuePreamble(client);
    client.queued.push([{ ...fixture.verified, ...corruption }]);
    await assert.rejects(
      new PostgresRegistrationAttemptStore(fixture.dependencies).load(attemptId),
      (error: unknown) => error instanceof Error && /^(?:identity_(?:crypto|persistence)_failed|registration_completion_corrupt)$/.test(error.message),
    );
  }
});

test("unknown verified-identity fields and emailVerified false are rejected before pool acquisition", async () => {
  for (const rejected of [
    { ...identity, emailVerified: false },
    { ...identity, nonce: "secret" },
    { ...identity, audience: ["customer-panel"] },
  ]) {
    const client = new FakeClient();
    const fixture = await rows(client);
    await assert.rejects(
      new PostgresRegistrationAttemptStore(fixture.dependencies).recordVerifiedIdentity({ attemptId, expectedVersion: 1, identity: rejected, now }),
      IdentityPersistenceError,
    );
    assert.equal(client.calls.length, 0);
  }
});
