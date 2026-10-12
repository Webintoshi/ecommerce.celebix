import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PostgresOidcTransactionStore } from "./postgres-oidc-transaction-store.ts";
import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from "./identity-crypto.ts";
import type { OidcAuthorizationTransaction } from "../self-serve-oidc.ts";
import type { IdentityPostgresClient } from "./postgres-identity-common.ts";

const now = new Date("2026-10-12T12:00:00Z");
function transaction(panel = true): OidcAuthorizationTransaction {
  return {
    state: `${panel ? "plogin_" : ""}${"x".repeat(43)}`, nonce: "n".repeat(43), codeVerifier: "v".repeat(64),
    redirectUri: "https://panel.celebix.site/auth/callback", returnTo: panel ? "/login" : "/kayit",
    expectedIssuer: "https://identity.example.test/oidc", expectedAudience: "panel-1",
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 600000).toISOString(),
    ...(panel ? { panelLoginBinding: { keyId: "binding", digest: "a".repeat(64) }, panelLoginDestinationHostname: "admin.example.test" } : {}),
  };
}

function fixture() {
  let row: Record<string, unknown> | undefined;
  const client: IdentityPostgresClient = {
    async query(sql, values = []) {
      if (sql.startsWith("INSERT INTO saas.oidc_transactions")) row = {
        state_digest: values[0], payload_ciphertext: values[1], payload_iv: values[2], encryption_key_id: values[3], payload_schema_version: values[4], status: "active", created_at: values[5], expires_at: values[6],
      };
      if (sql.startsWith("SELECT state_digest")) return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      if (sql.startsWith("UPDATE saas.oidc_transactions SET status = $3") && row?.status === "active") {
        row.status = values[2]; return { rows: [{ status: row.status }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const encryption = randomBytes(32);
  const options = { pool: { connect: async () => client }, payloadCipher: createAes256GcmPayloadCipher({ currentKeyId: "test-key", resolveKey: () => encryption }), stateDigester: createOpaqueStateDigester({ key: randomBytes(32), context: "test-oidc" }), timeouts: { poolCheckoutMs: 50, statementMs: 500, lockMs: 250, idleTransactionMs: 750 }, clock: () => now, audit() {}, identityRole: "celebix_saas_identity" as const };
  return { store: new PostgresOidcTransactionStore(options), options, getRow: () => row! };
}

test("explicit panel proof survives authenticated encryption and single-use transaction consumption", async () => {
  const source = fixture();
  const input = { ...transaction(), passwordProof: true as const };
  await source.store.save(input);
  const row = source.getRow();
  assert.equal(row.payload_schema_version, 2);
  assert.equal(JSON.stringify(row).includes("passwordProof"), false);
  assert.deepEqual(await source.store.consume(input.state, now), input);
  await assert.rejects(() => source.store.consume(input.state, now));
});

test("legacy panel and registration encrypted payloads retain their original shape", async () => {
  for (const panel of [false, true]) {
    const source = fixture(); const input = transaction(panel);
    await source.store.save(input);
    const row = source.getRow();
    const decoded = source.options.payloadCipher.decrypt({ binding: { purpose: "saas.oidc_transactions", stateDigest: String(row.state_digest), schemaVersion: Number(row.payload_schema_version) }, encrypted: { keyId: String(row.encryption_key_id), iv: row.payload_iv as Uint8Array, ciphertext: row.payload_ciphertext as Uint8Array } });
    const { state: _state, ...expected } = input;
    assert.equal(JSON.stringify(decoded), JSON.stringify(expected));
    assert.deepEqual(await source.store.consume(input.state, now), input);
  }
});

test("registration and false/malformed proof opt-ins fail before persistence", async () => {
  for (const input of [
    { ...transaction(false), passwordProof: true },
    { ...transaction(), passwordProof: false },
    { ...transaction(), passwordProof: "true" },
  ]) {
    const source = fixture();
    await assert.rejects(() => source.store.save(input as unknown as OidcAuthorizationTransaction));
    assert.equal(source.getRow(), undefined);
  }
});

test("security context is encrypted and preserved for both management purposes", async () => {
  for (const purpose of ['manage', 'change_phone'] as const) {
    const source = fixture();
    const input = { ...transaction(), passwordProof: true as const, adminLoginSecurityContext: { purpose, expectedPrincipalId: '60000000-0000-4000-8000-000000000001' } };
    await source.store.save(input);
    assert.equal(source.getRow().payload_schema_version, 2);
    assert.equal(JSON.stringify(source.getRow()).includes(input.adminLoginSecurityContext.expectedPrincipalId), false);
    assert.deepEqual(await source.store.consume(input.state, now), input);
  }
});

test("malformed optional security context fails before writing an encrypted transaction", async () => {
  for (const context of [null, [], {}, { purpose: 'login', expectedPrincipalId: '60000000-0000-4000-8000-000000000001' }, { purpose: 'manage', expectedPrincipalId: 'not-uuid' }, { purpose: 'manage', expectedPrincipalId: '60000000-0000-4000-8000-000000000001', extra: true }]) {
    const source = fixture();
    await assert.rejects(() => source.store.save({ ...transaction(), passwordProof: true, adminLoginSecurityContext: context } as unknown as OidcAuthorizationTransaction));
    assert.equal(source.getRow(), undefined);
  }
});

test("security context cannot be persisted without returning browser binding and password proof", async () => {
  const context = { purpose: 'manage', expectedPrincipalId: '60000000-0000-4000-8000-000000000001' };
  for (const input of [{ ...transaction(false), passwordProof: true, adminLoginSecurityContext: context }, { ...transaction(), adminLoginSecurityContext: context }]) {
    const source = fixture();
    await assert.rejects(() => source.store.save(input as unknown as OidcAuthorizationTransaction));
    assert.equal(source.getRow(), undefined);
  }
});

test("decrypted security context is checked again before single-use consumption", async () => {
  for (const change of [
    { adminLoginSecurityContext: { purpose: 'manage', expectedPrincipalId: 'not-uuid' } },
    { adminLoginSecurityContext: { purpose: 'manage', expectedPrincipalId: '60000000-0000-4000-8000-000000000001', extra: true } },
    { passwordProof: undefined },
  ]) {
    const source = fixture();
    const input = { ...transaction(), passwordProof: true as const, adminLoginSecurityContext: { purpose: 'manage' as const, expectedPrincipalId: '60000000-0000-4000-8000-000000000001' } };
    await source.store.save(input);
    const row = source.getRow();
    const { state: _state, ...payload } = input;
    // A trusted migration writer or old deployment can encrypt malformed data;
    // possession of valid encryption alone must not bypass the semantic parser.
    const sealed = source.options.payloadCipher.encrypt({ binding: { purpose: 'saas.oidc_transactions', stateDigest: String(row.state_digest), schemaVersion: 2 }, payload: { ...payload, ...change } });
    row.payload_ciphertext = sealed.ciphertext;
    row.payload_iv = sealed.iv;
    row.encryption_key_id = sealed.keyId;
    await assert.rejects(() => source.store.consume(input.state, now));
    assert.equal(row.status, 'active');
  }
});
