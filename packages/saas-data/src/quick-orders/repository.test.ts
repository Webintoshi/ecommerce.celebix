import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  QUICK_LINK_ERROR_CODES,
  PostgresQuickOrderLinkRepository,
  QuickOrderLinkRepositoryError,
  type CreateQuickLinkInput,
  type DuplicateQuickLinkInput,
} from "./index.ts";

const STORE_ID = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const LINK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_LINK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NEW_ITEM_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VARIANT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PROVIDER_CONFIG_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-07-21T08:00:00.000Z");
const TOKEN_DIGEST = "1".repeat(64);
const PRIVATE_REQUEST = "private-quick-link-request";
const PRIVATE_SUBJECT = "private-identity-subject";
const PRIVATE_DRIVER = "postgres://private@database/celebix";

function tenantContext(overrides: Record<string, unknown> = {}): TenantContext {
  return {
    schemaVersion: 1,
    requestId: PRIVATE_REQUEST,
    principal: { id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: PRIVATE_SUBJECT },
    store: { id: STORE_ID, slug: "atlas-store", status: "active" },
    membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "merchant_growth",
      version: 3,
      status: "active",
      features: ["catalog", "orders", "checkout"],
      limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
    ...overrides,
  } as TenantContext;
}

function address() {
  return {
    recipientName: "Ada Lovelace",
    phone: "+905551112233",
    line1: "1 Logic Street",
    district: "Kadikoy",
    city: "Istanbul",
    postalCode: "34710",
    country: "TR",
  };
}

function sealedToken(keyId = "quick-link-key-2026") {
  return {
    algorithm: "A256GCM" as const,
    ciphertext: "AQ",
    iv: "AAAAAAAAAAAAAAAA",
    keyId,
    tag: "AAAAAAAAAAAAAAAAAAAAAA",
    version: 1 as const,
  };
}

function listItem(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    firstProductName: "Atlas Mug",
    itemCount: 1,
    status: "active",
    currency: "TRY",
    totalCents: 13_000,
    expiresAt: "2026-07-22T08:00:00.000000Z",
    createdAt: "2026-07-21T08:00:00.000000Z",
    version: 1,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...listItem(),
    customerPhone: "+905551112233",
    shippingAddress: address(),
    billingAddress: address(),
    customerNote: "Leave at reception",
    internalLabel: "VIP",
    providerKey: "paytr",
    subtotalCents: 12_500,
    shippingCents: 1_000,
    discountCents: 500,
    items: [{
      id: ITEM_ID,
      position: 0,
      productName: "Atlas Mug",
      variantName: "Black",
      sku: "ATLAS-BLACK",
      unitPriceCents: 12_500,
      quantity: 1,
      lineTotalCents: 12_500,
    }],
    updatedAt: "2026-07-21T08:00:00.000000Z",
    ...overrides,
  };
}

function mutation(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    status: "active",
    version: 1,
    expiresAt: "2026-07-22T08:00:00.000000Z",
    updatedAt: "2026-07-21T08:00:00.000000Z",
    ...overrides,
  };
}

function createInput(overrides: Record<string, unknown> = {}): CreateQuickLinkInput {
  return {
    tenantContext: tenantContext(),
    now: NOW,
    operationId: OPERATION_ID,
    linkId: LINK_ID,
    items: [{ itemId: ITEM_ID, variantId: VARIANT_ID, quantity: 1 }],
    providerConfigId: PROVIDER_CONFIG_ID,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "+905551112233",
    shippingAddress: address(),
    billingAddress: address(),
    customerNote: "Leave at reception",
    internalLabel: "VIP",
    shippingCents: 1_000,
    discountCents: 500,
    expiryHours: 24,
    tokenDigest: TOKEN_DIGEST,
    sealedToken: sealedToken(),
    ...overrides,
  } as CreateQuickLinkInput;
}

