import assert from "node:assert/strict";
import test from "node:test";

import { QuickOrderLinkRepositoryError } from "./errors.ts";
import {
  PostgresPublicQuickOrderRepository,
  type ClaimRedemptionInput,
  type ResolveRedemptionInput,
} from "./public-repository.ts";

const HOSTNAME = "atlas.example.com";
const REDEMPTION_ID = "99999999-9999-4999-8999-999999999999";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const TOKEN_DIGEST = "1".repeat(64);
const REDEMPTION_DIGEST = "2".repeat(64);
const FINGERPRINT = "3".repeat(64);
const NOW = new Date("2026-07-21T08:00:00.000Z");
const EXPIRES_AT = new Date("2026-07-21T08:15:00.000Z");
const PRIVATE_DRIVER = "postgres://workflow-secret@database/celebix";
const PRIVATE_SQL = "SELECT * FROM saas.private_quick_orders";

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

function quote() {
  return {
    schemaVersion: 1,
    status: "opened",
    merchantName: "Atlas Store",
    currency: "TRY",
    subtotalCents: 12_500,
    shippingCents: 1_000,
    discountCents: 500,
    totalCents: 13_000,
    expiresAt: "2026-07-22T08:00:00.000000Z",
    items: [{
      productName: "Atlas Mug",
      variantName: "Black",
      imageUrl: "https://cdn.example.com/atlas-mug.webp",
      unitPriceCents: 12_500,
      quantity: 1,
      lineTotalCents: 12_500,
    }],
  };
}

function redemptionProjection() {
  return {
    canonicalHostname: HOSTNAME,
    redemptionExpiresAt: "2026-07-21T08:15:00.000000Z",
    quote: quote(),
  };
}

function row(outcome: string, resultPayload: unknown): Row {
  return { outcome, result_payload: resultPayload };
}

function claimInput(): ClaimRedemptionInput {
  return {
    hostname: HOSTNAME,
    tokenDigest: TOKEN_DIGEST,
    redemptionId: REDEMPTION_ID,
    redemptionDigest: REDEMPTION_DIGEST,
    now: NOW,
    expiresAt: EXPIRES_AT,
  };
}

function resolveInput(): ResolveRedemptionInput {
  return { hostname: HOSTNAME, redemptionDigest: REDEMPTION_DIGEST, now: NOW };
}

