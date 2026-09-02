import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

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

  async query(text: string, values: readonly unknown[] = []) {
    this.calls.push({ text, values });
    if (this.failAt === text) throw new Error("private SQL driver host state nonce verifier");
    const rows = this.queued.shift() ?? [];
    return { rowCount: rows.length, rows };
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

test("persistent OIDC callbacks accept only the exact panel callback authority", async () => {
  for (const redirectUri of [
    "http://localhost/auth/callback",
    "https://localhost/auth/callback",
    "https://panel.celebix.site/auth/other",
    "https://panel.celebix.site/auth/callback?mode=test",
    "https://panel.celebix.site/auth/callback#fragment",
    "https://user:password@panel.celebix.site/auth/callback",
    "https://alternate.celebix.site/auth/callback",
  ]) {
    const client = new FakeClient();
    await assert.rejects(
      new PostgresOidcTransactionStore(dependencies(client)).save({ ...oidcTransaction(), redirectUri }),
      (error: unknown) => error instanceof OidcFlowError && error.code === "oidc_invalid_callback",
      redirectUri,
    );
    assert.equal(client.calls.length, 0);
  }
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
  client.queued.push([], [], [], [], [], [{ status: "consumed" }]);
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

test("confirmed COMMIT is never delayed or replaced by any audit sink outcome", async () => {
  for (const audit of [
    () => undefined,
    () => { throw new Error("audit private detail"); },
    () => Promise.reject(new Error("audit rejected private detail")),
    () => new Promise<void>(() => undefined),
  ]) {
    const client = new FakeClient();
    const outcome = await Promise.race([
      new PostgresOidcTransactionStore({ ...dependencies(client), audit }).save(oidcTransaction()).then(() => "completed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked_by_audit"), 40)),
    ]);
    assert.equal(outcome, "completed");
    assert.deepEqual(client.releases, [undefined]);
  }
});

test("unknown COMMIT stays prompt and authoritative when audit never settles", async () => {
  const client = new FakeClient();
  client.failAt = "COMMIT";
  const outcome = await Promise.race([
    new PostgresOidcTransactionStore({
      ...dependencies(client),
      audit: () => new Promise<void>(() => undefined),
    }).save(oidcTransaction()).catch((error: unknown) => error),
    new Promise<Error>((resolve) => setTimeout(() => resolve(new Error("blocked_by_audit")), 40)),
  ]);
  assert.ok(outcome instanceof IdentityPersistenceError);
  assert.equal(outcome.message, "identity_commit_outcome_unknown");
  assert.equal(client.calls.some((call) => call.text === "ROLLBACK"), false);
  assert.deepEqual(client.releases, [true]);
});

test("rejected audit promises are consumed without an unhandled rejection", async () => {
  const client = new FakeClient();
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", listener);
  try {
    await new PostgresRegistrationAttemptStore({
      ...dependencies(client),
      audit: () => Promise.reject(new Error("audit rejected private detail")),
    }).save(registrationAttempt());
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", listener);
  }
});

test("controlled rejection and persistence failure are never replaced by a non-settling audit sink", async () => {
  const conflictClient = new FakeClient();
  const conflictQuery = conflictClient.query.bind(conflictClient);
  conflictClient.query = async (text, values = []) => {
    if (text.startsWith("INSERT INTO")) throw Object.assign(new Error("private constraint"), { code: "23505" });
    return conflictQuery(text, values);
  };
  const conflict = await Promise.race([
    new PostgresRegistrationAttemptStore({
      ...dependencies(conflictClient),
      audit: () => new Promise<void>(() => undefined),
    }).save(registrationAttempt()).catch((error: unknown) => error),
    new Promise<Error>((resolve) => setTimeout(() => resolve(new Error("blocked_by_audit")), 40)),
  ]);
  assert.ok(conflict instanceof RegistrationPersistenceError);
  assert.equal(conflict.code, "registration_attempt_conflict");

  const failedClient = new FakeClient();
  const failedQuery = failedClient.query.bind(failedClient);
  failedClient.query = async (text, values = []) => {
    if (text.startsWith("INSERT INTO")) throw new Error("private driver detail");
    return failedQuery(text, values);
  };
  const failed = await Promise.race([
    new PostgresOidcTransactionStore({
      ...dependencies(failedClient),
      audit: () => new Promise<void>(() => undefined),
    }).save(oidcTransaction()).catch((error: unknown) => error),
    new Promise<Error>((resolve) => setTimeout(() => resolve(new Error("blocked_by_audit")), 40)),
  ]);
  assert.ok(failed instanceof IdentityPersistenceError);
  assert.equal(failed.message, "identity_persistence_failed");
});

test("malformed rows fail with a redacted persistence classification before the one-time transition", async () => {
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
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(client.releases, [undefined]);
});

test("registration load rejects any persisted timestamp authority that differs from the authenticated payload", async () => {
  const writer = new FakeClient();
  const options = dependencies(writer);
  await new PostgresRegistrationAttemptStore(options).save(registrationAttempt());
  const inserted = writer.calls.find((call) => call.text.startsWith("INSERT INTO saas.registration_workflows"));
  assert.ok(inserted);

  const authorityRow = {
    attempt_id: inserted.values[0],
    state_digest: inserted.values[1],
    payload_ciphertext: inserted.values[2],
    payload_iv: inserted.values[3],
    encryption_key_id: inserted.values[4],
    payload_schema_version: inserted.values[5],
    status: "awaiting_identity",
    version: 1,
    canonical_fingerprint: null,
    requested_at: new Date(String(inserted.values[6])),
    created_at: new Date(String(inserted.values[7])),
    expires_at: new Date(String(inserted.values[8])),
    consumed_at: null,
    terminal_at: null,
    failure_code: null,
    tenant_idempotency_digest: inserted.values[9],
  };
  for (const mismatch of [
    { requested_at: new Date("2026-07-12T10:00:01.000Z") },
    { created_at: new Date("2026-07-12T10:00:01.000Z") },
    { expires_at: new Date("2026-07-12T11:00:00.000Z") },
  ]) {
    const reader = new FakeClient();
    reader.queued.push([], [], [], [], [], [{ ...authorityRow, ...mismatch }]);
    await assert.rejects(
      new PostgresRegistrationAttemptStore({ ...options, pool: { connect: async () => reader } }).load(String(inserted.values[0])),
      IdentityPersistenceError,
    );
  }
});

test("OIDC consume rejects DB expiry authority that differs from its encrypted transaction", async () => {
  const writer = new FakeClient();
  const options = dependencies(writer);
  await new PostgresOidcTransactionStore(options).save(oidcTransaction());
  const inserted = writer.calls.find((call) => call.text.startsWith("INSERT INTO saas.oidc_transactions"));
  assert.ok(inserted);

  const authorityRow = {
    state_digest: inserted.values[0],
    payload_ciphertext: inserted.values[1],
    payload_iv: inserted.values[2],
    encryption_key_id: inserted.values[3],
    payload_schema_version: inserted.values[4],
    status: "active",
    created_at: new Date(String(inserted.values[5])),
    expires_at: new Date(String(inserted.values[6])),
  };
  for (const mismatch of [
    { created_at: new Date("2026-07-12T10:00:01.000Z") },
    { expires_at: new Date("2026-07-12T11:00:00.000Z") },
  ]) {
    const reader = new FakeClient();
    reader.queued.push([], [], [], [], [], [{ ...authorityRow, ...mismatch }]);
    await assert.rejects(
      new PostgresOidcTransactionStore({ ...options, pool: { connect: async () => reader } }).consume(oidcState, now),
      IdentityPersistenceError,
    );
  }
});

test("persisted returning-login transaction keeps the binding encrypted and supports read-only pre-consumption proof", async () => {
  const writer = new FakeClient();
  const options = dependencies(writer);
  const transaction = {
    ...oidcTransaction(),
    state: `plogin_${Buffer.alloc(32, 9).toString("base64url")}`,
    returnTo: "/login",
    panelLoginBinding: { keyId: "browser-active", digest: "a".repeat(64) },
    panelLoginDestinationHostname: "admin.guzidekuyumcu.com.tr",
  } satisfies OidcAuthorizationTransaction;
  await new PostgresOidcTransactionStore(options).save(transaction);
  const inserted = writer.calls.find((call) => call.text.startsWith("INSERT INTO saas.oidc_transactions"));
  assert.ok(inserted);
  assert.equal(inserted.values[4], 2);
  assert.doesNotMatch(JSON.stringify(inserted.values), /browser-active|aaaaaaaaaaaaaaaa|plogin_/);

  const authorityRow = {
    state_digest: inserted.values[0],
    payload_ciphertext: inserted.values[1],
    payload_iv: inserted.values[2],
    encryption_key_id: inserted.values[3],
    payload_schema_version: inserted.values[4],
    status: "active",
    created_at: new Date(String(inserted.values[5])),
    expires_at: new Date(String(inserted.values[6])),
  };
  for (const [candidates, expected] of [
    [[{ keyId: "browser-active", digest: "a".repeat(64) }], { kind: "approved", binding: { keyId: "browser-active", digest: "a".repeat(64) } }],
    [[{ keyId: "browser-old", digest: "a".repeat(64) }], "denied"],
    [[{ keyId: "browser-active", digest: "b".repeat(64) }], "denied"],
  ] as const) {
    const reader = new FakeClient();
    reader.queued.push([], [], [], [], [], [authorityRow]);
    const result = await new PostgresOidcTransactionStore({ ...options, pool: { connect: async () => reader } })
      .inspectPanelLoginBinding(transaction.state, candidates, now);
    assert.deepEqual(result, expected);
    assert.equal(reader.calls.at(-1)?.text, "COMMIT");
    assert.equal(reader.calls.some((call) => /^UPDATE /.test(call.text)), false);
  }

  const registrationReader = new FakeClient();
  const registrationWriter = new FakeClient();
  const registrationOptions = dependencies(registrationWriter);
  await new PostgresOidcTransactionStore(registrationOptions).save(oidcTransaction());
  const registrationInsert = registrationWriter.calls.find((call) => call.text.startsWith("INSERT INTO saas.oidc_transactions"));
  assert.ok(registrationInsert);
  registrationReader.queued.push([], [], [], [], [], [{
    ...authorityRow,
    state_digest: registrationInsert.values[0],
    payload_ciphertext: registrationInsert.values[1],
    payload_iv: registrationInsert.values[2],
    encryption_key_id: registrationInsert.values[3],
    payload_schema_version: registrationInsert.values[4],
    created_at: new Date(String(registrationInsert.values[5])),
    expires_at: new Date(String(registrationInsert.values[6])),
  }]);
  assert.equal(
    await new PostgresOidcTransactionStore({ ...registrationOptions, pool: { connect: async () => registrationReader } })
      .inspectPanelLoginBinding(oidcState, [{ keyId: "browser-active", digest: "a".repeat(64) }], now),
    "not_panel_login",
  );
});

test("bounded expiry primitives use fenced fixed SQL and return counts only", async () => {
  const registrationClient = new FakeClient();
  registrationClient.queued.push([], [], [], [], [], [{ expired_count: 2 }]);
  const registrationStore = new PostgresRegistrationAttemptStore(dependencies(registrationClient));
  assert.equal(await registrationStore.expireDue(now, 25), 2);
  const registrationExpiry = registrationClient.calls[5];
  assert.match(registrationExpiry.text, /FOR UPDATE OF workflow SKIP LOCKED/);
  assert.deepEqual(registrationExpiry.values, [now.toISOString(), 25]);

  const oidcClient = new FakeClient();
  oidcClient.queued.push([], [], [], [], [], [{ expired_count: 3 }]);
  const oidcStore = new PostgresOidcTransactionStore(dependencies(oidcClient));
  assert.equal(await oidcStore.expireDue(now, 25), 3);
  const oidcExpiry = oidcClient.calls[5];
  assert.match(oidcExpiry.text, /FOR UPDATE SKIP LOCKED/);
  assert.deepEqual(oidcExpiry.values, [now.toISOString(), 25]);
});

test("strict registration and OIDC payload validation rejects non-frozen authority", async () => {
  for (const attempt of [
    { ...registrationAttempt(), details: { ...registrationAttempt().details, locale: "en" } },
    { ...registrationAttempt(), details: { ...registrationAttempt().details, currency: "USD" } },
    { ...registrationAttempt(), unexpected: true },
  ]) {
    const client = new FakeClient();
    await assert.rejects(new PostgresRegistrationAttemptStore(dependencies(client)).save(attempt as RegistrationAttempt), IdentityPersistenceError);
    assert.equal(client.calls.length, 0);
  }

  const oidcClient = new FakeClient();
  await assert.rejects(
    new PostgresOidcTransactionStore(dependencies(oidcClient)).save({ ...oidcTransaction(), codeVerifier: "!".repeat(64) }),
    (error: unknown) => error instanceof OidcFlowError && error.code === "oidc_invalid_state",
  );
  assert.equal(oidcClient.calls.length, 0);
});
