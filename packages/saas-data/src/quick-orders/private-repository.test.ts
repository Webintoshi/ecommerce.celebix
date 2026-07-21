import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  PostgresQuickOrderPrivateRepository,
  type ConfigureQuickOrderProviderInput,
  type RevokeQuickOrderProviderInput,
} from "./private-repository.ts";
import { QuickOrderLinkRepositoryError } from "./errors.ts";

const STORE_ID = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const PROVIDER_CONFIG_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const LINK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-07-21T08:00:00.000Z");
const DIGEST = "1".repeat(64);
const FINGERPRINT = "2".repeat(64);
const PRIVATE_DRIVER = "postgres://private@database/celebix";
const PRIVATE_SQL = "SELECT secret FROM private_table";

type Row = Record<string, unknown>;
type Response = Readonly<{ rows: Row[]; rowCount?: number | null }>;
type Responder = (text: string, values: unknown[]) => Row[] | Response | Promise<Row[] | Response>;

class FakeClient {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly responder: Responder;
  private readonly releaseError?: Error;

  constructor(
    responder: Responder = () => [],
    releaseError?: Error,
  ) {
    this.responder = responder;
    this.releaseError = releaseError;
  }

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const response = await this.responder(text, values);
    const rows = Array.isArray(response) ? response : response.rows;
    const rowCount = Array.isArray(response) ? rows.length : (response.rowCount ?? rows.length);
    return { rows, rowCount, command: "", oid: 0, fields: [] };
  }

  release(destroy?: boolean | Error) {
    this.releases.push(destroy);
    if (this.releaseError) throw this.releaseError;
  }
}

class FakePool {
  connects = 0;
  readonly clients: Array<FakeClient | Error>;

  constructor(clients: Array<FakeClient | Error>) {
    this.clients = clients;
  }

  async connect() {
    const selected = this.clients[this.connects++];
    if (selected instanceof Error) throw selected;
    if (!selected) throw new Error("unexpected pool checkout");
    return selected;
  }
}

function tenantContext(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private-request",
    principal: { id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: "private-subject" },
    store: { id: STORE_ID, slug: "atlas-store", status: "active" },
    membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "merchant_growth",
      version: 3,
      status: "active",
      features: ["orders", "checkout"],
      limits: { products: 100, staff: 5, storageBytes: 1024 },
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  };
}

function sealedEnvelope() {
  return Object.freeze({
    algorithm: "A256GCM" as const,
    ciphertext: "AQ",
    iv: "AAAAAAAAAAAAAAAA",
    keyId: "quick-link-key-2026",
    tag: "AAAAAAAAAAAAAAAAAAAAAA",
    version: 1 as const,
  });
}

function authorityInput() {
  return { tenantContext: tenantContext(), now: NOW };
}

function configureInput(): ConfigureQuickOrderProviderInput {
  return {
    ...authorityInput(),
    providerConfigId: PROVIDER_CONFIG_ID,
    expectedVersion: 0,
    operationId: OPERATION_ID,
    configurationDigest: DIGEST,
    configurationKeyId: sealedEnvelope().keyId,
    sealedConfiguration: sealedEnvelope(),
    fingerprint: FINGERPRINT,
  };
}

function revokeInput(): RevokeQuickOrderProviderInput {
  return {
    ...authorityInput(),
    providerConfigId: PROVIDER_CONFIG_ID,
    expectedVersion: 1,
    operationId: OPERATION_ID,
    fingerprint: FINGERPRINT,
  };
}

function providerProjection(status: "active" | "disabled" | "revoked" = "active", version = 1) {
  return {
    id: PROVIDER_CONFIG_ID,
    providerKey: "paytr",
    status,
    ready: status === "active",
    version,
    updatedAt: "2026-07-21T08:00:00.000000Z",
  };
}

function row(outcome: string, resultPayload: unknown): Row {
  return { outcome, result_payload: resultPayload };
}

function repository(pool: FakePool, audit: (event: unknown) => void | Promise<void> = () => undefined) {
  return new PostgresQuickOrderPrivateRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit,
  });
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof QuickOrderLinkRepositoryError &&
    error.code === code && error.message === code &&
    !String(error).includes(PRIVATE_DRIVER) && !String(error).includes(PRIVATE_SQL);
}

function functionCalls(client: FakeClient) {
  return client.calls.filter(({ text }) => text.includes("FROM saas."));
}

