import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import type { QueryResult } from "pg";

import type { RegistrationAttempt } from "../self-serve-registration-orchestrator.ts";
import type { OidcAuthorizationTransaction } from "../self-serve-oidc.ts";
import { OidcFlowError } from "../self-serve-oidc.ts";
import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "./identity-crypto.ts";
import {
  IdentityPersistenceError,
  IdentityPoolTimeoutError,
  RegistrationPersistenceError,
  type IdentityPostgresClient,
} from "./postgres-identity-common.ts";
import { PostgresOidcTransactionStore } from "./postgres-oidc-transaction-store.ts";
import { PostgresRegistrationAttemptStore } from "./postgres-registration-attempt-store.ts";

class FakeClient implements IdentityPostgresClient {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  readonly queued: Array<Record<string, unknown>[]> = [];
  failAt: string | undefined;

  async query(text: string, values: readonly unknown[] = []): Promise<QueryResult<Record<string, unknown>>> {
    this.calls.push({ text, values });
    if (this.failAt === text) throw new Error("private SQL driver host state nonce verifier");
    const rows = this.queued.shift() ?? [];
    return { command: "", rowCount: rows.length, oid: 0, fields: [], rows };
  }

  release(destroy?: boolean | Error) { this.releases.push(destroy); }
}

const now = new Date("2026-07-12T10:00:00.000Z");
const registrationState = "registration-secret-state";
const oidcState = "oidc-secret-state";

function dependencies(client: FakeClient) {
  const hmac = randomBytes(32);
  const encryption = randomBytes(32);
  return {
    pool: { connect: async () => client },
    stateDigester: createOpaqueStateDigester({ key: hmac, context: "test" }),
    payloadCipher: createAes256GcmPayloadCipher({ currentKeyId: "ephemeral", resolveKey: () => encryption }),
    timeouts: { poolCheckoutMs: 50, statementMs: 500, lockMs: 250, idleTransactionMs: 750 },
    clock: () => now,
    audit: () => undefined,
    identityRole: "celebix_saas_identity" as const,
  };
}

function registrationAttempt(): RegistrationAttempt {
  return {
    id: "attempt_A234567890123456",
    state: registrationState,
    details: {
      storeName: "Safe Store",
      storeSlug: "safe-store",
      locale: "tr",
      currency: "TRY",
      themeKey: "starter",
      privacyAcceptedAt: now.toISOString(),
    },
    idempotencyKey: "ssik_A234567890123456",
    requestedAt: now.toISOString(),
    status: "awaiting_identity",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 600_000).toISOString(),
  };
}

function oidcTransaction(): OidcAuthorizationTransaction {
  return {
    state: oidcState,
    nonce: "nonce-secret-opaque-value",
    codeVerifier: "v".repeat(64),
    redirectUri: "https://panel.celebix.site/auth/callback",
    returnTo: "/kayit",
    expectedIssuer: "https://identity.example.test",
    expectedAudience: "customer-panel",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 600_000).toISOString(),
  };
}

test("registration save uses one bounded transaction, exact local role, fixed SQL, and no plaintext state", async () => {
  const client = new FakeClient();
  await new PostgresRegistrationAttemptStore(dependencies(client)).save(registrationAttempt());

  assert.deepEqual(client.calls.slice(0, 5), [
    { text: "BEGIN ISOLATION LEVEL READ COMMITTED", values: [] },
    { text: "SELECT pg_catalog.set_config('statement_timeout', $1, true)", values: ["500ms"] },
    { text: "SELECT pg_catalog.set_config('lock_timeout', $1, true)", values: ["250ms"] },
    { text: "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", values: ["750ms"] },
    { text: "SET LOCAL ROLE celebix_saas_identity", values: [] },
  ]);
  assert.match(client.calls[5].text, /^INSERT INTO saas\.registration_workflows/);
  assert.doesNotMatch(client.calls[5].text, /registration-secret-state/);
  assert.equal(client.calls[5].values.some((value) => value === registrationState), false);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(client.releases, [undefined]);
});

test("OIDC save never sends raw state, nonce, or verifier as SQL values", async () => {
  const client = new FakeClient();
  await new PostgresOidcTransactionStore(dependencies(client)).save(oidcTransaction());
  const insert = client.calls[5];
  const serialized = JSON.stringify(insert.values);
  assert.match(insert.text, /^INSERT INTO saas\.oidc_transactions/);
  assert.doesNotMatch(serialized, /oidc-secret-state|nonce-secret|vvvvvvvv/);
});