function duplicateInput(overrides: Record<string, unknown> = {}): DuplicateQuickLinkInput {
  return {
    tenantContext: tenantContext(),
    now: NOW,
    linkId: LINK_ID,
    operationId: OPERATION_ID,
    newLinkId: NEW_LINK_ID,
    newItemIds: [NEW_ITEM_ID],
    tokenDigest: TOKEN_DIGEST,
    sealedToken: sealedToken(),
    ...overrides,
  } as DuplicateQuickLinkInput;
}

type Row = Record<string, unknown>;
type Response = Readonly<{ rows: Row[]; rowCount?: number | null }>;
type Responder = (text: string, values: unknown[]) => Row[] | Response | Promise<Row[] | Response>;

class FakeClient {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly responder: Responder;

  constructor(responder: Responder = () => []) {
    this.responder = responder;
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
  }

  get destroyed() {
    return this.releases.some((value) => value === true || value instanceof Error);
  }
}

class FakePool {
  readonly clients: Array<FakeClient | Error>;
  connects = 0;

  constructor(...clients: Array<FakeClient | Error>) {
    this.clients = clients;
  }

  async connect() {
    this.connects += 1;
    const selected = this.clients[this.connects - 1];
    if (selected instanceof Error) throw selected;
    if (!selected) throw new Error("unexpected pool checkout");
    return selected;
  }
}

function repository(
  pool: FakePool,
  overrides: Partial<ConstructorParameters<typeof PostgresQuickOrderLinkRepository>[0]> = {},
) {
  return new PostgresQuickOrderLinkRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
    ...overrides,
  });
}

function functionCall(client: FakeClient, name: string) {
  const call = client.calls.find(({ text }) => text.includes(`saas.${name}`));
  assert.ok(call, `missing ${name} call`);
  return call;
}