test("private repository exposes only the Task 5 method surface and requires the exact app role", () => {
  assert.deepEqual(Object.getOwnPropertyNames(PostgresQuickOrderPrivateRepository.prototype).sort(), [
    "configureProvider", "constructor", "getProviderReadiness", "revealLinkCredential",
    "revealProviderConfiguration", "revokeProvider",
  ]);
  const options = {
    pool: new FakePool([]),
    role: "celebix_saas_workflow",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
  };
  assert.throws(() => new PostgresQuickOrderPrivateRepository(options as never), errorCode("unavailable"));
  assert.throws(() => new PostgresQuickOrderPrivateRepository({ ...options, role: "celebix_saas_app", extra: true } as never), errorCode("unavailable"));
});

test("provider readiness uses BEGIN READ ONLY, all local timeouts, the exact app role, commit, and release", async () => {
  const client = new FakeClient((text) => text.includes("quick_links_get_provider_readiness")
    ? [row("not_configured", { ready: false, providerKey: "paytr" })]
    : []);
  const result = await repository(new FakePool([client])).getProviderReadiness(authorityInput());
  assert.deepEqual(result, { status: "missing" });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(client.calls.slice(0, 5).map(({ text }) => text), [
    "BEGIN READ ONLY",
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_app",
  ]);
  assert.match(client.calls[5]!.text, /saas\.quick_links_get_provider_readiness/);
  assert.equal(client.calls[6]!.text, "COMMIT");
  assert.deepEqual(client.calls.slice(1, 4).map(({ values }) => values), [["500ms"], ["300ms"], ["700ms"]]);
  assert.deepEqual(client.releases, [undefined]);
});

test("provider readiness accepts only coherent safe active, disabled, and revoked projections", async () => {
  for (const status of ["active", "disabled", "revoked"] as const) {
    const client = new FakeClient((text) => text.includes("quick_links_get_provider_readiness")
      ? [row("found", providerProjection(status, 7))]
      : []);
    const result = await repository(new FakePool([client])).getProviderReadiness(authorityInput());
    assert.deepEqual(result, { status, providerConfigId: PROVIDER_CONFIG_ID, version: 7 });
    assert.equal(Object.isFrozen(result), true);
  }
  const incoherent = new FakeClient((text) => text.includes("quick_links_get_provider_readiness")
    ? [row("found", { ...providerProjection("active"), ready: false })]
    : []);
  await assert.rejects(repository(new FakePool([incoherent])).getProviderReadiness(authorityInput()), errorCode("unavailable"));
});

test("configureProvider sends exact authority and sealed values in one app transaction and returns a safe active DTO", async () => {
  const client = new FakeClient((text) => text.includes("quick_links_configure_provider")
    ? [row("committed", providerProjection("active", 1))]
    : []);
  const result = await repository(new FakePool([client])).configureProvider(configureInput());
  assert.deepEqual(result, { status: "active", providerConfigId: PROVIDER_CONFIG_ID, version: 1 });
  const call = functionCalls(client)[0]!;
  assert.match(call.text, /saas\.quick_links_configure_provider/);
  assert.deepEqual(call.values.slice(0, 7), [STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW]);
  assert.deepEqual(call.values.slice(7), [
    PROVIDER_CONFIG_ID, 0, DIGEST, sealedEnvelope().keyId,
    JSON.stringify(sealedEnvelope()), OPERATION_ID, FINGERPRINT,
  ]);
  assert.equal(client.calls[0]!.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.calls.at(-1)!.text, "COMMIT");
});

test("revokeProvider accepts an exact operation replay and maps controlled SQL failures", async () => {
  const replay = new FakeClient((text) => text.includes("quick_links_revoke_provider")
    ? [row("operation_replayed", providerProjection("revoked", 2))]
    : []);
  assert.deepEqual(await repository(new FakePool([replay])).revokeProvider(revokeInput()), {
    status: "revoked", providerConfigId: PROVIDER_CONFIG_ID, version: 2,
  });
  const call = functionCalls(replay)[0]!;
  assert.deepEqual(call.values.slice(7), [PROVIDER_CONFIG_ID, 1, OPERATION_ID, FINGERPRINT]);

  for (const [outcome, expected] of [
    ["membership_denied", "membership_denied"],
    ["provider_not_found", "provider_not_ready"],
    ["provider_revoked", "invalid_transition"],
    ["version_conflict", "version_conflict"],
  ] as const) {
    const failed = new FakeClient((text) => text.includes("quick_links_revoke_provider") ? [row(outcome, null)] : []);
    await assert.rejects(repository(new FakePool([failed])).revokeProvider(revokeInput()), errorCode(expected));
  }
});

