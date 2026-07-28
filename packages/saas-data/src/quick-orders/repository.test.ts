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
const PAYMENT_METHOD_ID = "99999999-9999-4999-8999-999999999999";
const IDENTITY_AUTHORITY = "5a".repeat(32);
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

function omit(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function resolvedHost(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    hostname: "atlas.example.com",
    domainId: "88888888-8888-4888-8888-888888888888",
    domainType: "custom",
    storeId: STORE_ID,
    storeSlug: "atlas-store",
    canonicalHostname: "atlas.example.com",
    status: "active",
    cacheVersion: 1,
    ...overrides,
  };
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

function hostedCreateInput(overrides: Record<string, unknown> = {}): CreateQuickLinkInput {
  return {
    tenantContext: tenantContext(),
    now: NOW,
    operationId: OPERATION_ID,
    linkId: LINK_ID,
    items: [{ itemId: ITEM_ID, variantId: VARIANT_ID, quantity: 1, itemType: "PHYSICAL" }],
    paymentMethodId: PAYMENT_METHOD_ID,
    buyerIdentity: {
      authority: IDENTITY_AUTHORITY,
      sealedIdentity: sealedToken("buyer-identity-key"),
    },
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

test("list cursor cannot be reused across stores or effective status filters", async () => {
  const item = listItem();
  const issuingClient = new FakeClient((text) => text.includes("saas.quick_links_list")
    ? [{ outcome: "listed", result_payload: { items: [item], nextCursor: { createdAt: item.createdAt, id: LINK_ID } } }]
    : []);
  const issued = await repository(new FakePool(issuingClient)).list({
    tenantContext: tenantContext(), now: NOW, pageSize: 1, status: "active",
  });
  assert.equal(typeof issued.nextCursor, "string");

  const otherStore = "99999999-9999-4999-8999-999999999999";
  for (const input of [
    {
      tenantContext: tenantContext({
        store: { id: otherStore, slug: "other-store", status: "active" },
      }),
      now: NOW,
      pageSize: 1,
      status: "active" as const,
      cursor: issued.nextCursor,
    },
    {
      tenantContext: tenantContext(),
      now: NOW,
      pageSize: 1,
      status: "opened" as const,
      cursor: issued.nextCursor,
    },
  ]) {
    const pool = new FakePool();
    await assert.rejects(repository(pool).list(input), quickLinkError("invalid_input"));
    assert.equal(pool.connects, 0);
  }
});

test("list descriptor-copies only an exact ordinary dense array before parsing items", async (context) => {
  const cases: Array<readonly [string, unknown]> = [];

  const customMap = [listItem({ tokenDigest: TOKEN_DIGEST })];
  Object.defineProperty(customMap, "map", {
    configurable: true,
    enumerable: false,
    value: () => [listItem()],
  });
  cases.push(["custom map cannot hide a raw token field", customMap]);

  const sparse = new Array(1);
  cases.push(["sparse array", sparse]);

  const getterItems: unknown[] = [];
  Object.defineProperty(getterItems, "0", {
    configurable: true,
    enumerable: true,
    get: () => listItem(),
  });
  Object.defineProperty(getterItems, "length", { value: 1 });
  cases.push(["element getter", getterItems]);

  cases.push(["transparent proxy", new Proxy([listItem()], {})]);

  class ItemArray extends Array<unknown> {}
  cases.push(["array subclass", new ItemArray(listItem())]);

  const symbolItems = [listItem()];
  Object.defineProperty(symbolItems, Symbol("private"), { enumerable: false, value: TOKEN_DIGEST });
  cases.push(["symbol property", symbolItems]);

  for (const [name, items] of cases) {
    await context.test(name, async () => {
      const client = new FakeClient((text) => text.includes("saas.quick_links_list")
        ? [{ outcome: "listed", result_payload: { items } }]
        : []);
      await assert.rejects(repository(new FakePool(client)).list({
        tenantContext: tenantContext(), now: NOW, pageSize: 20,
      }), quickLinkError("unavailable"));
    });
  }
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

test("hosted create binds only payment method authority and explicitly rejects identity-bearing operation replay", async () => {
  const calls: unknown[][] = [];
  for (const input of [
    hostedCreateInput(),
    hostedCreateInput({
      buyerIdentity: {
        authority: "6b".repeat(32),
        sealedIdentity: { ...sealedToken("buyer-identity-key"), ciphertext: "Ag" },
      },
    }),
    hostedCreateInput({ items: [{ itemId: ITEM_ID, variantId: VARIANT_ID, quantity: 1, itemType: "VIRTUAL" }] }),
  ]) {
    const client = new FakeClient((text, values) => {
      if (text.includes("saas.quick_links_create_hosted")) {
        calls.push(values);
        return [{ outcome: "committed", result_payload: mutation() }];
      }
      return [];
    });
    await repository(new FakePool(client)).create(input);
  }
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.[11], PAYMENT_METHOD_ID);
  assert.equal(calls[0]?.[12], IDENTITY_AUTHORITY);
  assert.deepEqual(calls[0]?.[13], ["PHYSICAL"]);
  assert.equal(JSON.stringify(calls[0]).includes("74300864791"), false);
  assert.equal(JSON.stringify(calls[0]).includes("iyzico_iframe"), false);
  assert.notEqual(calls[0]?.at(-1), calls[1]?.at(-1));
  assert.notEqual(calls[0]?.at(-1), calls[2]?.at(-1));
});

test("hosted create emits the exact PostgreSQL 31-argument signature", async () => {
  const client = new FakeClient((text) => text.includes("saas.quick_links_create_hosted")
    ? [{ outcome: "committed", result_payload: mutation() }]
    : []);

  await repository(new FakePool(client)).create(hostedCreateInput());

  const call = functionCall(client, "quick_links_create_hosted");
  assert.equal(call.values.length, 31);
  assert.equal(call.text.replace(/\s+/g, ""), [
    "SELECToutcome,result_payloadFROMsaas.quick_links_create_hosted(",
    "$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,",
    "$8::uuid,$9::uuid[],$10::uuid[],$11::bigint[],$12::uuid,",
    "$13::text,$14::text[],$15::text,$16::jsonb,",
    "$17::text,$18::text,$19::text,$20::jsonb,$21::jsonb,$22::text,$23::text,",
    "$24::bigint,$25::bigint,$26::bigint,$27::text,$28::text,$29::jsonb,$30::uuid,$31::text",
    ")",
  ].join(""));
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

test("authority shape failures preserve their intended stable codes before checkout", async () => {
  const base = tenantContext() as unknown as Record<string, unknown>;
  const cases: Array<readonly [string, TenantContext, string]> = [
    ["missing principal", omit(base, "principal") as unknown as TenantContext, "unauthenticated"],
    ["inactive store", tenantContext({ store: { id: STORE_ID, slug: "atlas-store", status: "disabled" } }), "store_inactive"],
    ["inactive membership", tenantContext({ membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "disabled" } }), "membership_denied"],
    ["missing checkout feature", tenantContext({
      entitlements: { ...tenantContext().entitlements, features: ["orders"] },
    }), "feature_not_enabled"],
  ];
  for (const [, authority, code] of cases) {
    const pool = new FakePool();
    await assert.rejects(repository(pool).list({ tenantContext: authority, now: NOW, pageSize: 20 }), quickLinkError(code));
    assert.equal(pool.connects, 0);
  }
});

test("nested hostile authority records fail durably without invoking accessors or checkout", async () => {
  let getterCalls = 0;
  const accessorPrincipal = Object.defineProperty({
    issuer: "https://identity.example/oidc",
    subject: PRIVATE_SUBJECT,
  }, "id", {
    enumerable: true,
    get() { getterCalls += 1; throw new QuickOrderLinkRepositoryError("commit_unknown"); },
  });
  const symbolLimits = { products: 100, staff: 5, storageBytes: 1_024 } as Record<PropertyKey, unknown>;
  symbolLimits[Symbol("private")] = TOKEN_DIGEST;
  const accessorLimits = Object.defineProperty({ products: 100, staff: 5 }, "storageBytes", {
    enumerable: true,
    get() { getterCalls += 1; throw new QuickOrderLinkRepositoryError("commit_unknown"); },
  });
  const malformedTimestamp = { ...tenantContext().entitlements, validFrom: "2026-13-01T00:00:00.000Z" };
  const invalid: TenantContext[] = [
    tenantContext({ principal: Object.assign(Object.create({ inherited: true }), tenantContext().principal) }),
    tenantContext({ principal: accessorPrincipal }),
    Object.assign(tenantContext(), { [Symbol("private")]: TOKEN_DIGEST }),
    tenantContext({ entitlements: { ...tenantContext().entitlements, limits: symbolLimits } }),
    tenantContext({
      entitlements: {
        ...tenantContext().entitlements,
        limits: Object.assign(Object.create({ inherited: true }), tenantContext().entitlements.limits),
      },
    }),
    tenantContext({ entitlements: { ...tenantContext().entitlements, limits: accessorLimits } }),
    tenantContext({ entitlements: { ...tenantContext().entitlements, features: ["orders", "checkout", "orders"] } }),
    tenantContext({ entitlements: malformedTimestamp }),
    tenantContext({ resolvedHost: resolvedHost({ storeId: "99999999-9999-4999-8999-999999999999" }) }),
    tenantContext({ resolvedHost: Object.assign(Object.create({ inherited: true }), resolvedHost()) }),
  ];

  for (const authority of invalid) {
    const pool = new FakePool();
    await assert.rejects(repository(pool).list({ tenantContext: authority, now: NOW, pageSize: 20 }), quickLinkError("durable_authority_invalid"));
    assert.equal(pool.connects, 0);
  }
  assert.equal(getterCalls, 0);
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

test("public repository errors thrown by untrusted inputs, rows, drivers, or constructor traps are never trusted", async () => {
  const inputPool = new FakePool();
  await assert.rejects(repository(inputPool).create(new Proxy(createInput(), {
    ownKeys: () => { throw new QuickOrderLinkRepositoryError("commit_unknown"); },
  })), quickLinkError("invalid_input"));
  assert.equal(inputPool.connects, 0);

  const driver = new FakeClient((text) => {
    if (text.includes("saas.quick_links_get")) throw new QuickOrderLinkRepositoryError("commit_unknown");
    return [];
  });
  await assert.rejects(repository(new FakePool(driver)).get({
    tenantContext: tenantContext(), now: NOW, linkId: LINK_ID,
  }), quickLinkError("unavailable"));

  const hostileRow = new Proxy({ outcome: "found", result_payload: detail() }, {
    ownKeys: () => { throw new QuickOrderLinkRepositoryError("operation_mismatch"); },
  });
  const rowClient = new FakeClient((text) => text.includes("saas.quick_links_get")
    ? { rows: [hostileRow], rowCount: 1 }
    : []);
  await assert.rejects(repository(new FakePool(rowClient)).get({
    tenantContext: tenantContext(), now: NOW, linkId: LINK_ID,
  }), quickLinkError("unavailable"));

  assert.throws(() => new PostgresQuickOrderLinkRepository(new Proxy({} as never, {
    ownKeys: () => { throw new QuickOrderLinkRepositoryError("commit_unknown"); },
  })), quickLinkError("unavailable"));

  assert.throws(
    () => new QuickOrderLinkRepositoryError("private_invalid_code" as never),
    (error: unknown) => error instanceof TypeError && !String(error).includes("private_invalid_code"),
  );
});

test("escaped repository errors are fresh sealed public values and cannot transfer internal trust", async () => {
  async function capture(operation: () => Promise<unknown>): Promise<unknown> {
    let captured: unknown;
    try {
      await operation();
    } catch (error) {
      captured = error;
    }
    assert.notEqual(captured, undefined, "expected repository rejection");
    return captured;
  }

  function captureSync(operation: () => unknown): unknown {
    let captured: unknown;
    try {
      operation();
    } catch (error) {
      captured = error;
    }
    assert.notEqual(captured, undefined, "expected repository rejection");
    return captured;
  }

  function assertSealedPublicError(error: unknown, code: string): asserts error is QuickOrderLinkRepositoryError {
    assert.ok(error instanceof QuickOrderLinkRepositoryError);
    assert.equal(error.code, code);
    assert.equal(error.name, "QuickOrderLinkRepositoryError");
    assert.equal(error.message, code);
    assert.equal(error.constructor, QuickOrderLinkRepositoryError);
    assert.equal(Object.getPrototypeOf(error), QuickOrderLinkRepositoryError.prototype);
    assert.equal(Object.isFrozen(error), true);
    for (const [key, value] of [
      ["code", "commit_unknown"],
      ["name", PRIVATE_DRIVER],
      ["message", PRIVATE_DRIVER],
    ] as const) {
      assert.throws(() => { (error as unknown as Record<string, unknown>)[key] = value; }, TypeError);
      assert.equal(String(error).includes(PRIVATE_DRIVER), false);
    }
  }

  const constructorError = captureSync(() => new PostgresQuickOrderLinkRepository({
    pool: new FakePool(),
    role: "celebix_saas_owner",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
  } as never));
  assertSealedPublicError(constructorError, "unavailable");

  const invalidOperations = [
    () => repository(new FakePool()).list({ tenantContext: tenantContext(), now: NOW, pageSize: 0 }),
    () => repository(new FakePool()).get({ tenantContext: tenantContext(), now: NOW, linkId: "not-a-uuid" }),
    () => repository(new FakePool()).create(createInput({ operationId: "not-a-uuid" })),
    () => repository(new FakePool()).cancel({
      tenantContext: tenantContext(), now: NOW, linkId: LINK_ID, operationId: OPERATION_ID, expectedVersion: 0,
    }),
    () => repository(new FakePool()).cancel({
      tenantContext: tenantContext(), now: NOW, linkId: LINK_ID, operationId: OPERATION_ID,
      expectedVersion: Number.MAX_SAFE_INTEGER + 1,
    }),
    () => repository(new FakePool()).cancel({
      tenantContext: tenantContext(), now: NOW, linkId: LINK_ID, operationId: OPERATION_ID,
      expectedVersion: "9223372036854775807" as never,
    }),
    () => repository(new FakePool()).duplicate(duplicateInput({ newLinkId: LINK_ID })),
  ];
  const exposedInputErrors: QuickOrderLinkRepositoryError[] = [];
  for (const operation of invalidOperations) {
    const error = await capture(operation);
    assertSealedPublicError(error, "invalid_input");
    exposedInputErrors.push(error);
  }
  const invalidInput = exposedInputErrors[2]!;

  const EscapedConstructor = invalidInput.constructor as typeof QuickOrderLinkRepositoryError;
  const constructed = new EscapedConstructor("commit_unknown");
  assertSealedPublicError(constructed, "commit_unknown");

  const writer = new FakeClient((text) => {
    if (text.includes("saas.quick_links_create")) return [{ outcome: "committed", result_payload: mutation() }];
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const internalCommitUnknown = await capture(() => repository(new FakePool(writer, new Error(PRIVATE_DRIVER))).create(createInput()));
  assertSealedPublicError(internalCommitUnknown, "commit_unknown");

  for (const injected of [invalidInput, constructed, internalCommitUnknown]) {
    const inputPool = new FakePool();
    const inputResult = await capture(() => repository(inputPool).create(new Proxy(createInput(), {
      ownKeys: () => { throw injected; },
    })));
    assertSealedPublicError(inputResult, "invalid_input");
    assert.notEqual(inputResult, injected);
    assert.equal(inputPool.connects, 0);

    const queryClient = new FakeClient((text) => {
      if (text.includes("saas.quick_links_get")) throw injected;
      return [];
    });
    const queryResult = await capture(() => repository(new FakePool(queryClient)).get({
      tenantContext: tenantContext(), now: NOW, linkId: LINK_ID,
    }));
    assertSealedPublicError(queryResult, "unavailable");
    assert.notEqual(queryResult, injected);

    const hostileRow = new Proxy({ outcome: "found", result_payload: detail() }, {
      ownKeys: () => { throw injected; },
    });
    const rowClient = new FakeClient((text) => text.includes("saas.quick_links_get")
      ? { rows: [hostileRow], rowCount: 1 }
      : []);
    const rowResult = await capture(() => repository(new FakePool(rowClient)).get({
      tenantContext: tenantContext(), now: NOW, linkId: LINK_ID,
    }));
    assertSealedPublicError(rowResult, "unavailable");
    assert.notEqual(rowResult, injected);
  }
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
  for (const key of ["id", "status", "version", "expiresAt", "updatedAt"] as const) {
    assert.equal(result[key], mutation()[key]);
  }
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

test("unknown-COMMIT recovery must value-equal every safe field observed before COMMIT", async (context) => {
  const observed = mutation();
  const mismatches: Array<readonly [string, Record<string, unknown>]> = [
    ["id", { id: NEW_LINK_ID }],
    ["status", { status: "opened" }],
    ["version", { version: 2 }],
    ["expiresAt", { expiresAt: "2026-07-22T12:00:00.000000Z" }],
    ["updatedAt", { updatedAt: "2026-07-21T08:00:00.000001Z" }],
  ];

  for (const [field, changed] of mismatches) {
    await context.test(field, async () => {
      const writer = new FakeClient((text) => {
        if (text.includes("saas.quick_links_create")) return [{ outcome: "committed", result_payload: observed }];
        if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
        return [];
      });
      const recovery = new FakeClient((text) => text.includes("saas.quick_links_recover_operation")
        ? [{ outcome: "operation_replayed", result_payload: mutation(changed) }]
        : []);

      await assert.rejects(repository(new FakePool(writer, recovery)).create(createInput()), quickLinkError("commit_unknown"));
      assert.equal(writer.destroyed, true);
      assert.equal(recovery.destroyed, true);
      assert.equal(writer.calls.filter(({ text }) => text.includes("quick_links_create")).length, 1);
      assert.equal(recovery.calls.filter(({ text }) => text.includes("quick_links_recover_operation")).length, 1);
      assert.equal(recovery.calls.some(({ text }) => text === "COMMIT"), false);
    });
  }
});

test("duplicate recovery rejects a different regenerated link ID after unknown COMMIT", async () => {
  const originalDuplicateId = "12121212-1212-4212-8212-121212121212";
  const writer = new FakeClient((text) => {
    if (text.includes("saas.quick_links_duplicate")) {
      return [{ outcome: "committed", result_payload: mutation({ id: originalDuplicateId }) }];
    }
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("saas.quick_links_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: mutation({ id: NEW_LINK_ID }) }]
    : []);

  await assert.rejects(repository(new FakePool(writer, recovery)).duplicate(duplicateInput({
    newLinkId: originalDuplicateId,
  })), quickLinkError("commit_unknown"));
  assert.equal(recovery.destroyed, true);
  assert.equal(recovery.calls.some(({ text }) => text === "COMMIT"), false);
});

test("every failed unknown-COMMIT recovery preserves commit_unknown without rollback, reuse, or a second write", async () => {
  const scenarios: Array<"acquire" | "missing" | "multiple" | "malformed" | "sql_mismatch" | "query" | "commit"> = [
    "acquire", "missing", "multiple", "malformed", "sql_mismatch", "query", "commit",
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
        if (scenario === "sql_mismatch") return [{ outcome: "operation_mismatch", result_payload: null }];
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