function quickLinkError(code: string) {
  return (error: unknown) => (
    error instanceof QuickOrderLinkRepositoryError &&
    error.code === code &&
    error.message === code &&
    !String(error).includes(PRIVATE_DRIVER) &&
    !String(error).includes(TOKEN_DIGEST)
  );
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`;
}

function fingerprint(kind: string, payload: unknown) {
  return createHash("sha256").update(stableSerialize({ kind, storeId: STORE_ID, payload }), "utf8").digest("hex");
}

test("exports the exact frozen error vocabulary and repository method surface", () => {
  assert.deepEqual(QUICK_LINK_ERROR_CODES, [
    "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
    "action_denied", "quick_link_not_found", "provider_not_ready", "catalog_item_unavailable",
    "stock_unavailable", "invalid_transition", "version_conflict", "operation_replayed",
    "operation_mismatch", "durable_authority_invalid", "unavailable", "commit_unknown",
  ]);
  assert.equal(Object.isFrozen(QUICK_LINK_ERROR_CODES), true);
  assert.deepEqual(Object.getOwnPropertyNames(PostgresQuickOrderLinkRepository.prototype).sort(), [
    "cancel", "constructor", "create", "duplicate", "get", "list",
  ]);
});

test("constructor rejects non-exact options, prototypes, roles, callbacks, and timeout records", () => {
  const base = {
    pool: new FakePool(), role: "celebix_saas_app" as const,
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
  };
  const invalid = [
    { ...base, role: "celebix_saas_owner" },
    { ...base, audit: null },
    { ...base, privateKey: PRIVATE_DRIVER },
    { ...base, timeouts: { ...base.timeouts, poolCheckoutMs: 0 } },
    { ...base, timeouts: { ...base.timeouts, extra: 1 } },
    Object.assign(Object.create({ inherited: true }), base),
  ];
  for (const options of invalid) {
    assert.throws(() => new PostgresQuickOrderLinkRepository(options as never), quickLinkError("unavailable"));
  }
  assert.throws(() => new PostgresQuickOrderLinkRepository(new Proxy({} as never, {
    ownKeys: () => { throw new Error(PRIVATE_DRIVER); },
  })), quickLinkError("unavailable"));
});

test("list validates authority, configures a read-only transaction, and binds an opaque exact cursor", async () => {
  const first = listItem({ id: NEW_LINK_ID, createdAt: "2026-07-21T09:00:00.000000Z", expiresAt: "2026-07-22T09:00:00.000000Z" });
  const second = listItem({ createdAt: "2026-07-21T08:00:00.000800Z", expiresAt: "2026-07-22T08:00:00.000800Z" });
  const client = new FakeClient((text) => text.includes("saas.quick_links_list")
    ? [{ outcome: "listed", result_payload: { items: [first, second], nextCursor: { createdAt: second.createdAt, id: LINK_ID } } }]
    : []);
  const result = await repository(new FakePool(client)).list({ tenantContext: tenantContext(), now: NOW, pageSize: 2, status: "active" });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.items[0]), true);
  assert.equal(typeof result.nextCursor, "string");
  assert.equal(result.nextCursor?.includes(STORE_ID), false);
  assert.deepEqual(client.calls.slice(0, 5).map(({ text }) => text), [
    "BEGIN READ ONLY",
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_app",
  ]);
  assert.deepEqual(client.calls.slice(1, 4).map(({ values }) => values), [["500ms"], ["300ms"], ["700ms"]]);
  const call = functionCall(client, "quick_links_list");
  assert.match(call.text, /\$1::uuid,\$2::uuid,\$3::uuid,\$4::uuid,\$5::text,\$6::bigint,\$7::timestamptz,\s*\$8::text,\$9::bigint,\$10::timestamptz,\$11::uuid/);
  assert.deepEqual(call.values, [STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW, "active", 2, null, null]);
  assert.notEqual(call.values[6], NOW);
  assert.equal(Object.isFrozen(call.values[6]), true);
  assert.equal(call.values.includes(PRIVATE_REQUEST), false);
  assert.equal(call.values.includes(PRIVATE_SUBJECT), false);

  const page2 = new FakeClient((text) => text.includes("saas.quick_links_list")
    ? [{ outcome: "listed", result_payload: { items: [] } }]
    : []);
  await repository(new FakePool(page2)).list({
    tenantContext: tenantContext(), now: NOW, pageSize: 2, status: "active", cursor: result.nextCursor,
  });
  assert.deepEqual(functionCall(page2, "quick_links_list").values.slice(9), [second.createdAt, LINK_ID]);

  const tampered = `${result.nextCursor?.slice(0, -1)}A`;
  const tamperPool = new FakePool();
  await assert.rejects(repository(tamperPool).list({
    tenantContext: tenantContext(), now: NOW, pageSize: 2, status: "active", cursor: tampered,
  }), quickLinkError("invalid_input"));
  assert.equal(tamperPool.connects, 0);
});

test("list rejects a database cursor that differs from the normalized final DTO by one hundred microseconds", async () => {
  const finalItem = listItem({ createdAt: "2026-07-21T08:00:00.000800Z", expiresAt: "2026-07-22T08:00:00.000800Z" });
  const client = new FakeClient((text) => text.includes("saas.quick_links_list")
    ? [{ outcome: "listed", result_payload: { items: [finalItem], nextCursor: { createdAt: "2026-07-21T08:00:00.000700Z", id: LINK_ID } } }]
    : []);
  await assert.rejects(repository(new FakePool(client)).list({
    tenantContext: tenantContext(), now: NOW, pageSize: 1,
  }), quickLinkError("unavailable"));
});

test("get uses the exact signature and returns only a deeply frozen Task 1 projection", async () => {
  const client = new FakeClient((text) => text.includes("saas.quick_links_get")
    ? [{ outcome: "found", result_payload: detail() }]
    : []);
  const result = await repository(new FakePool(client)).get({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID });
  assert.deepEqual(result, detail());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.shippingAddress), true);
  const call = functionCall(client, "quick_links_get");
  assert.match(call.text, /\$1::uuid,\$2::uuid,\$3::uuid,\$4::uuid,\$5::text,\$6::bigint,\$7::timestamptz,\$8::uuid/);
  assert.deepEqual(call.values, [STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW, LINK_ID]);
  assert.equal("tokenDigest" in result, false);
  assert.equal("providerConfigId" in result, false);
});

test("create binds migration 025 argument order, derives token key ID, and uses the stable public intent fingerprint", async () => {
  const client = new FakeClient((text) => text.includes("saas.quick_links_create")
    ? [{ outcome: "committed", result_payload: mutation() }]
    : []);
  const result = await repository(new FakePool(client)).create(createInput());
  assert.deepEqual(result, { ...mutation(), replayed: false });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.keys(result).sort().join(","), "expiresAt,id,replayed,status,updatedAt,version");

  const call = functionCall(client, "quick_links_create");
  assert.match(call.text, /\$25::jsonb,\$26::uuid,\$27::text/);
  assert.deepEqual(call.values.slice(7, 26), [
    LINK_ID, [ITEM_ID], [VARIANT_ID], [1], PROVIDER_CONFIG_ID,
    "Ada Lovelace", "ada@example.com", "+905551112233",
    JSON.stringify(address()), JSON.stringify(address()), "Leave at reception", "VIP",
    1_000, 500, 24, TOKEN_DIGEST, "quick-link-key-2026", JSON.stringify(sealedToken()), OPERATION_ID,
  ]);
  const expected = fingerprint("create", {
    customerName: "Ada Lovelace", customerEmail: "ada@example.com", customerPhone: "+905551112233",
    shippingAddress: address(), billingAddress: address(), customerNote: "Leave at reception", internalLabel: "VIP",
    shippingCents: 1_000, discountCents: 500, expiryHours: 24,
    items: [{ variantId: VARIANT_ID, quantity: 1 }], providerConfigId: PROVIDER_CONFIG_ID,
  });
  assert.equal(call.values[26], expected);
  const serializedValues = JSON.stringify(call.values);
  assert.equal(serializedValues.includes(PRIVATE_REQUEST), false);
  assert.equal(serializedValues.includes(PRIVATE_SUBJECT), false);
});

test("create fingerprint excludes generated IDs, digest, and sealed token while remaining kind and store bound", async () => {
  const calls: unknown[][] = [];
  for (const input of [
    createInput(),
    createInput({
      linkId: NEW_LINK_ID,
      items: [{ itemId: NEW_ITEM_ID, variantId: VARIANT_ID, quantity: 1 }],
      tokenDigest: "2".repeat(64),
      sealedToken: sealedToken("rotated-key"),
    }),
  ]) {
    const client = new FakeClient((text, values) => {
      if (text.includes("saas.quick_links_create")) {
        calls.push(values);
        return [{ outcome: "committed", result_payload: mutation({ id: input.linkId }) }];
      }
      return [];
    });
    await repository(new FakePool(client)).create(input);
  }
  assert.equal(calls[0]?.[26], calls[1]?.[26]);
});

test("cancel and duplicate bind exact signatures and minimal stable fingerprints", async () => {
  const cancelClient = new FakeClient((text) => text.includes("saas.quick_links_cancel")
    ? [{ outcome: "committed", result_payload: mutation({ status: "cancelled", version: 2 }) }]
    : []);
  await repository(new FakePool(cancelClient)).cancel({
    tenantContext: tenantContext(), now: NOW, linkId: LINK_ID, operationId: OPERATION_ID, expectedVersion: 1,
  });
  const cancel = functionCall(cancelClient, "quick_links_cancel");
  assert.match(cancel.text, /\$8::uuid,\$9::bigint,\$10::uuid,\$11::text/);
  assert.deepEqual(cancel.values.slice(7), [LINK_ID, 1, OPERATION_ID, fingerprint("cancel", { linkId: LINK_ID, expectedVersion: 1 })]);

  const duplicateClient = new FakeClient((text) => text.includes("saas.quick_links_duplicate")
    ? [{ outcome: "committed", result_payload: mutation({ id: NEW_LINK_ID }) }]
    : []);
  await repository(new FakePool(duplicateClient)).duplicate(duplicateInput());
  const duplicate = functionCall(duplicateClient, "quick_links_duplicate");
  assert.match(duplicate.text, /\$13::jsonb,\$14::uuid,\$15::text/);
  assert.deepEqual(duplicate.values.slice(7), [
    LINK_ID, NEW_LINK_ID, [NEW_ITEM_ID], TOKEN_DIGEST, "quick-link-key-2026", JSON.stringify(sealedToken()),
    OPERATION_ID, fingerprint("duplicate", { sourceLinkId: LINK_ID }),
  ]);
});

test("all input and authority validation runs before checkout and contains hostile access", async () => {
  const invalidContexts = [
    tenantContext({ principal: undefined }),
    tenantContext({ store: { id: STORE_ID, slug: "atlas-store", status: "disabled" } }),
    tenantContext({ membership: { id: MEMBERSHIP_ID, role: "owner", status: "active" } }),
    tenantContext({ entitlements: { ...tenantContext().entitlements, features: ["orders"] } }),
    tenantContext({ entitlements: { ...tenantContext().entitlements, validUntil: NOW.toISOString() } }),
  ];
  for (const context of invalidContexts) {
    const pool = new FakePool();
    await assert.rejects(repository(pool).list({ tenantContext: context, now: NOW, pageSize: 20 }));
    assert.equal(pool.connects, 0);
  }

  const invalidInputs: unknown[] = [
    { ...createInput(), pageSize: 20 },
    { ...createInput(), operationId: "not-a-uuid" },
    { ...createInput(), items: [] },
    { ...createInput(), items: [{ itemId: ITEM_ID, variantId: VARIANT_ID, quantity: 0 }] },
    { ...createInput(), tokenDigest: `${TOKEN_DIGEST.slice(0, -1)}A` },
    { ...createInput(), sealedToken: { ...sealedToken(), iv: "not-base64" } },
    { ...createInput(), shippingAddress: { ...address(), private: PRIVATE_DRIVER } },
  ];
  for (const input of invalidInputs) {
    const pool = new FakePool();
    await assert.rejects(repository(pool).create(input as CreateQuickLinkInput), quickLinkError("invalid_input"));
    assert.equal(pool.connects, 0);
  }

  let getterInvoked = false;
  const hostile = Object.defineProperty({ ...createInput() }, "customerName", {
    enumerable: true,
    get() { getterInvoked = true; throw new Error(PRIVATE_DRIVER); },
  });
  const hostilePool = new FakePool();
  await assert.rejects(repository(hostilePool).create(hostile as CreateQuickLinkInput), quickLinkError("invalid_input"));
  assert.equal(getterInvoked, false);
  assert.equal(hostilePool.connects, 0);

  const proxyPool = new FakePool();
  await assert.rejects(repository(proxyPool).create(new Proxy(createInput(), {
    ownKeys: () => { throw new Error(PRIVATE_DRIVER); },
  })), quickLinkError("invalid_input"));
  assert.equal(proxyPool.connects, 0);
});

test("controlled outcomes rollback and expose only the finite safe repository errors", async () => {
  for (const outcome of [
    "invalid_input", "membership_denied", "store_inactive", "feature_not_enabled", "action_denied",
    "quick_link_not_found", "provider_not_ready", "catalog_item_unavailable", "stock_unavailable",
    "invalid_transition", "version_conflict", "operation_mismatch",
  ]) {
    const client = new FakeClient((text) => text.includes("saas.quick_links_create")
      ? [{ outcome, result_payload: null }]
      : []);
    await assert.rejects(repository(new FakePool(client)).create(createInput()), quickLinkError(outcome));
    assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
    assert.deepEqual(client.releases, [undefined]);
  }

  const replayClient = new FakeClient((text) => text.includes("saas.quick_links_create")
    ? [{ outcome: "operation_replayed", result_payload: mutation() }]
    : []);
  const replay = await repository(new FakePool(replayClient)).create(createInput());
  assert.equal(replay.replayed, true);
  assert.equal(Object.isFrozen(replay), true);
});

test("driver failures and malformed one-row outcomes map safely with correct rollback and release", async () => {
  const checkoutPool = new FakePool(new Error(`${PRIVATE_DRIVER} 57P01`));
  await assert.rejects(repository(checkoutPool).get({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID }), quickLinkError("unavailable"));

  for (const response of [
    { rows: [], rowCount: 0 },
    { rows: [{ outcome: "found", result_payload: detail() }], rowCount: 2 },
    { rows: [{ outcome: "found", result_payload: detail(), sql: PRIVATE_DRIVER }] },
    { rows: [{ outcome: "invented", result_payload: detail() }] },
  ] satisfies Response[]) {
    const client = new FakeClient((text) => text.includes("saas.quick_links_get") ? response : []);
    await assert.rejects(repository(new FakePool(client)).get({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID }), quickLinkError("unavailable"));
  }

  const queryFailure = new FakeClient((text) => {
    if (text.includes("saas.quick_links_get")) throw new Error(`${PRIVATE_DRIVER} SELECT * FROM private_tokens`);
    return [];
  });
  await assert.rejects(repository(new FakePool(queryFailure)).get({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID }), quickLinkError("unavailable"));
  assert.equal(queryFailure.calls.some(({ text }) => text === "ROLLBACK"), true);

  const beginFailure = new FakeClient((text) => {
    if (text === "BEGIN READ ONLY") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  await assert.rejects(repository(new FakePool(beginFailure)).get({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID }), quickLinkError("unavailable"));
  assert.equal(beginFailure.destroyed, true);
  assert.equal(beginFailure.calls.some(({ text }) => text === "ROLLBACK"), false);

  const readCommitFailure = new FakeClient((text) => {
    if (text.includes("saas.quick_links_get")) return [{ outcome: "found", result_payload: detail() }];
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  await assert.rejects(repository(new FakePool(readCommitFailure)).get({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID }), quickLinkError("unavailable"));
  assert.equal(readCommitFailure.destroyed, true);
  assert.equal(readCommitFailure.calls.some(({ text }) => text === "ROLLBACK"), false);
});

test("known mutation COMMIT returns once, releases normally, and audit cannot alter it", async () => {
  let audits = 0;
  const client = new FakeClient((text) => text.includes("saas.quick_links_create")
    ? [{ outcome: "committed", result_payload: mutation() }]
    : []);
  const result = await repository(new FakePool(client), { audit: () => { audits += 1; throw new Error(PRIVATE_DRIVER); } }).create(createInput());
  assert.equal(result.replayed, false);
  assert.equal(audits, 0);
  assert.deepEqual(client.releases, [undefined]);
  assert.equal(client.calls.filter(({ text }) => text.includes("quick_links_create")).length, 1);
});

test("unknown mutation COMMIT destroys the writer and performs exactly one fresh read-only recovery", async () => {
  let writeCalls = 0;
  let recoveryCalls = 0;
  const writer = new FakeClient((text) => {
    if (text.includes("saas.quick_links_create")) {
      writeCalls += 1;
      return [{ outcome: "committed", result_payload: mutation() }];
    }
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const recovery = new FakeClient((text) => {
    if (text.includes("saas.quick_links_recover_operation")) {
      recoveryCalls += 1;
      return [{ outcome: "operation_replayed", result_payload: mutation() }];
    }
    return [];
  });
  const audits: unknown[] = [];
  const result = await repository(new FakePool(writer, recovery), { audit: (event) => { audits.push(event); } }).create(createInput());

  assert.deepEqual(result, { ...mutation(), replayed: true });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(writer.destroyed, true);
  assert.equal(writer.calls.some(({ text }) => text === "ROLLBACK"), false);
  assert.equal(writeCalls, 1);
  assert.equal(recoveryCalls, 1);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.some(({ text }) => text.includes("quick_links_create")), false);
  const write = functionCall(writer, "quick_links_create");
  const recovered = functionCall(recovery, "quick_links_recover_operation");
  assert.deepEqual(recovered.values, [...write.values.slice(0, 7), OPERATION_ID, "create", write.values[26]]);
  assert.deepEqual(audits, [{ type: "quick_link_commit_unknown" }]);
});

test("every failed unknown-COMMIT recovery preserves commit_unknown without rollback, reuse, or a second write", async () => {
  const scenarios: Array<"acquire" | "missing" | "multiple" | "malformed" | "mismatch" | "query" | "commit"> = [
    "acquire", "missing", "multiple", "malformed", "mismatch", "query", "commit",
  ];
  for (const scenario of scenarios) {
    let writeCalls = 0;
    let recoveryCalls = 0;
    const writer = new FakeClient((text) => {
      if (text.includes("saas.quick_links_create")) {
        writeCalls += 1;
        return [{ outcome: "committed", result_payload: mutation() }];
      }
      if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
      return [];
    });
    const recovery = new FakeClient((text) => {
      if (text.includes("saas.quick_links_recover_operation")) {
        recoveryCalls += 1;
        if (scenario === "query") throw new Error(PRIVATE_DRIVER);
        if (scenario === "missing") return [{ outcome: "quick_link_not_found", result_payload: null }];
        if (scenario === "multiple") return { rows: [{ outcome: "operation_replayed", result_payload: mutation() }], rowCount: 2 };
        if (scenario === "malformed") return [{ outcome: "operation_replayed", result_payload: mutation({ replayed: false }) }];
        if (scenario === "mismatch") return [{ outcome: "operation_mismatch", result_payload: null }];
        return [{ outcome: "operation_replayed", result_payload: mutation() }];
      }
      if (text === "COMMIT" && scenario === "commit") throw new Error(PRIVATE_DRIVER);
      return [];
    });
    const pool = scenario === "acquire"
      ? new FakePool(writer, new Error(PRIVATE_DRIVER))
      : new FakePool(writer, recovery);

    await assert.rejects(repository(pool).create(createInput()), quickLinkError("commit_unknown"));
    assert.equal(writer.destroyed, true);
    assert.equal(writer.calls.some(({ text }) => text === "ROLLBACK"), false);
    assert.equal(writeCalls, 1);
    assert.equal(recoveryCalls, scenario === "acquire" ? 0 : 1);
    assert.equal(recovery.calls.some(({ text }) => text.includes("quick_links_create")), false);
    assert.ok(pool.connects <= 2);
    if (scenario === "query" || scenario === "commit") assert.equal(recovery.destroyed, true);
  }
});

test("sync and async audit failures are contained after unknown COMMIT", async () => {
  for (const audit of [
    () => { throw new Error(PRIVATE_DRIVER); },
    async () => { throw new Error(PRIVATE_DRIVER); },
  ]) {
    const writer = new FakeClient((text) => {
      if (text.includes("saas.quick_links_duplicate")) return [{ outcome: "committed", result_payload: mutation({ id: NEW_LINK_ID }) }];
      if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
      return [];
    });
    const recovery = new FakeClient((text) => text.includes("saas.quick_links_recover_operation")
      ? [{ outcome: "operation_replayed", result_payload: mutation({ id: NEW_LINK_ID }) }]
      : []);
    const result = await repository(new FakePool(writer, recovery), { audit }).duplicate(duplicateInput());
    assert.equal(result.replayed, true);
  }
});

test("projection corruption, private fields, wrong IDs, and replayed SQL fields fail closed", async () => {
  const corruptDetails = [
    detail({ tokenDigest: TOKEN_DIGEST }),
    detail({ id: NEW_LINK_ID }),
    detail({ providerConfigId: PROVIDER_CONFIG_ID }),
  ];
  for (const payload of corruptDetails) {
    const client = new FakeClient((text) => text.includes("saas.quick_links_get")
      ? [{ outcome: "found", result_payload: payload }]
      : []);
    await assert.rejects(repository(new FakePool(client)).get({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID }), quickLinkError("unavailable"));
  }
  for (const payload of [mutation({ replayed: false }), mutation({ id: NEW_LINK_ID }), mutation({ tokenDigest: TOKEN_DIGEST })]) {
    const client = new FakeClient((text) => text.includes("saas.quick_links_create")
      ? [{ outcome: "committed", result_payload: payload }]
      : []);
    await assert.rejects(repository(new FakePool(client)).create(createInput()), quickLinkError("unavailable"));
  }
});