test("revealLinkCredential validates the sealed server projection and returns no SQL-only key field", async () => {
  const payload = {
    storeId: STORE_ID,
    linkId: LINK_ID,
    canonicalHostname: "atlas.example.com",
    expiresAt: "2026-07-22T08:00:00.000000Z",
    tokenDigest: DIGEST,
    tokenKeyId: sealedEnvelope().keyId,
    sealedToken: sealedEnvelope(),
  };
  const client = new FakeClient((text) => text.includes("quick_links_reveal_credential") ? [row("found", payload)] : []);
  const result = await repository(new FakePool([client])).revealLinkCredential({ ...authorityInput(), linkId: LINK_ID });
  assert.deepEqual(result, {
    storeId: STORE_ID, linkId: LINK_ID, tokenDigest: DIGEST, sealedToken: sealedEnvelope(),
    canonicalHostname: "atlas.example.com", expiresAt: "2026-07-22T08:00:00.000000Z",
  });
  assert.deepEqual(Object.keys(result).sort(), ["canonicalHostname", "expiresAt", "linkId", "sealedToken", "storeId", "tokenDigest"]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.sealedToken), true);
});

test("revealProviderConfiguration validates digest and envelope key agreement without exposing SQL-only fields", async () => {
  const payload = {
    storeId: STORE_ID,
    providerConfigId: PROVIDER_CONFIG_ID,
    version: 4,
    configurationDigest: DIGEST,
    configurationKeyId: sealedEnvelope().keyId,
    sealedConfiguration: sealedEnvelope(),
  };
  const client = new FakeClient((text) => text.includes("quick_links_reveal_provider_configuration") ? [row("found", payload)] : []);
  const result = await repository(new FakePool([client])).revealProviderConfiguration({
    ...authorityInput(), providerConfigId: PROVIDER_CONFIG_ID,
  });
  assert.deepEqual(result, {
    storeId: STORE_ID, providerConfigId: PROVIDER_CONFIG_ID,
    configurationDigest: DIGEST, sealedConfiguration: sealedEnvelope(),
  });
  assert.deepEqual(Object.keys(result).sort(), ["configurationDigest", "providerConfigId", "sealedConfiguration", "storeId"]);

  const mismatch = new FakeClient((text) => text.includes("quick_links_reveal_provider_configuration")
    ? [row("found", { ...payload, configurationKeyId: "other-key" })]
    : []);
  await assert.rejects(repository(new FakePool([mismatch])).revealProviderConfiguration({
    ...authorityInput(), providerConfigId: PROVIDER_CONFIG_ID,
  }), errorCode("unavailable"));
});

test("hostile getters, proxies, and non-single rows fail closed, roll back, and never leak details", async () => {
  const getter = Object.defineProperty({}, "outcome", { enumerable: true, get: () => { throw new Error(PRIVATE_DRIVER); } });
  Object.defineProperty(getter, "result_payload", { enumerable: true, value: null });
  const hostileRows: Array<Response> = [
    { rows: [getter as Row], rowCount: 1 },
    { rows: [new Proxy(row("not_configured", null), {})], rowCount: 1 },
    { rows: [], rowCount: 0 },
    { rows: [row("not_configured", null), row("not_configured", null)], rowCount: 2 },
    { rows: [row("not_configured", null)], rowCount: 2 },
  ];
  for (const hostile of hostileRows) {
    const client = new FakeClient((text) => text.includes("quick_links_get_provider_readiness") ? hostile : []);
    await assert.rejects(repository(new FakePool([client])).getProviderReadiness(authorityInput()), errorCode("unavailable"));
    assert.equal(client.calls.at(-1)!.text, "ROLLBACK");
    assert.deepEqual(client.releases, [undefined]);
  }
});

test("pool acquisition failures are branded and omit driver and SQL text", async () => {
  await assert.rejects(
    repository(new FakePool([new Error(`${PRIVATE_DRIVER} ${PRIVATE_SQL}`)])).getProviderReadiness(authorityInput()),
    errorCode("unavailable"),
  );
});

test("query, rollback, and release failures preserve a sanitized outcome and evict broken clients", async () => {
  const client = new FakeClient(async (text) => {
    if (text === "ROLLBACK") throw new Error(PRIVATE_DRIVER);
    if (text.includes("quick_links_get_provider_readiness")) throw new Error(`${PRIVATE_SQL} ${PRIVATE_DRIVER}`);
    return [];
  }, new Error("release failed"));
  await assert.rejects(repository(new FakePool([client])).getProviderReadiness(authorityInput()), errorCode("unavailable"));
  assert.deepEqual(client.releases, [true]);
});

