import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  MerchantProviderProfileRepositoryError,
  PostgresMerchantProviderProfileRepository,
  type SealedMerchantProviderCredential,
} from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const PROFILE = "51000000-0000-4000-8000-000000000001";
const OPERATION = "52000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-25T12:00:00.000Z");

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "request",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "merchant" },
    store: { id: STORE, slug: "store", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["integrations"],
      limits: { products: 100, staff: 5, storageBytes: 1024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

function sealedEnvelope(): SealedMerchantProviderCredential {
  return Object.freeze({
    algorithm: "A256GCM",
    ciphertext: "Y3JlZGVudGlhbA",
    iv: "MTIzNDU2Nzg5MDEy",
    keyId: "staging-key-01",
    tag: "MTIzNDU2Nzg5MDEyMzQ1Ng",
    version: 1,
  });
}

function profile(status = "pending_validation") {
  return {
    id: PROFILE,
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    publicConfig: { accountReference: "merchant-42" },
    maskedAccountReference: "••••nt-42",
    status,
    credentialVersion: 1,
    version: 1,
    lastValidatedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  readonly responder: Responder;
  constructor(responder: Responder = () => []) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}

class Pool {
  private index = 0;
  readonly clients: Client[];
  constructor(clients: Client[]) { this.clients = clients; }
  async connect() {
    const client = this.clients[this.index++];
    if (!client) throw new Error("checkout");
    return client;
  }
}

function repository(pool: Pool, audit: string[] = []) {
  return new PostgresMerchantProviderProfileRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit(event) { audit.push(event.type); },
  });
}

function saveInput() {
  return {
    tenantContext: tenant(),
    now: NOW,
    operationId: OPERATION,
    profileId: PROFILE,
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    publicConfig: { accountReference: "merchant-42" },
    maskedAccountReference: "••••nt-42",
    sealedCredentials: sealedEnvelope(),
    credentialDigest: "a".repeat(64),
    expectedVersion: 0,
  };
}

function sqlCall(client: Client, name: string) {
  const call = client.calls.find((entry) => entry.text.includes(`saas.${name}`));
  assert.ok(call);
  return call;
}

test("profile repository sends sealed authority and parses only safe projections", async () => {
  const client = new Client((text) => text.includes("merchant_provider_profile_save")
    ? [{ outcome: "saved", result_payload: profile() }]
    : []);
  const result = await repository(new Pool([client])).save(saveInput());
  assert.equal(result.providerCode, "fixture_provider");
  assert.doesNotMatch(JSON.stringify(result), /ciphertext|keyId|digest|storeId/);
  const call = sqlCall(client, "merchant_provider_profile_save");
  assert.deepEqual(call.values.slice(0, 7), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
  assert.equal(call.values[14], JSON.stringify(sealedEnvelope()));
  assert.equal(call.values[16], "staging-key-01");
});

test("profile listing is bounded, capability-filtered, and rejects unsafe SQL projections", async () => {
  const safe = new Client((text) => text.includes("merchant_provider_profile_list")
    ? [{ outcome: "listed", result_payload: { items: [profile("active"), { ...profile("active"), id: "51000000-0000-4000-8000-000000000002", capability: "email_delivery" }] } }]
    : []);
  const listed = await repository(new Pool([safe])).list({ tenantContext: tenant(), now: NOW, capability: "marketplace_sync" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.status, "active");
  const unsafe = new Client((text) => text.includes("merchant_provider_profile_list")
    ? [{ outcome: "listed", result_payload: { items: [{ ...profile(), ciphertext: "private" }] } }]
    : []);
  await assert.rejects(
    () => repository(new Pool([unsafe])).list({ tenantContext: tenant(), now: NOW, capability: "marketplace_sync" }),
    (error: unknown) => error instanceof MerchantProviderProfileRepositoryError && error.code === "unavailable",
  );
});

test("profile disable and revoke use exact versioned authority", async () => {
  for (const [method, outcome, status] of [["disable", "disabled", "disabled"], ["revoke", "revoked", "revoked"]] as const) {
    const client = new Client((text) => text.includes(`merchant_provider_profile_${method}`)
      ? [{ outcome, result_payload: { ...profile(status), version: 2 } }]
      : []);
    const result = await repository(new Pool([client]))[method]({ tenantContext: tenant(), now: NOW, operationId: OPERATION, profileId: PROFILE, expectedVersion: 1 });
    assert.equal(result.status, status);
    assert.deepEqual(sqlCall(client, `merchant_provider_profile_${method}`).values.slice(-2), [PROFILE, 1]);
  }
});

test("profile commit unknown destroys client audits safely and recovers once", async () => {
  let commits = 0;
  const writer = new Client((text) => {
    if (text.includes("merchant_provider_profile_save")) return [{ outcome: "saved", result_payload: profile() }];
    if (text === "COMMIT" && commits++ === 0) throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("merchant_provider_profile_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: profile() }]
    : []);
  const audit: string[] = [];
  const result = await repository(new Pool([writer, recovery]), audit).save(saveInput());
  assert.equal(result.id, PROFILE);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["merchant_provider_profile_commit_unknown"]);
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("merchant_provider_profile_recover_operation")).length, 1);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(writer.calls.filter((entry) => entry.text.includes("merchant_provider_profile_save")).length, 1);
});

test("profile recovery must equal the safe pre-commit projection", async () => {
  const writer = new Client((text) => {
    if (text.includes("merchant_provider_profile_save")) return [{ outcome: "saved", result_payload: profile() }];
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("merchant_provider_profile_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: { ...profile(), version: 2 } }]
    : []);
  await assert.rejects(
    () => repository(new Pool([writer, recovery])).save(saveInput()),
    (error: unknown) => error instanceof MerchantProviderProfileRepositoryError && error.code === "unavailable",
  );
  assert.equal(writer.calls.filter((entry) => entry.text.includes("merchant_provider_profile_save")).length, 1);
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("merchant_provider_profile_recover_operation")).length, 1);
});

test("profile inputs fail closed before checkout", async () => {
  await assert.rejects(
    () => repository(new Pool([])).save({ ...saveInput(), publicConfig: { apiSecret: "private" } }),
    (error: unknown) => error instanceof MerchantProviderProfileRepositoryError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => repository(new Pool([])).list({ tenantContext: tenant(), now: NOW, capability: "unknown" as never }),
    (error: unknown) => error instanceof MerchantProviderProfileRepositoryError && error.code === "invalid_input",
  );
});

test("database outcomes map to a closed safe error union", async () => {
  for (const code of ["provider_not_found", "provider_disabled", "provider_capability_mismatch", "profile_not_found", "version_conflict", "invalid_transition", "operation_mismatch"] as const) {
    const client = new Client((text) => text.includes("merchant_provider_profile_save") ? [{ outcome: code, result_payload: null }] : []);
    await assert.rejects(
      () => repository(new Pool([client])).save(saveInput()),
      (error: unknown) => error instanceof MerchantProviderProfileRepositoryError && error.code === code && error.message === code,
    );
  }
  const unknown = new Client((text) => text.includes("merchant_provider_profile_save") ? [{ outcome: "private_sql_detail", result_payload: null }] : []);
  await assert.rejects(
    () => repository(new Pool([unknown])).save(saveInput()),
    (error: unknown) => error instanceof MerchantProviderProfileRepositoryError && error.code === "unavailable",
  );
  const contradictory = new Client((text) => text.includes("merchant_provider_profile_save")
    ? [{ outcome: "saved", result_payload: profile("active") }]
    : []);
  await assert.rejects(
    () => repository(new Pool([contradictory])).save(saveInput()),
    (error: unknown) => error instanceof MerchantProviderProfileRepositoryError && error.code === "unavailable",
  );
});