function repository(pool: FakePool, audit: (event: unknown) => void | Promise<void> = () => undefined) {
  return new PostgresPublicQuickOrderRepository({
    pool,
    role: "celebix_saas_workflow",
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

test("public repository exposes only the Task 5 method surface and requires the exact workflow role", () => {
  assert.deepEqual(Object.getOwnPropertyNames(PostgresPublicQuickOrderRepository.prototype).sort(), [
    "claimRedemption", "constructor", "getStatus", "resolveRedemption", "revokeRedemption",
  ]);
  const options = {
    pool: new FakePool([]),
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
  };
  assert.throws(() => new PostgresPublicQuickOrderRepository(options as never), errorCode("unavailable"));
  assert.throws(() => new PostgresPublicQuickOrderRepository({ ...options, role: "celebix_saas_workflow", extra: true } as never), errorCode("unavailable"));
});

test("claimRedemption uses the exact workflow transaction, timeout envelope, SQL parameters, and safe quote", async () => {
  const client = new FakeClient((text) => text.includes("quick_links_claim_redemption")
    ? [row("claimed", redemptionProjection())]
    : []);
  const result = await repository(new FakePool([client])).claimRedemption(claimInput());
  assert.deepEqual(result, { quote: quote(), expiresAt: "2026-07-21T08:15:00.000000Z" });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.quote.items), true);
  assert.equal(Object.isFrozen(result.quote.items[0]), true);
  assert.deepEqual(client.calls.slice(0, 5).map(({ text }) => text), [
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_workflow",
  ]);
  assert.deepEqual(client.calls.slice(1, 4).map(({ values }) => values), [["500ms"], ["300ms"], ["700ms"]]);
  assert.match(client.calls[5]!.text, /saas\.quick_links_claim_redemption/);
  assert.deepEqual(client.calls[5]!.values, [HOSTNAME, TOKEN_DIGEST, REDEMPTION_ID, REDEMPTION_DIGEST, NOW, EXPIRES_AT]);
  assert.equal(client.calls[6]!.text, "COMMIT");
  assert.deepEqual(client.releases, [undefined]);
});

test("claimRedemption accepts a row-locked persisted expiry below the requested maximum", async () => {
  const nearExpiry = { ...redemptionProjection(), redemptionExpiresAt: "2026-07-21T08:02:00.000000Z", quote: { ...quote(), expiresAt: "2026-07-21T08:02:00.000000Z" } };
  const client = new FakeClient((text) => text.includes("quick_links_claim_redemption") ? [row("claimed", nearExpiry)] : []);
  assert.deepEqual(await repository(new FakePool([client])).claimRedemption(claimInput()), {
    quote: nearExpiry.quote,
    expiresAt: nearExpiry.redemptionExpiresAt,
  });
  assert.equal(functionCalls(client).length, 1);
});

test("claimRedemption controls SQL outcomes and proves unknown commits with one read-only exact-host resolve", async () => {
  for (const [outcome, expected] of [
    ["canonicalize", "unavailable"],
    ["not_found", "quick_link_not_found"],
    ["invalid_input", "invalid_input"],
    ["operation_mismatch", "operation_mismatch"],
  ] as const) {
    const client = new FakeClient((text) => text.includes("quick_links_claim_redemption")
      ? [row(outcome, { canonicalHostname: "other.example.com" })]
      : []);
    await assert.rejects(repository(new FakePool([client])).claimRedemption(claimInput()), errorCode(expected));
    assert.equal(client.calls.at(-1)!.text, "ROLLBACK");
  }
  for (const projection of [
    { ...redemptionProjection(), canonicalHostname: "other.example.com" },
    { ...redemptionProjection(), redemptionExpiresAt: "2026-07-21T08:15:01.000000Z" },
    { ...redemptionProjection(), redemptionExpiresAt: "2026-07-21T08:00:00.000000Z" },
    {
      ...redemptionProjection(),
      quote: { ...quote(), expiresAt: "2026-07-21T08:14:59.000000Z" },
    },
  ]) {
    const mismatch = new FakeClient((text) => text.includes("quick_links_claim_redemption")
      ? [row("claimed", projection)]
      : []);
    await assert.rejects(repository(new FakePool([mismatch])).claimRedemption(claimInput()), errorCode("unavailable"));
  }

  const write = new FakeClient(async (text) => {
    if (text.includes("quick_links_claim_redemption")) return [row("claimed", redemptionProjection())];
    if (text === "COMMIT") throw new Error("writer commit failed");
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("quick_links_resolve_redemption")
    ? [row("found", redemptionProjection())]
    : []);
  assert.deepEqual(await repository(new FakePool([write, recovery])).claimRedemption(claimInput()), {
    quote: quote(), expiresAt: "2026-07-21T08:15:00.000000Z",
  });
  assert.deepEqual(write.releases, [true]);
  assert.equal(functionCalls(write).length, 1);
  assert.equal(recovery.calls[0]!.text, "BEGIN READ ONLY");
  assert.match(functionCalls(recovery)[0]!.text, /saas\.quick_links_resolve_redemption/);
  assert.deepEqual(functionCalls(recovery)[0]!.values, [HOSTNAME, REDEMPTION_DIGEST, NOW]);
  assert.equal(recovery.calls.at(-1)!.text, "COMMIT");

  const recoveryFailures: Array<FakeClient | Error> = [
    new Error(`${PRIVATE_DRIVER} recovery acquire failed`),
    new FakeClient((text) => text.includes("quick_links_resolve_redemption") ? [row("operation_mismatch", null)] : []),
    new FakeClient((text) => text.includes("quick_links_resolve_redemption") ? [row("not_found", null)] : []),
    new FakeClient((text) => text.includes("quick_links_resolve_redemption") ? [row("found", { quote: quote() })] : []),
    new FakeClient((text) => text.includes("quick_links_resolve_redemption")
      ? { rows: [row("found", redemptionProjection()), row("found", redemptionProjection())], rowCount: 2 }
      : []),
    new FakeClient((text) => text.includes("quick_links_resolve_redemption")
      ? [row("found", { ...redemptionProjection(), canonicalHostname: "other.example.com" })]
      : []),
    new FakeClient((text) => text.includes("quick_links_resolve_redemption")
      ? [row("found", { ...redemptionProjection(), redemptionExpiresAt: "2026-07-21T08:14:59.000000Z" })]
      : []),
    new FakeClient((text) => text.includes("quick_links_resolve_redemption")
      ? [row("found", { ...redemptionProjection(), quote: { ...quote(), merchantName: "Different Store" } })]
      : []),
    new FakeClient(async (text) => {
      if (text.includes("quick_links_resolve_redemption")) throw new Error(`${PRIVATE_SQL} recovery query failed`);
      return [];
    }),
    new FakeClient(async (text) => {
      if (text.includes("quick_links_resolve_redemption")) return [row("found", redemptionProjection())];
      if (text === "COMMIT") throw new Error("recovery commit failed");
      return [];
    }),
  ];
  for (const recoveryFailure of recoveryFailures) {
    const uncertainWrite = new FakeClient(async (text) => {
      if (text.includes("quick_links_claim_redemption")) return [row("claimed", redemptionProjection())];
      if (text === "COMMIT") throw new Error("writer commit failed");
      return [];
    });
    await assert.rejects(
      repository(new FakePool([uncertainWrite, recoveryFailure])).claimRedemption(claimInput()),
      errorCode("commit_unknown"),
    );
    assert.equal(functionCalls(uncertainWrite).length, 1);
  }
});

test("resolveRedemption uses a read-only exact-host lookup and strips the SQL envelope", async () => {
  const client = new FakeClient((text) => text.includes("quick_links_resolve_redemption")
    ? [row("found", redemptionProjection())]
    : []);
  const result = await repository(new FakePool([client])).resolveRedemption(resolveInput());
  assert.deepEqual(result, quote());
  assert.deepEqual(Object.keys(result).sort(), [
    "currency", "discountCents", "expiresAt", "items", "merchantName", "schemaVersion",
    "shippingCents", "status", "subtotalCents", "totalCents",
  ]);
  assert.equal(client.calls[0]!.text, "BEGIN READ ONLY");
  assert.equal(client.calls[4]!.text, "SET LOCAL ROLE celebix_saas_workflow");
  assert.deepEqual(functionCalls(client)[0]!.values, [HOSTNAME, REDEMPTION_DIGEST, NOW]);

  for (const projection of [
    { ...redemptionProjection(), canonicalHostname: "other.example.com" },
    { ...redemptionProjection(), redemptionExpiresAt: "2026-07-21T07:59:59.000000Z" },
  ]) {
    const mismatch = new FakeClient((text) => text.includes("quick_links_resolve_redemption")
      ? [row("found", projection)]
      : []);
    await assert.rejects(repository(new FakePool([mismatch])).resolveRedemption(resolveInput()), errorCode("unavailable"));
  }
});

test("getStatus parses and deep-freezes the ready state through the public contract validator", async () => {
  const client = new FakeClient((text) => text.includes("checkout_get_redemption_status")
    ? [row("found", { kind: "ready", quote: quote() })]
    : []);
  const result = await repository(new FakePool([client])).getStatus(resolveInput());
  assert.deepEqual(result, { kind: "ready", quote: quote() });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.kind === "ready" && Object.isFrozen(result.quote.items[0]), true);
  assert.equal(client.calls[0]!.text, "BEGIN READ ONLY");
});

test("getStatus accepts only the controlled public state union and no private fields", async () => {
  const cases = [
    { kind: "processing" },
    { kind: "paid", orderNumber: "HQ-2026-0001" },
    { kind: "failed" },
    { kind: "unavailable" },
  ] as const;
  for (const state of cases) {
    const client = new FakeClient((text) => text.includes("checkout_get_redemption_status") ? [row("found", state)] : []);
    assert.deepEqual(await repository(new FakePool([client])).getStatus(resolveInput()), state);
  }
  const privateState = new FakeClient((text) => text.includes("checkout_get_redemption_status")
    ? [row("found", { kind: "paid", orderNumber: "HQ-1", storeId: REDEMPTION_ID })]
    : []);
  await assert.rejects(repository(new FakePool([privateState])).getStatus(resolveInput()), errorCode("unavailable"));
});

test("revokeRedemption commits exactly one workflow write and returns no payload", async () => {
  const client = new FakeClient((text) => text.includes("quick_links_revoke_redemption")
    ? [row("committed", { status: "revoked" })]
    : []);
  const result = await repository(new FakePool([client])).revokeRedemption({
    ...resolveInput(), operationId: OPERATION_ID, fingerprint: FINGERPRINT,
  });
  assert.equal(result, undefined);
  assert.equal(client.calls[0]!.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.deepEqual(functionCalls(client)[0]!.values, [HOSTNAME, REDEMPTION_DIGEST, OPERATION_ID, FINGERPRINT, NOW]);
  assert.equal(client.calls.at(-1)!.text, "COMMIT");
});

test("revokeRedemption accepts an exact operation replay but rejects a hostile replay projection", async () => {
  const replay = new FakeClient((text) => text.includes("quick_links_revoke_redemption")
    ? [row("operation_replayed", { status: "revoked" })]
    : []);
  assert.equal(await repository(new FakePool([replay])).revokeRedemption({
    ...resolveInput(), operationId: OPERATION_ID, fingerprint: FINGERPRINT,
  }), undefined);
  const hostile = new FakeClient((text) => text.includes("quick_links_revoke_redemption")
    ? [row("operation_replayed", { status: "revoked", sql: PRIVATE_SQL })]
    : []);
  await assert.rejects(repository(new FakePool([hostile])).revokeRedemption({
    ...resolveInput(), operationId: OPERATION_ID, fingerprint: FINGERPRINT,
  }), errorCode("unavailable"));
});

test("revokeRedemption recovers an unknown commit with one read-only replay call and no second write", async () => {
  const audits: unknown[] = [];
  const write = new FakeClient(async (text) => {
    if (text.includes("quick_links_revoke_redemption")) return [row("committed", { status: "revoked" })];
    if (text === "COMMIT") throw new Error(`${PRIVATE_DRIVER} commit failed`);
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("quick_links_recover_redemption_revoke")
    ? [row("operation_replayed", { status: "revoked" })]
    : []);
  await repository(new FakePool([write, recovery]), (event) => { audits.push(event); }).revokeRedemption({
    ...resolveInput(), operationId: OPERATION_ID, fingerprint: FINGERPRINT,
  });
  assert.deepEqual(write.releases, [true]);
  assert.equal(functionCalls(write).length, 1);
  assert.equal(recovery.calls[0]!.text, "BEGIN READ ONLY");
  assert.deepEqual(functionCalls(recovery).map(({ text }) => text.match(/saas\.([a-z_]+)/)?.[1]), ["quick_links_recover_redemption_revoke"]);
  assert.equal(recovery.calls.at(-1)!.text, "COMMIT");
  assert.deepEqual(audits, [{ type: "quick_link_commit_unknown" }]);

  const recoveryFailures: Array<FakeClient | Error> = [
    new Error("recovery acquire failed"),
    new FakeClient((text) => text.includes("quick_links_recover_redemption_revoke") ? [row("operation_mismatch", null)] : []),
    new FakeClient((text) => text.includes("quick_links_recover_redemption_revoke") ? [row("not_found", null)] : []),
    new FakeClient((text) => text.includes("quick_links_recover_redemption_revoke")
      ? [row("operation_replayed", { status: "disabled" })]
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_redemption_revoke")
      ? { rows: [row("operation_replayed", { status: "revoked" }), row("operation_replayed", { status: "revoked" })], rowCount: 2 }
      : []),
    new FakeClient((text) => text.includes("quick_links_recover_redemption_revoke")
      ? [row("operation_replayed", { status: "revoked", sql: PRIVATE_SQL })]
      : []),
    new FakeClient(async (text) => {
      if (text.includes("quick_links_recover_redemption_revoke")) throw new Error(PRIVATE_SQL);
      return [];
    }),
    new FakeClient(async (text) => {
      if (text.includes("quick_links_recover_redemption_revoke")) return [row("operation_replayed", { status: "revoked" })];
      if (text === "COMMIT") throw new Error("recovery commit failed");
      return [];
    }),
  ];
  for (const recoveryFailure of recoveryFailures) {
    const uncertainWrite = new FakeClient(async (text) => {
      if (text.includes("quick_links_revoke_redemption")) return [row("committed", { status: "revoked" })];
      if (text === "COMMIT") throw new Error("writer commit failed");
      return [];
    });
    await assert.rejects(repository(new FakePool([uncertainWrite, recoveryFailure])).revokeRedemption({
      ...resolveInput(), operationId: OPERATION_ID, fingerprint: FINGERPRINT,
    }), errorCode("commit_unknown"));
    assert.equal(functionCalls(uncertainWrite).length, 1);
  }
});

test("hostile getters, proxies, and non-single rows fail closed and roll back", async () => {
  const getter = Object.defineProperty({}, "outcome", { enumerable: true, get: () => { throw new Error(PRIVATE_DRIVER); } });
  Object.defineProperty(getter, "result_payload", { enumerable: true, value: null });
  const hostileRows: Array<Response> = [
    { rows: [getter as Row], rowCount: 1 },
    { rows: [new Proxy(row("found", quote()), {})], rowCount: 1 },
    { rows: [], rowCount: 0 },
    { rows: [row("found", quote()), row("found", quote())], rowCount: 2 },
    { rows: [row("found", quote())], rowCount: 2 },
  ];
  for (const hostile of hostileRows) {
    const client = new FakeClient((text) => text.includes("quick_links_resolve_redemption") ? hostile : []);
    await assert.rejects(repository(new FakePool([client])).resolveRedemption(resolveInput()), errorCode("unavailable"));
    assert.equal(client.calls.at(-1)!.text, "ROLLBACK");
  }
});

test("pool, query, rollback, and release failures are sanitized and broken clients are evicted", async () => {
  await assert.rejects(
    repository(new FakePool([new Error(`${PRIVATE_DRIVER} ${PRIVATE_SQL}`)])).resolveRedemption(resolveInput()),
    errorCode("unavailable"),
  );
  const client = new FakeClient(async (text) => {
    if (text === "ROLLBACK") throw new Error(PRIVATE_DRIVER);
    if (text.includes("quick_links_resolve_redemption")) throw new Error(PRIVATE_SQL);
    return [];
  }, new Error("release failure"));
  await assert.rejects(repository(new FakePool([client])).resolveRedemption(resolveInput()), errorCode("unavailable"));
  assert.deepEqual(client.releases, [true]);
});

test("exact public inputs reject malformed hostnames, digests, dates, unknown keys, and redact public errors", async () => {
  const invalidInputs: unknown[] = [
    { ...resolveInput(), hostname: "Atlas.example.com" },
    { ...resolveInput(), hostname: "atlas.example.com.evil/" },
    { ...resolveInput(), redemptionDigest: "A".repeat(64) },
    { ...resolveInput(), now: new Date(Number.NaN) },
    { ...resolveInput(), extra: PRIVATE_DRIVER },
  ];
  for (const input of invalidInputs) {
    await assert.rejects(repository(new FakePool([])).resolveRedemption(input as ResolveRedemptionInput), errorCode("invalid_input"));
  }
  const invalidClaim = { ...claimInput(), expiresAt: new Date(NOW.getTime() + 15 * 60_000 + 1) };
  await assert.rejects(repository(new FakePool([])).claimRedemption(invalidClaim), errorCode("invalid_input"));

  const mutableNow = new Date(NOW);
  const mutableExpiry = new Date(EXPIRES_AT);
  const snapshotClient = new FakeClient((text) => text.includes("quick_links_claim_redemption")
    ? [row("claimed", redemptionProjection())]
    : []);
  const mutatingPool = new FakePool([snapshotClient]);
  const originalConnect = mutatingPool.connect.bind(mutatingPool);
  mutatingPool.connect = async () => {
    mutableNow.setUTCFullYear(2030);
    mutableExpiry.setUTCFullYear(2030);
    return originalConnect();
  };
  await repository(mutatingPool).claimRedemption({
    ...claimInput(), now: mutableNow, expiresAt: mutableExpiry,
  });
  assert.deepEqual(functionCalls(snapshotClient)[0]!.values.slice(-2), [NOW, EXPIRES_AT]);
  assert.notEqual(functionCalls(snapshotClient)[0]!.values[4], mutableNow);
  assert.notEqual(functionCalls(snapshotClient)[0]!.values[5], mutableExpiry);

  const driver = new FakeClient((text) => text.includes("quick_links_resolve_redemption")
    ? [row(`${PRIVATE_SQL} ${PRIVATE_DRIVER}`, null)]
    : []);
  await assert.rejects(repository(new FakePool([driver])).resolveRedemption(resolveInput()), errorCode("unavailable"));
});