test("configureProvider recovers an unknown commit with one read-only call and no second write", async () => {
  const audits: unknown[] = [];
  const write = new FakeClient(async (text) => {
    if (text.includes("quick_links_configure_provider")) return [row("committed", providerProjection("active", 1))];
    if (text === "COMMIT") throw new Error(`${PRIVATE_DRIVER} commit failed`);
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
    ? [row("operation_replayed", providerProjection("active", 1))]
    : []);
  const result = await repository(new FakePool([write, recovery]), (event) => { audits.push(event); })
    .configureProvider(configureInput());
  assert.deepEqual(result, { status: "active", providerConfigId: PROVIDER_CONFIG_ID, version: 1 });
  assert.deepEqual(write.releases, [true]);
  assert.equal(recovery.calls[0]!.text, "BEGIN READ ONLY");
  assert.deepEqual(functionCalls(recovery).map(({ text }) => text.match(/saas\.([a-z_]+)/)?.[1]), ["quick_links_recover_provider_operation"]);
  assert.equal(functionCalls(write).filter(({ text }) => text.includes("quick_links_configure_provider")).length, 1);
  assert.deepEqual(audits, [{ type: "quick_link_commit_unknown" }]);

  const recoveryFailures: Array<FakeClient | Error> = [
    new Error(`${PRIVATE_DRIVER} recovery acquire failed`),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? [row("operation_mismatch", null)]
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? [row("not_found", null)]
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? [row("operation_replayed", { status: "active" })]
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? { rows: [row("operation_replayed", providerProjection("active", 1)), row("operation_replayed", providerProjection("active", 1))], rowCount: 2 }
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? [row("operation_replayed", { ...providerProjection("active", 1), version: 2 })]
      : []),
    new FakeClient(async (text) => {
      if (text.includes("quick_links_recover_provider_operation")) throw new Error(`${PRIVATE_SQL} recovery query failed`);
      return [];
    }),
    new FakeClient(async (text) => {
      if (text.includes("quick_links_recover_provider_operation")) return [row("operation_replayed", providerProjection("active", 1))];
      if (text === "COMMIT") throw new Error("recovery commit failed");
      return [];
    }),
  ];
  for (const recoveryFailure of recoveryFailures) {
    const uncertainWrite = new FakeClient(async (text) => {
      if (text.includes("quick_links_configure_provider")) return [row("committed", providerProjection("active", 1))];
      if (text === "COMMIT") throw new Error("writer commit failed");
      return [];
    });
    await assert.rejects(
      repository(new FakePool([uncertainWrite, recoveryFailure])).configureProvider(configureInput()),
      errorCode("commit_unknown"),
    );
    assert.equal(functionCalls(uncertainWrite).length, 1);
  }
});

test("revokeProvider recovers an unknown commit once, including replay, without issuing a second revoke", async () => {
  const write = new FakeClient(async (text) => {
    if (text.includes("quick_links_revoke_provider")) return [row("operation_replayed", providerProjection("revoked", 2))];
    if (text === "COMMIT") throw new Error("connection lost");
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
    ? [row("operation_replayed", providerProjection("revoked", 2))]
    : []);
  const result = await repository(new FakePool([write, recovery])).revokeProvider(revokeInput());
  assert.deepEqual(result, { status: "revoked", providerConfigId: PROVIDER_CONFIG_ID, version: 2 });
  assert.equal(functionCalls(write).length, 1);
  assert.equal(functionCalls(recovery).length, 1);
  assert.equal(recovery.calls.at(-1)!.text, "COMMIT");

  const recoveryFailures: Array<FakeClient | Error> = [
    new Error("recovery acquire failed"),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? [row("operation_mismatch", null)]
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? [row("not_found", null)]
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? [row("operation_replayed", { status: "revoked" })]
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_provider_operation")
      ? { rows: [row("operation_replayed", providerProjection("revoked", 2)), row("operation_replayed", providerProjection("revoked", 2))], rowCount: 2 }
      : []),
    new FakeClient(async (text) => {
      if (text.includes("quick_links_recover_provider_operation")) throw new Error(PRIVATE_SQL);
      return [];
    }),
    new FakeClient(async (text) => {
      if (text.includes("quick_links_recover_provider_operation")) return [row("operation_replayed", providerProjection("revoked", 2))];
      if (text === "COMMIT") throw new Error("recovery commit failed");
      return [];
    }),
  ];
  for (const recoveryFailure of recoveryFailures) {
    const uncertainWrite = new FakeClient(async (text) => {
      if (text.includes("quick_links_revoke_provider")) return [row("committed", providerProjection("revoked", 2))];
      if (text === "COMMIT") throw new Error("writer commit failed");
      return [];
    });
    await assert.rejects(
      repository(new FakePool([uncertainWrite, recoveryFailure])).revokeProvider(revokeInput()),
      errorCode("commit_unknown"),
    );
    assert.equal(functionCalls(uncertainWrite).length, 1);
  }
});
