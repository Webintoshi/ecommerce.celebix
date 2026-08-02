import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  PostgresToshiProviderRepository,
  ToshiProviderRepositoryError,
  type SealedMerchantProviderCredential,
} from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const CONFIG = "71000000-0000-4000-8000-000000000001";
const OPERATION = "72000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-02T12:00:00.000Z");

const MODELS = Object.freeze([
  Object.freeze({ id: "gpt-5", label: "gpt-5" }),
  Object.freeze({ id: "gpt-5-mini", label: "gpt-5-mini" }),
]);

const CONNECTION = Object.freeze({
  provider: "openai" as const,
  label: "OpenAI",
  status: "active" as const,
  isDefault: true,
  maskedKey: "••••abcd",
  selectedModel: "gpt-5",
  availableModels: MODELS,
  version: 1,
  verifiedAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
});

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
      planCode: "starter",
      version: 2,
      status: "active",
      features: ["catalog"],
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

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  constructor(private readonly responder: Responder = () => []) {}
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
  return new PostgresToshiProviderRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit(event) { audit.push(event.type); },
  });
}

function connectInput() {
  return {
    tenantContext: tenant(),
    now: NOW,
    operationId: OPERATION,
    configId: CONFIG,
    provider: "openai" as const,
    sealedCredentials: sealedEnvelope(),
    credentialDigest: `sha256:${"a".repeat(64)}`,
    credentialVersion: 1,
    maskedKey: "••••abcd",
    selectedModel: "gpt-5",
    availableModels: MODELS,
    expectedVersion: 0,
  };
}

function sqlCall(client: Client, name: string) {
  const call = client.calls.find((entry) => entry.text.includes(`saas.${name}`));
  assert.ok(call);
  return call;
}

test("list projects only public provider state through full tenant authority", async () => {
  const client = new Client((text) => text.includes("toshi_provider_list")
    ? [{ outcome: "listed", result_payload: { items: [CONNECTION] } }]
    : []);
  const result = await repository(new Pool([client])).list({ tenantContext: tenant(), now: NOW });
  assert.deepEqual(result, [CONNECTION]);
  assert.deepEqual(sqlCall(client, "toshi_provider_list").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "starter", 2, NOW]);
  assert.equal(JSON.stringify(result).includes("sealedCredentials"), false);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(client.calls[4]?.text, "SET LOCAL ROLE celebix_saas_app");
});

test("connect sends encrypted authority and a secret-free canonical fingerprint", async () => {
  const client = new Client((text) => text.includes("toshi_provider_connect")
    ? [{ outcome: "connected", result_payload: CONNECTION }]
    : []);
  const result = await repository(new Pool([client])).connect(connectInput());
  assert.deepEqual(result, CONNECTION);
  const call = sqlCall(client, "toshi_provider_connect");
  assert.deepEqual(call.values.slice(0, 7), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "starter", 2, NOW]);
  assert.equal(call.values[11], JSON.stringify(sealedEnvelope()));
  assert.equal(call.values.some((value) => value === "sk-plaintext"), false);
  assert.match(call.values[8] as string, /^[a-f0-9]{64}$/);
});

test("commit unknown destroys the writer and recovers the byte-identical public connection", async () => {
  const writer = new Client((text) => {
    if (text.includes("toshi_provider_connect")) return [{ outcome: "connected", result_payload: CONNECTION }];
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("toshi_provider_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: CONNECTION }]
    : []);
  const audit: string[] = [];
  const result = await repository(new Pool([writer, recovery]), audit).connect(connectInput());
  assert.deepEqual(result, CONNECTION);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["toshi_provider_commit_unknown"]);
  assert.deepEqual(writer.calls.map(({ text }) => text), [
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_app",
    sqlCall(writer, "toshi_provider_connect").text,
    "COMMIT",
  ]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter(({ text }) => text.includes("toshi_provider_recover_operation")).length, 1);
});

test("repository rejects exact-input drift and unavailable model before checkout", async () => {
  const selected = repository(new Pool([]));
  await assert.rejects(
    () => selected.connect({ ...connectInput(), plaintext: "sk-plaintext" } as never),
    (error: unknown) => error instanceof ToshiProviderRepositoryError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => selected.connect({ ...connectInput(), selectedModel: "gpt-missing" }),
    (error: unknown) => error instanceof ToshiProviderRepositoryError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => selected.list({ tenantContext: tenant(), now: NOW, provider: "openai" } as never),
    (error: unknown) => error instanceof ToshiProviderRepositoryError && error.code === "invalid_input",
  );
});

test("version conflict rolls back and public parser rejects secret-bearing rows", async () => {
  const conflict = new Client((text) => text.includes("toshi_provider_connect")
    ? [{ outcome: "version_conflict", result_payload: null }]
    : []);
  await assert.rejects(
    () => repository(new Pool([conflict])).connect(connectInput()),
    (error: unknown) => error instanceof ToshiProviderRepositoryError && error.code === "version_conflict",
  );
  assert.equal(conflict.calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(conflict.releases, [undefined]);

  const unsafe = new Client((text) => text.includes("toshi_provider_list")
    ? [{ outcome: "listed", result_payload: { items: [{ ...CONNECTION, sealedCredentials: sealedEnvelope() }] } }]
    : []);
  await assert.rejects(
    () => repository(new Pool([unsafe])).list({ tenantContext: tenant(), now: NOW }),
    (error: unknown) => error instanceof ToshiProviderRepositoryError && error.code === "unavailable",
  );
});

test("identity stays secret-free while authority returns only the server envelope", async () => {
  const identityClient = new Client((text) => text.includes("toshi_provider_connection_identity")
    ? [{ outcome: "found", result_payload: { configId: CONFIG, credentialVersion: 2, version: 3 } }]
    : []);
  assert.deepEqual(
    await repository(new Pool([identityClient])).getConnectionIdentity({ tenantContext: tenant(), now: NOW, provider: "openai" }),
    { configId: CONFIG, credentialVersion: 2, version: 3 },
  );

  const authorityClient = new Client((text) => text.includes("toshi_provider_get_authority")
    ? [{ outcome: "found", result_payload: {
        configId: CONFIG,
        provider: "openai",
        selectedModel: "gpt-5",
        sealedCredentials: sealedEnvelope(),
        credentialVersion: 2,
        version: 3,
      } }]
    : []);
  const authority = await repository(new Pool([authorityClient])).getAuthority({ tenantContext: tenant(), now: NOW, provider: null });
  assert.equal(authority.sealedCredentials.keyId, "staging-key-01");
  assert.equal(JSON.stringify(authority).includes("maskedKey"), false);
});

test("constructor rejects unsafe timeout or mutable option drift", () => {
  assert.throws(
    () => new PostgresToshiProviderRepository({
      pool: new Pool([]),
      role: "celebix_saas_app",
      timeouts: { poolCheckoutMs: 0, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
      audit() {},
    }),
    (error: unknown) => error instanceof ToshiProviderRepositoryError && error.code === "unavailable",
  );
});