test("checkout timeout is controlled and a late client is destroyed without queries", async () => {
  let resolve!: (client: FakeClient) => void;
  const late = new FakeClient();
  const options = dependencies(new FakeClient());
  options.timeouts.poolCheckoutMs = 5;
  options.pool = { connect: () => new Promise((done) => { resolve = done; }) };
  const store = new PostgresRegistrationAttemptStore(options);
  await assert.rejects(store.save(registrationAttempt()), IdentityPoolTimeoutError);
  resolve(late);
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(late.releases, [true]);
  assert.equal(late.calls.length, 0);
});

test("driver failures are redacted, rolled back, and the client is destroyed when rollback fails", async () => {
  const client = new FakeClient();
  client.failAt = "ROLLBACK";
  const store = new PostgresRegistrationAttemptStore(dependencies(client));
  client.queued.push([], [], [], [], [], []);
  const original = client.query.bind(client);
  client.query = async (text, values = []) => {
    if (text.startsWith("INSERT INTO")) throw new Error("postgres://secret@production/state nonce");
    return original(text, values);
  };
  await assert.rejects(store.save(registrationAttempt()), (error: unknown) => {
    assert.ok(error instanceof IdentityPersistenceError);
    assert.equal(error.message, "identity_persistence_failed");
    return true;
  });
  assert.deepEqual(client.releases, [true]);
});

test("constructor rejects any role other than the exact identity authority", () => {
  const client = new FakeClient();
  assert.throws(() => new PostgresRegistrationAttemptStore({
    ...dependencies(client),
    identityRole: "celebix_saas_owner" as "celebix_saas_identity",
  }), IdentityPersistenceError);
  assert.equal(client.calls.length, 0);
});

test("OIDC controlled classifications remain public-domain compatible", async () => {
  const client = new FakeClient();
  client.queued.push([], [], [], [], [], [], [{ status: "consumed" }]);
  const store = new PostgresOidcTransactionStore(dependencies(client));
  await assert.rejects(store.consume(oidcState, now), (error: unknown) => {
    assert.ok(error instanceof OidcFlowError);
    assert.equal(error.code, "oidc_state_replayed");
    assert.doesNotMatch(error.message, /digest|sql|state-secret|nonce|verifier/i);
    return true;
  });
});

test("unique violations map to a stable registration conflict without leaking catalog details", async () => {
  const client = new FakeClient();
  const original = client.query.bind(client);
  client.query = async (text, values = []) => {
    if (text.startsWith("INSERT INTO")) throw Object.assign(new Error("registration_workflows_state_digest_key"), { code: "23505" });
    return original(text, values);
  };
  await assert.rejects(new PostgresRegistrationAttemptStore(dependencies(client)).save(registrationAttempt()), (error: unknown) => {
    assert.ok(error instanceof RegistrationPersistenceError);
    assert.equal(error.code, "registration_attempt_conflict");
    assert.doesNotMatch(error.message, /workflow|digest|23505/i);
    return true;
  });
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(client.releases, [undefined]);
});

test("an uncertain commit destroys the client and never attempts rollback", async () => {
  const client = new FakeClient();
  client.failAt = "COMMIT";
  await assert.rejects(new PostgresOidcTransactionStore(dependencies(client)).save(oidcTransaction()), (error: unknown) => {
    assert.ok(error instanceof IdentityPersistenceError);
    assert.equal(error.message, "identity_commit_outcome_unknown");
    return true;
  });
  assert.equal(client.calls.some((call) => call.text === "ROLLBACK"), false);
  assert.deepEqual(client.releases, [true]);
});

test("malformed rows fail with a redacted persistence classification after the one-time transition commits", async () => {
  const client = new FakeClient();
  client.queued.push([], [], [], [], [], [{
    status: "consumed",
    payload_schema_version: 1,
    encryption_key_id: "ephemeral",
    payload_iv: Buffer.alloc(12),
    payload_ciphertext: Buffer.alloc(17),
  }]);
  await assert.rejects(new PostgresOidcTransactionStore(dependencies(client)).consume(oidcState, now), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /sql|row|ciphertext|iv|key/i);
    return true;
  });
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(client.releases, [undefined]);
});
