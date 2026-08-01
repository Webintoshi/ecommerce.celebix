import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  ORDER_ERROR_CODES,
  OrderRepositoryError,
  PostgresOrderRepository,
} from "./index.ts";

const STORE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_STORE_ID = "99999999-9999-4999-8999-999999999999";
const PRINCIPAL_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const DOMAIN_ID = "88888888-8888-4888-8888-888888888888";
const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NEXT_ORDER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const DRAFT_ID = "12121212-1212-4121-8121-121212121212";
const DRAFT_OPERATION_ID = "13131313-1313-4131-8131-131313131313";
const DRAFT_LINE_ID = "14141414-1414-4141-8141-141414141414";
const PRODUCT_ID = "15151515-1515-4151-8151-151515151515";
const VARIANT_ID = "16161616-1616-4161-8161-161616161616";
const NOW = new Date("2026-07-21T08:00:00.000Z");
const PRIVATE_REQUEST_ID = "private-order-request";
const PRIVATE_SUBJECT = "private-provider-subject";
const PRIVATE_PROXY_SECRET = "private-proxy-secret";

function tenantContext(overrides: Record<string, unknown> = {}): TenantContext {
  return {
    schemaVersion: 1,
    requestId: PRIVATE_REQUEST_ID,
    principal: { id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: PRIVATE_SUBJECT },
    store: { id: STORE_ID, slug: "atlas-store", status: "active" },
    membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "merchant_growth",
      version: 3,
      status: "active",
      features: ["catalog", "orders"],
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

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function listItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: "HMN-1001",
    source: "storefront",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY" as const,
    totalCents: 13_000,
    status: "confirmed",
    paymentStatus: "completed",
    itemCount: 1,
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:30:00.000Z",
    version: 4,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...listItem(),
    customerPhone: "+905551112233",
    subtotalCents: 12_500,
    shippingCents: 1_000,
    discountCents: 500,
    shippingAddress: {
      recipientName: "Ada Lovelace",
      line1: "1 Logic Street",
      city: "Istanbul",
      country: "TR",
    },
    tracking: {
      carrier: "Yurtici",
      trackingNumber: "TRACK-1001",
      shippedAt: "2026-07-20T10:20:00.000Z",
    },
    items: [{
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      position: 0,
      productName: "Atlas Mug",
      variantName: "Black",
      sku: "ATLAS-BLACK",
      unitPriceCents: 12_500,
      quantity: 1,
      discountCents: 0,
      lineTotalCents: 12_500,
    }],
    events: [{
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      type: "payment_changed",
      message: "Payment completed",
      createdAt: "2026-07-20T10:15:00.000Z",
    }],
    notes: [{
      id: NOTE_ID,
      body: "Gift wrap requested",
      createdAt: "2026-07-20T10:16:00.000Z",
      updatedAt: "2026-07-20T10:16:00.000Z",
    }],
    ...overrides,
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    totalOrders: 8,
    pendingOrders: 2,
    fulfilledOrders: 3,
    revenueCents: 42_000,
    currency: "TRY",
    asOf: NOW.toISOString(),
    ...overrides,
  };
}

function neighbors(overrides: Record<string, unknown> = {}) {
  return {
    previous: { id: NOTE_ID, orderNumber: "HMN-1002" },
    next: { id: NEXT_ORDER_ID, orderNumber: "HMN-1000" },
    ...overrides,
  };
}

function mutationProjection(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: "shipped",
    paymentStatus: "completed",
    version: 5,
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function draftIntent(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "+905551112233",
    currency: "TRY" as const,
    shippingCents: 500,
    discountCents: 100,
    shippingAddress: { recipientName: "Ada Lovelace", line1: "1 Logic Street", city: "Istanbul", country: "TR" },
    billingAddress: { recipientName: "Ada Lovelace", line1: "2 Billing Street", city: "Istanbul", country: "TR" },
    note: "Hediye paketi",
    adjustInventory: true,
    lines: [{ lineId: DRAFT_LINE_ID, productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2, discountCents: 100 }],
    ...overrides,
  };
}

function draftListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    draftNumber: "TSL-a1b2c3d4e5f6a7b8c9d0",
    status: "draft",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY",
    totalCents: 2_300,
    lineCount: 1,
    adjustInventory: true,
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:30:00.000Z",
    version: 1,
    ...overrides,
  };
}

function draftDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...draftListItem(),
    customerPhone: "+905551112233",
    subtotalCents: 1_900,
    shippingCents: 500,
    discountCents: 100,
    shippingAddress: draftIntent().shippingAddress,
    billingAddress: draftIntent().billingAddress,
    note: "Hediye paketi",
    lines: [{
      lineId: DRAFT_LINE_ID,
      position: 0,
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      productName: "Atlas Kolye",
      variantName: "Altın",
      sku: "ATL-KOL-ALT",
      unitPriceCents: 1_000,
      quantity: 2,
      discountCents: 100,
      lineTotalCents: 1_900,
    }],
    ...overrides,
  };
}

type Row = Record<string, unknown>;
type Response = Readonly<{ rows: Row[]; rowCount?: number | null }>;
type Responder = (text: string, values: unknown[]) => Row[] | Response | Promise<Row[] | Response>;

class FakeClient {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly responder: Responder;
  private readonly releaseFailure?: unknown;

  constructor(responder: Responder = () => [], releaseFailure?: unknown) {
    this.responder = responder;
    this.releaseFailure = releaseFailure;
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
    if (this.releaseFailure !== undefined) throw this.releaseFailure;
  }
}

class FakePool {
  readonly clients: FakeClient[];
  connects = 0;
  readonly connectionError?: unknown;

  constructor(...clients: FakeClient[]) {
    this.clients = clients;
  }

  async connect() {
    this.connects += 1;
    if (this.connectionError !== undefined) throw this.connectionError;
    const client = this.clients[this.connects - 1];
    if (!client) throw new Error("unexpected pool checkout");
    return client;
  }
}

function failingPool(error: unknown): FakePool {
  const pool = new FakePool();
  Object.defineProperty(pool, "connectionError", { value: error });
  return pool;
}

function repository(
  pool: FakePool,
  overrides: Partial<ConstructorParameters<typeof PostgresOrderRepository>[0]> = {},
) {
  return new PostgresOrderRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    generateId: (kind) => {
      assert.equal(kind, "note");
      return NOTE_ID;
    },
    audit: () => undefined,
    ...overrides,
  });
}

function functionCall(client: FakeClient, name: string) {
  const call = client.calls.find(({ text }) => text.includes(`saas.${name}`));
  assert.ok(call, `missing ${name} call`);
  return call;
}

function orderError(code: string) {
  return (error: unknown) => (
    error instanceof OrderRepositoryError &&
    error.code === code &&
    error.message === code &&
    !String(error).includes(PRIVATE_PROXY_SECRET)
  );
}

test("dashboard read uses the exact function signature, authority tuple, role, and transaction timeouts", async () => {
  const client = new FakeClient((text) => text.includes("saas.orders_get_dashboard_summary")
    ? [{ outcome: "summarized", result_payload: summary() }]
    : []);

  const result = await repository(new FakePool(client)).getDashboardSummary({ tenantContext: tenantContext(), now: NOW });

  assert.deepEqual(result, summary());
  assert.equal(Object.isFrozen(result), true);
  const call = functionCall(client, "orders_get_dashboard_summary");
  assert.match(call.text, /\$1::uuid,\$2::uuid,\$3::uuid,\$4::uuid,\$5::text,\$6::bigint,\$7::timestamptz/);
  assert.deepEqual(call.values, [STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW]);
  assert.notEqual(call.values[6], NOW);
  assert.equal(Object.isFrozen(call.values[6]), true);
  assert.equal(call.values.includes(PRIVATE_REQUEST_ID), false);
  assert.equal(call.values.includes(PRIVATE_SUBJECT), false);
  assert.deepEqual(client.calls.slice(0, 5).map(({ text }) => text), [
    "BEGIN READ ONLY",
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_app",
  ]);
  assert.deepEqual(client.calls.slice(1, 4).map(({ values }) => values), [["500ms"], ["300ms"], ["700ms"]]);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(client.releases, [undefined]);
});

test("TenantContext status, membership, entitlement, validity, and shape fail closed before pool use", async () => {
  const base = tenantContext() as unknown as Record<string, unknown>;
  const principal = base.principal as Record<string, unknown>;
  const store = base.store as Record<string, unknown>;
  const membership = base.membership as Record<string, unknown>;
  const entitlements = base.entitlements as Record<string, unknown>;
  const limits = entitlements.limits as Record<string, unknown>;
  const cases = [
    [tenantContext({ principal: null }), "unauthenticated"],
    [tenantContext({ store: { id: STORE_ID, slug: "atlas-store", status: "suspended" } }), "store_inactive"],
    [tenantContext({ membership: { id: MEMBERSHIP_ID, role: "analyst", status: "revoked" } }), "membership_denied"],
    [tenantContext({ entitlements: { ...tenantContext().entitlements, features: ["catalog"] } }), "feature_not_enabled"],
    [tenantContext({ entitlements: { ...tenantContext().entitlements, validUntil: NOW.toISOString() } }), "durable_authority_invalid"],
    [tenantContext({ membership: { id: "not-a-uuid", role: "store_owner", status: "active" } }), "durable_authority_invalid"],
    [omit(base, "principal"), "unauthenticated"],
    [omit(base, "store"), "store_inactive"],
    [omit(base, "membership"), "membership_denied"],
    [omit(base, "requestId"), "durable_authority_invalid"],
    [{ ...base, principal: omit(principal, "issuer") }, "durable_authority_invalid"],
    [{ ...base, principal: omit(principal, "subject") }, "durable_authority_invalid"],
    [{ ...base, store: omit(store, "slug") }, "durable_authority_invalid"],
    [omit(base, "locale"), "durable_authority_invalid"],
    [{ ...base, privateToken: PRIVATE_PROXY_SECRET }, "durable_authority_invalid"],
    [{ ...base, principal: { ...principal, privateToken: PRIVATE_PROXY_SECRET } }, "durable_authority_invalid"],
    [{ ...base, store: { ...store, privateToken: PRIVATE_PROXY_SECRET } }, "durable_authority_invalid"],
    [{ ...base, membership: { ...membership, privateToken: PRIVATE_PROXY_SECRET } }, "durable_authority_invalid"],
    [{ ...base, entitlements: { ...entitlements, privateToken: PRIVATE_PROXY_SECRET } }, "durable_authority_invalid"],
    [{ ...base, entitlements: { ...entitlements, limits: { ...limits, privateToken: 1 } } }, "durable_authority_invalid"],
    [{ ...base, requestId: "" }, "durable_authority_invalid"],
    [{ ...base, locale: "tr_tr" }, "durable_authority_invalid"],
    [{ ...base, entitlements: { ...entitlements, features: ["catalog", "orders", "orders"] } }, "durable_authority_invalid"],
    [{ ...base, entitlements: { ...entitlements, features: ["catalog", "orders", "private"] } }, "durable_authority_invalid"],
  ] as const;

  for (const [context, code] of cases) {
    const pool = new FakePool();
    await assert.rejects(repository(pool).getDashboardSummary({ tenantContext: context as TenantContext, now: NOW }), orderError(code));
    assert.equal(pool.connects, 0);
  }

  const resolvedContext = deepFreeze(tenantContext({
    resolvedHost: {
      schemaVersion: 1,
      hostname: "shop.example.test",
      domainId: DOMAIN_ID,
      domainType: "custom",
      storeId: STORE_ID,
      storeSlug: "atlas-store",
      canonicalHostname: "shop.example.test",
      status: "active",
      cacheVersion: 2,
    },
  }));
  const resolvedClient = new FakeClient((text) => text.includes("saas.orders_get_dashboard_summary")
    ? [{ outcome: "summarized", result_payload: summary() }]
    : []);
  assert.deepEqual(
    await repository(new FakePool(resolvedClient)).getDashboardSummary({ tenantContext: resolvedContext, now: NOW }),
    summary(),
  );
});

test("list binds global sort arguments and emits a store-filter-sort-and-position-bound opaque cursor", async () => {
  const cursorTimestamp = "2026-07-20T10:00:00.000000Z";
  const firstClient = new FakeClient((text) => text.includes("saas.orders_list")
    ? [{ outcome: "listed", result_payload: { items: [listItem()], nextCursor: { totalCents: 13_000, createdAt: cursorTimestamp, id: ORDER_ID } } }]
    : []);
  const first = await repository(new FakePool(firstClient)).listOrders({
    tenantContext: tenantContext(), now: NOW, pageSize: 1, status: "confirmed", search: "Ada", sort: "highest",
  });

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items), true);
  assert.equal(Object.isFrozen(first.items[0]), true);
  assert.equal(typeof first.nextCursor, "string");
  assert.equal(first.nextCursor?.includes(STORE_ID), false);
  const firstCall = functionCall(firstClient, "orders_list");
  assert.deepEqual(firstCall.values, [
    STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW,
    "confirmed", "Ada", "highest", 1, null, null, null,
  ]);

  const secondClient = new FakeClient((text) => text.includes("saas.orders_list")
    ? [{ outcome: "listed", result_payload: { items: [] } }]
    : []);
  await repository(new FakePool(secondClient)).listOrders({
    tenantContext: tenantContext(), now: NOW, pageSize: 1, status: "confirmed", search: "Ada", sort: "highest", cursor: first.nextCursor,
  });
  assert.deepEqual(functionCall(secondClient, "orders_list").values.slice(11), [13_000, cursorTimestamp, ORDER_ID]);

  const otherStore = tenantContext({ store: { id: OTHER_STORE_ID, slug: "other", status: "active" } });
  const unused = new FakePool();
  await assert.rejects(repository(unused).listOrders({
    tenantContext: otherStore, now: NOW, pageSize: 1, status: "confirmed", search: "Ada", sort: "highest", cursor: first.nextCursor,
  }), orderError("invalid_input"));
  assert.equal(unused.connects, 0);

  const sortMismatch = new FakePool();
  await assert.rejects(repository(sortMismatch).listOrders({
    tenantContext: tenantContext(), now: NOW, pageSize: 1, status: "confirmed", search: "Ada", sort: "lowest", cursor: first.nextCursor,
  }), orderError("invalid_input"));
  assert.equal(sortMismatch.connects, 0);

  const decoded = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"));
  const tampered = Buffer.from(JSON.stringify({ ...decoded, totalCents: 12_999 }), "utf8").toString("base64url");
  const tamperedPool = new FakePool();
  await assert.rejects(repository(tamperedPool).listOrders({
    tenantContext: tenantContext(), now: NOW, pageSize: 1, status: "confirmed", search: "Ada", sort: "highest", cursor: tampered,
  }), orderError("invalid_input"));
  assert.equal(tamperedPool.connects, 0);
});

test("list rejects unordered, oversized, private, or inconsistent cursor projections", async () => {
  const malformed = [
    { items: [listItem({ createdAt: "2026-07-19T10:00:00.000Z" }), listItem({ id: NOTE_ID })] },
    { items: [listItem()], nextCursor: { totalCents: 13_000, createdAt: "2026-07-20T10:00:00.000000Z", id: NOTE_ID } },
    {
      items: [listItem({ createdAt: "2026-07-20T10:00:00.000800Z" })],
      nextCursor: { totalCents: 13_000, createdAt: "2026-07-20T10:00:00.000700Z", id: ORDER_ID },
    },
    { items: [], nextCursor: { totalCents: 13_000, createdAt: "2026-07-20T10:00:00.000000Z", id: ORDER_ID } },
    { items: [listItem()], storeId: STORE_ID },
    { items: [listItem(), listItem({ id: NOTE_ID })] },
  ];
  for (const resultPayload of malformed) {
    const client = new FakeClient((text) => text.includes("saas.orders_list")
      ? [{ outcome: "listed", result_payload: resultPayload }]
      : []);
    await assert.rejects(repository(new FakePool(client)).listOrders({
      tenantContext: tenantContext(), now: NOW, pageSize: 1,
    }), orderError("unavailable"));
  }
  const orderingCases = [
    { sort: "newest", items: [listItem({ id: NOTE_ID, createdAt: "2026-07-19T10:00:00.000Z" }), listItem()] },
    { sort: "oldest", items: [listItem(), listItem({ id: NOTE_ID, createdAt: "2026-07-19T10:00:00.000Z" })] },
    { sort: "highest", items: [listItem({ id: NOTE_ID, totalCents: 12_000 }), listItem()] },
    { sort: "lowest", items: [listItem(), listItem({ id: NOTE_ID, totalCents: 12_000 })] },
  ] as const;
  for (const { sort, items } of orderingCases) {
    const client = new FakeClient((text) => text.includes("saas.orders_list")
      ? [{ outcome: "listed", result_payload: { items } }]
      : []);
    await assert.rejects(repository(new FakePool(client)).listOrders({
      tenantContext: tenantContext(), now: NOW, pageSize: 2, sort,
    }), orderError("unavailable"));
  }
  const lateLowId = listItem({
    id: ORDER_ID,
    createdAt: "2026-07-20T10:00:00.000900Z",
    updatedAt: "2026-07-20T10:30:00.000900Z",
  });
  const earlyHighId = listItem({
    id: NOTE_ID,
    createdAt: "2026-07-20T10:00:00.000700Z",
    updatedAt: "2026-07-20T10:30:00.000700Z",
  });
  for (const [sort, items] of [
    ["newest", [lateLowId, earlyHighId]],
    ["oldest", [earlyHighId, lateLowId]],
    ["highest", [lateLowId, earlyHighId]],
    ["lowest", [earlyHighId, lateLowId]],
  ] as const) {
    const client = new FakeClient((text) => text.includes("saas.orders_list")
      ? [{ outcome: "listed", result_payload: { items } }]
      : []);
    const result = await repository(new FakePool(client)).listOrders({
      tenantContext: tenantContext(), now: NOW, pageSize: 2, sort,
    });
    assert.deepEqual(result.items.map(({ id }) => id), items.map(({ id }) => id));
  }
});

test("detail read strictly parses and deeply freezes the safe order contract", async () => {
  const client = new FakeClient((text) => text.includes("saas.orders_get(")
    ? [{ outcome: "found", result_payload: detail() }]
    : []);
  const result = await repository(new FakePool(client)).getOrder({ tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID });

  assert.deepEqual(result, detail());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.shippingAddress), true);
  assert.equal(Object.isFrozen(result.tracking), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.events[0]), true);
  assert.equal(Object.isFrozen(result.notes[0]), true);
  assert.deepEqual(functionCall(client, "orders_get").values, [
    STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW, ORDER_ID,
  ]);
});

test("draft list and detail use exact tenant authority, strict parsing, and a store-bound cursor", async () => {
  const cursorTimestamp = "2026-07-20T10:30:00.000000Z";
  const firstClient = new FakeClient((text) => {
    if (text.includes("saas.order_drafts_list")) {
      return [{ outcome: "listed", result_payload: { items: [draftListItem()], nextCursor: { updatedAt: cursorTimestamp, id: DRAFT_ID } } }];
    }
    return [];
  });
  const first = await repository(new FakePool(firstClient)).listDrafts({
    tenantContext: tenantContext(), now: NOW, pageSize: 1,
  });
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items), true);
  assert.equal(Object.isFrozen(first.items[0]), true);
  assert.equal(typeof first.nextCursor, "string");
  assert.equal(first.nextCursor?.includes(STORE_ID), false);
  const listCall = functionCall(firstClient, "order_drafts_list");
  assert.deepEqual(listCall.values, [
    STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW, 1, null, null,
  ]);

  const secondClient = new FakeClient((text) => text.includes("saas.order_drafts_list")
    ? [{ outcome: "listed", result_payload: { items: [] } }]
    : []);
  await repository(new FakePool(secondClient)).listDrafts({
    tenantContext: tenantContext(), now: NOW, pageSize: 1, cursor: first.nextCursor,
  });
  assert.deepEqual(functionCall(secondClient, "order_drafts_list").values.slice(8), [cursorTimestamp, DRAFT_ID]);

  const otherStore = tenantContext({ store: { id: OTHER_STORE_ID, slug: "other", status: "active" } });
  const unused = new FakePool();
  await assert.rejects(repository(unused).listDrafts({
    tenantContext: otherStore, now: NOW, pageSize: 1, cursor: first.nextCursor,
  }), orderError("invalid_input"));
  assert.equal(unused.connects, 0);

  const detailClient = new FakeClient((text) => text.includes("saas.order_drafts_get")
    ? [{ outcome: "found", result_payload: draftDetail() }]
    : []);
  const selected = await repository(new FakePool(detailClient)).getDraft({
    tenantContext: tenantContext(), now: NOW, draftId: DRAFT_ID,
  });
  assert.deepEqual(selected, draftDetail());
  assert.equal(Object.isFrozen(selected.lines), true);
  assert.deepEqual(functionCall(detailClient, "order_drafts_get").values, [
    STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW, DRAFT_ID,
  ]);
});

test("draft create update archive and convert bind exact SQL, canonical fingerprints, and strict results", async () => {
  const createClient = new FakeClient((text) => text.includes("saas.order_drafts_create")
    ? [{ outcome: "created", result_payload: draftDetail() }]
    : []);
  const created = await repository(new FakePool(createClient), {
    generateId: (kind) => kind === "draft" ? DRAFT_ID : NOTE_ID,
  }).createDraft({
    tenantContext: tenantContext(), now: NOW, operationId: DRAFT_OPERATION_ID, intent: draftIntent(),
  });
  assert.deepEqual(created, draftDetail());
  const create = functionCall(createClient, "order_drafts_create");
  assert.match(create.text, /\$8::uuid,\$9::text,\$10::uuid,\$11::jsonb/);
  assert.deepEqual(create.values.slice(9, 10), [DRAFT_ID]);
  assert.deepEqual(JSON.parse(String(create.values[10])), draftIntent());

  const updateClient = new FakeClient((text) => text.includes("saas.order_drafts_update")
    ? [{ outcome: "updated", result_payload: draftDetail({ version: 2 }) }]
    : []);
  await repository(new FakePool(updateClient)).updateDraft({
    tenantContext: tenantContext(), now: NOW, operationId: DRAFT_OPERATION_ID, draftId: DRAFT_ID,
    expectedVersion: 1, intent: draftIntent(),
  });
  const update = functionCall(updateClient, "order_drafts_update");
  assert.match(update.text, /\$8::uuid,\$9::text,\$10::uuid,\$11::bigint,\$12::jsonb/);
  assert.deepEqual(update.values.slice(9, 11), [DRAFT_ID, 1]);
  assert.deepEqual(JSON.parse(String(update.values[11])), { ...draftIntent(), expectedVersion: 1 });
  assert.match(String(create.values[8]), /^[a-f0-9]{64}$/);
  assert.match(String(update.values[8]), /^[a-f0-9]{64}$/);
  assert.notEqual(create.values[8], update.values[8]);

  const archiveClient = new FakeClient((text) => text.includes("saas.order_drafts_archive")
    ? [{ outcome: "archived", result_payload: draftDetail({ status: "archived", version: 2 }) }]
    : []);
  const archived = await repository(new FakePool(archiveClient)).archiveDraft({
    tenantContext: tenantContext(), now: NOW, operationId: DRAFT_OPERATION_ID, draftId: DRAFT_ID, expectedVersion: 1,
  });
  assert.equal(archived.status, "archived");
  assert.deepEqual(functionCall(archiveClient, "order_drafts_archive").values.slice(9), [DRAFT_ID, 1]);

  const conversionPayload = {
    draftId: DRAFT_ID,
    orderId: ORDER_ID,
    orderNumber: "MAN-aaaaaaaaaaaa4aaa8aaa",
    draftVersion: 2,
    adjustedInventory: true,
    replayed: false,
  };
  const convertClient = new FakeClient((text) => text.includes("saas.order_drafts_convert")
    ? [{ outcome: "operation_replayed", result_payload: conversionPayload }]
    : []);
  const converted = await repository(new FakePool(convertClient)).convertDraft({
    tenantContext: tenantContext(), now: NOW, operationId: DRAFT_OPERATION_ID, draftId: DRAFT_ID, expectedVersion: 1,
  });
  assert.deepEqual(converted, { ...conversionPayload, replayed: true });
  assert.deepEqual(functionCall(convertClient, "order_drafts_convert").values.slice(9), [DRAFT_ID, 1]);
});

test("unknown draft commit destroys the writer and recovers only through draft operation authority", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.order_drafts_create")) return [{ outcome: "created", result_payload: draftDetail() }];
    if (text === "COMMIT") throw new Error(PRIVATE_PROXY_SECRET);
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("saas.order_drafts_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: draftDetail() }]
    : []);
  const result = await repository(new FakePool(writer, recovery), {
    generateId: (kind) => kind === "draft" ? DRAFT_ID : NOTE_ID,
  }).createDraft({
    tenantContext: tenantContext(), now: NOW, operationId: DRAFT_OPERATION_ID, intent: draftIntent(),
  });
  assert.deepEqual(result, draftDetail());
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter(({ text }) => text.includes("order_drafts_recover_operation")).length, 1);
  assert.equal(recovery.calls.some(({ text }) => text.includes("order_drafts_create")), false);
});

test("draft errors and malformed private inputs fail closed", async () => {
  for (const outcome of ["draft_not_found", "draft_not_editable", "inventory_conflict", "catalog_conflict", "customer_conflict"] as const) {
    const client = new FakeClient((text) => text.includes("saas.order_drafts_archive")
      ? [{ outcome, result_payload: null }]
      : []);
    await assert.rejects(repository(new FakePool(client)).archiveDraft({
      tenantContext: tenantContext(), now: NOW, operationId: DRAFT_OPERATION_ID, draftId: DRAFT_ID, expectedVersion: 1,
    }), orderError(outcome));
  }
  for (const invoke of [
    () => repository(new FakePool()).listDrafts({ tenantContext: tenantContext(), now: NOW, pageSize: 101 }),
    () => repository(new FakePool()).getDraft({ tenantContext: tenantContext(), now: NOW, draftId: "bad" }),
    () => repository(new FakePool()).createDraft({ tenantContext: tenantContext(), now: NOW, operationId: DRAFT_OPERATION_ID, intent: { ...draftIntent(), storeId: STORE_ID } as never }),
    () => repository(new FakePool()).updateDraft({ tenantContext: tenantContext(), now: NOW, operationId: DRAFT_OPERATION_ID, draftId: DRAFT_ID, expectedVersion: 2, intent: { ...draftIntent(), expectedVersion: 1 } }),
  ]) {
    await assert.rejects(invoke(), orderError("invalid_input"));
  }
});

test("neighbor read uses the exact authority signature and returns only frozen safe identities", async () => {
  const client = new FakeClient((text) => text.includes("saas.orders_get_neighbors")
    ? [{ outcome: "found", result_payload: neighbors() }]
    : []);

  const result = await repository(new FakePool(client)).getOrderNeighbors({
    tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID,
  });

  assert.deepEqual(result, neighbors());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.previous), true);
  assert.equal(Object.isFrozen(result.next), true);
  const call = functionCall(client, "orders_get_neighbors");
  assert.match(call.text, /\$1::uuid,\$2::uuid,\$3::uuid,\$4::uuid,\$5::text,\$6::bigint,\$7::timestamptz,\$8::uuid/);
  assert.deepEqual(call.values, [
    STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW, ORDER_ID,
  ]);
  assert.equal(call.values.includes(PRIVATE_REQUEST_ID), false);
  assert.equal(call.values.includes(PRIVATE_SUBJECT), false);
});

test("neighbor read fails closed on missing corrupt cross-order and unavailable outcomes", async () => {
  const corrupt = [
    neighbors({ storeId: STORE_ID }),
    neighbors({ previous: { id: ORDER_ID, orderNumber: "HMN-1001" } }),
    neighbors({ next: { id: NOTE_ID, orderNumber: "HMN-1002" } }),
    neighbors({ previous: { id: "bad", orderNumber: "HMN-1002" } }),
  ];
  for (const resultPayload of corrupt) {
    const client = new FakeClient((text) => text.includes("saas.orders_get_neighbors")
      ? [{ outcome: "found", result_payload: resultPayload }]
      : []);
    await assert.rejects(repository(new FakePool(client)).getOrderNeighbors({
      tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID,
    }), orderError("unavailable"));
  }

  const missing = new FakeClient((text) => text.includes("saas.orders_get_neighbors")
    ? [{ outcome: "order_not_found", result_payload: null }]
    : []);
  await assert.rejects(repository(new FakePool(missing)).getOrderNeighbors({
    tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID,
  }), orderError("order_not_found"));

  await assert.rejects(repository(failingPool(new Error(PRIVATE_PROXY_SECRET))).getOrderNeighbors({
    tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID,
  }), orderError("unavailable"));
});

test("status transition uses the exact parameterized signature and a stable authority-free fingerprint", async () => {
  const clients = [0, 1, 2].map((index) => new FakeClient((text) => text.includes("saas.orders_transition_status")
    ? [{ outcome: "committed", result_payload: mutationProjection({ version: index === 2 ? 6 : 5 }) }]
    : []));
  const inputs = [
    { expectedVersion: 4, nextStatus: "shipped" as const },
    { expectedVersion: 4, nextStatus: "shipped" as const },
    { expectedVersion: 5, nextStatus: "shipped" as const },
  ];
  for (let index = 0; index < clients.length; index += 1) {
    await repository(new FakePool(clients[index]!)).transitionStatus({
      tenantContext: tenantContext({ requestId: `private-${index}` }), now: NOW, operationId: OPERATION_ID,
      orderId: ORDER_ID, ...inputs[index]!,
    });
  }
  const calls = clients.map((client) => functionCall(client, "orders_transition_status"));
  assert.match(calls[0]!.text, /\$8::uuid,\$9::text,\$10::uuid,\$11::bigint,\$12::text/);
  assert.deepEqual(calls[0]!.values.slice(0, 9), [STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW, OPERATION_ID, calls[0]!.values[8]]);
  assert.match(String(calls[0]!.values[8]), /^[a-f0-9]{64}$/);
  assert.equal(calls[0]!.values[8], calls[1]!.values[8]);
  assert.notEqual(calls[0]!.values[8], calls[2]!.values[8]);
  assert.deepEqual(calls[0]!.values.slice(9), [ORDER_ID, 4, "shipped"]);
  assert.equal(JSON.stringify(calls[0]!.values).includes("private-0"), false);
  assert.equal(calls[0]!.text.includes("shipped"), false);
});

test("payment and shipping mutations use their exact signatures and canonicalize object key order", async () => {
  const payment = new FakeClient((text) => text.includes("saas.orders_transition_payment")
    ? [{ outcome: "committed", result_payload: mutationProjection({ paymentStatus: "refunded" }) }]
    : []);
  await repository(new FakePool(payment)).transitionPayment({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
    expectedVersion: 4, nextPaymentStatus: "refunded",
  });
  const paymentCall = functionCall(payment, "orders_transition_payment");
  assert.match(paymentCall.text, /\$8::uuid,\$9::text,\$10::uuid,\$11::bigint,\$12::text/);
  assert.deepEqual(paymentCall.values.slice(9), [ORDER_ID, 4, "refunded"]);

  const addressA = { recipientName: "Ada Lovelace", line1: "1 Logic Street", city: "Istanbul", country: "TR" };
  const addressB = { country: "TR", city: "Istanbul", line1: "1 Logic Street", recipientName: "Ada Lovelace" };
  const trackingA = { carrier: "Yurtici", trackingNumber: "TRACK-1001" };
  const trackingB = { trackingNumber: "TRACK-1001", carrier: "Yurtici" };
  const shippingClients = [addressA, addressB].map(() => new FakeClient((text) => text.includes("saas.orders_update_shipping")
    ? [{ outcome: "committed", result_payload: mutationProjection() }]
    : []));
  await repository(new FakePool(shippingClients[0]!)).updateShipping({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
    expectedVersion: 4, shippingAddress: addressA, tracking: trackingA,
  });
  await repository(new FakePool(shippingClients[1]!)).updateShipping({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
    expectedVersion: 4, shippingAddress: addressB, tracking: trackingB,
  });
  const shippingCalls = shippingClients.map((client) => functionCall(client, "orders_update_shipping"));
  assert.equal(shippingCalls[0]!.values[8], shippingCalls[1]!.values[8]);
  assert.deepEqual(shippingCalls[0]!.values.slice(9, 11), [ORDER_ID, 4]);
  assert.deepEqual(JSON.parse(String(shippingCalls[0]!.values[11])), addressA);
  assert.deepEqual(JSON.parse(String(shippingCalls[0]!.values[12])), trackingA);
});

test("note mutations generate only note IDs and bind exact add/archive signatures", async () => {
  const addClient = new FakeClient((text) => text.includes("saas.orders_add_note")
    ? [{ outcome: "committed", result_payload: mutationProjection() }]
    : []);
  await repository(new FakePool(addClient)).addNote({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, body: "Gift wrap requested",
  });
  const add = functionCall(addClient, "orders_add_note");
  assert.match(add.text, /\$8::uuid,\$9::text,\$10::uuid,\$11::uuid,\$12::text/);
  assert.deepEqual(add.values.slice(9), [NOTE_ID, ORDER_ID, "Gift wrap requested"]);

  const archiveClient = new FakeClient((text) => text.includes("saas.orders_archive_note")
    ? [{ outcome: "committed", result_payload: mutationProjection() }]
    : []);
  await repository(new FakePool(archiveClient)).archiveNote({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, noteId: NOTE_ID,
  });
  const archive = functionCall(archiveClient, "orders_archive_note");
  assert.match(archive.text, /\$8::uuid,\$9::text,\$10::uuid,\$11::uuid/);
  assert.deepEqual(archive.values.slice(9), [ORDER_ID, NOTE_ID]);
});

test("operation replay returns the frozen prior mutation projection with replayed true", async () => {
  const client = new FakeClient((text) => text.includes("saas.orders_transition_status")
    ? [{ outcome: "operation_replayed", result_payload: mutationProjection() }]
    : []);
  const result = await repository(new FakePool(client)).transitionStatus({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
    expectedVersion: 4, nextStatus: "shipped",
  });
  assert.deepEqual(result, { ...mutationProjection(), replayed: true });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(client.calls.filter(({ text }) => text.includes("orders_transition_status")).length, 1);
});

test("finite mismatch, missing entity, conflict, transition, and role denials map to stable order errors", async () => {
  const outcomes = [
    "operation_mismatch", "order_not_found", "note_not_found", "version_conflict", "invalid_transition", "membership_denied",
  ] as const;
  for (const outcome of outcomes) {
    const client = new FakeClient((text) => text.includes("saas.orders_archive_note")
      ? [{ outcome, result_payload: null }]
      : []);
    await assert.rejects(repository(new FakePool(client)).archiveNote({
      tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, noteId: NOTE_ID,
    }), orderError(outcome));
  }
});

test("unknown keys, malformed IDs, versions, filters, notes, addresses, and tracking fail before checkout", async () => {
  const cases = [
    () => repository(new FakePool()).getOrder({ tenantContext: tenantContext(), now: NOW, orderId: "bad" }),
    () => repository(new FakePool()).getOrderNeighbors({ tenantContext: tenantContext(), now: NOW, orderId: "bad" }),
    () => repository(new FakePool()).listOrders({ tenantContext: tenantContext(), now: NOW, pageSize: 101 }),
    () => repository(new FakePool()).listOrders({ tenantContext: tenantContext(), now: NOW, pageSize: 10, search: " padded " }),
    () => repository(new FakePool()).transitionStatus({ tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, expectedVersion: 0, nextStatus: "shipped" }),
    () => repository(new FakePool()).addNote({ tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, body: "bad\nbody" }),
    () => repository(new FakePool()).updateShipping({ tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, expectedVersion: 4, shippingAddress: { recipientName: "Ada", line1: "1 Road", city: "Istanbul", country: "tur" } }),
    () => repository(new FakePool()).updateShipping({ tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, expectedVersion: 4, shippingAddress: { recipientName: "Ada", line1: "1 Road", city: "Istanbul", country: "TR" }, tracking: { carrier: "Yurtici", trackingNumber: "T1", secret: "x" } as never }),
    () => repository(new FakePool()).getDashboardSummary({ tenantContext: tenantContext(), now: NOW, storeId: STORE_ID } as never),
  ];
  for (const invoke of cases) {
    const promise = invoke();
    await assert.rejects(promise, orderError("invalid_input"));
  }


  const publicInputs = [
    { input: { tenantContext: tenantContext(), now: NOW }, call: (value: never, repo: PostgresOrderRepository) => repo.getDashboardSummary(value) },
    { input: { tenantContext: tenantContext(), now: NOW, pageSize: 10 }, call: (value: never, repo: PostgresOrderRepository) => repo.listOrders(value) },
    { input: { tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID }, call: (value: never, repo: PostgresOrderRepository) => repo.getOrder(value) },
    { input: { tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID }, call: (value: never, repo: PostgresOrderRepository) => repo.getOrderNeighbors(value) },
    { input: { tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, expectedVersion: 4, nextStatus: "shipped" }, call: (value: never, repo: PostgresOrderRepository) => repo.transitionStatus(value) },
    { input: { tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, expectedVersion: 4, nextPaymentStatus: "refunded" }, call: (value: never, repo: PostgresOrderRepository) => repo.transitionPayment(value) },
    { input: { tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, expectedVersion: 4, shippingAddress: { recipientName: "Ada", line1: "1 Road", city: "Istanbul", country: "TR" } }, call: (value: never, repo: PostgresOrderRepository) => repo.updateShipping(value) },
    { input: { tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, body: "Gift wrap requested" }, call: (value: never, repo: PostgresOrderRepository) => repo.addNote(value) },
    { input: { tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID, noteId: NOTE_ID }, call: (value: never, repo: PostgresOrderRepository) => repo.archiveNote(value) },
  ];
  for (const { input, call } of publicInputs) {
    for (const hostile of [
      new Proxy(input, { ownKeys: () => { throw new Error(PRIVATE_PROXY_SECRET); } }),
      new Proxy(input, { get: (target, key, receiver) => {
        if (key === "now") throw new Error(PRIVATE_PROXY_SECRET);
        return Reflect.get(target, key, receiver);
      } }),
    ]) {
      const pool = new FakePool();
      await assert.rejects(call(hostile as never, repository(pool)), orderError("invalid_input"));
      assert.equal(pool.connects, 0);
    }
  }

  const hostileContext = new Proxy(tenantContext(), {
    get: () => { throw new Error(PRIVATE_PROXY_SECRET); },
  });
  const nestedPool = new FakePool();
  await assert.rejects(repository(nestedPool).getDashboardSummary({
    tenantContext: hostileContext, now: NOW,
  }), orderError("durable_authority_invalid"));
  assert.equal(nestedPool.connects, 0);
});

test("pool checkout failures are classified without retaining driver detail", async () => {
  const pool = failingPool(Object.assign(new Error("postgres://user:secret@private/order"), { code: "ECONNREFUSED" }));
  await assert.rejects(repository(pool).getDashboardSummary({ tenantContext: tenantContext(), now: NOW }), (error: unknown) => {
    assert.equal(error instanceof OrderRepositoryError, true);
    assert.equal((error as OrderRepositoryError).code, "unavailable");
    assert.equal(String(error).includes("secret"), false);
    return true;
  });
  assert.equal(pool.connects, 1);

  const lateClient = new FakeClient();
  let slowConnects = 0;
  const slowPool = {
    connect: () => {
      slowConnects += 1;
      return new Promise<FakeClient>((resolve) => setTimeout(() => resolve(lateClient), 20));
    },
  };
  await assert.rejects(repository(new FakePool(), {
    pool: slowPool,
    timeouts: { poolCheckoutMs: 5, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  }).getDashboardSummary({ tenantContext: tenantContext(), now: NOW }), orderError("unavailable"));
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(slowConnects, 1);
  assert.deepEqual(lateClient.calls, []);
  assert.deepEqual(lateClient.releases, [true]);
});

test("BEGIN, timeout setup, role, function, read COMMIT, and rollback failures classify and release safely", async () => {
  const stages = [
    { stage: "BEGIN READ ONLY", releases: [true], rollbacks: 0 },
    { stage: "SELECT pg_catalog.set_config('statement_timeout', $1, true)", releases: [undefined], rollbacks: 1 },
    { stage: "SELECT pg_catalog.set_config('lock_timeout', $1, true)", releases: [undefined], rollbacks: 1 },
    { stage: "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", releases: [undefined], rollbacks: 1 },
    { stage: "SET LOCAL ROLE celebix_saas_app", releases: [undefined], rollbacks: 1 },
    { stage: "FUNCTION_57014", releases: [undefined], rollbacks: 1 },
    { stage: "FUNCTION_55P03", releases: [undefined], rollbacks: 1 },
    { stage: "COMMIT", releases: [true], rollbacks: 0 },
  ] as const;
  for (const { stage, releases, rollbacks } of stages) {
    const client = new FakeClient((text) => {
      if (text === stage || (stage.startsWith("FUNCTION_") && text.includes("saas.orders_get("))) {
        const code = stage.startsWith("FUNCTION_") ? stage.slice("FUNCTION_".length) : undefined;
        throw Object.assign(new Error(`${PRIVATE_PROXY_SECRET}:${stage}`), { code });
      }
      if (text.includes("saas.orders_get(")) return [{ outcome: "found", result_payload: detail() }];
      return [];
    });
    await assert.rejects(repository(new FakePool(client)).getOrder({
      tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID,
    }), orderError("unavailable"));
    assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, rollbacks);
    assert.deepEqual(client.releases, releases);
  }

  const rollbackFailure = new FakeClient((text) => {
    if (text.includes("saas.orders_get(") || text === "ROLLBACK") throw new Error(PRIVATE_PROXY_SECRET);
    return [];
  });
  await assert.rejects(repository(new FakePool(rollbackFailure)).getOrder({
    tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID,
  }), orderError("unavailable"));
  assert.equal(rollbackFailure.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
  assert.deepEqual(rollbackFailure.releases, [true]);

  const releaseFailure = new FakeClient((text) => text.includes("saas.orders_get(")
    ? [{ outcome: "found", result_payload: detail() }]
    : [], new Error(PRIVATE_PROXY_SECRET));
  assert.deepEqual(await repository(new FakePool(releaseFailure)).getOrder({
    tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID,
  }), detail());
  assert.deepEqual(releaseFailure.releases, [undefined]);
});

test("unknown mutation COMMIT destroys the client, emits safe audit, and performs exactly one read-only recovery", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.orders_transition_status")) return [{ outcome: "committed", result_payload: mutationProjection() }];
    if (text === "COMMIT") throw new Error("connection lost after commit");
    return [];
  }, new Error(PRIVATE_PROXY_SECRET));
  const recovery = new FakeClient((text) => text.includes("saas.orders_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: mutationProjection() }]
    : []);
  const audits: unknown[] = [];
  const result = await repository(new FakePool(writer, recovery), { audit: (event) => { audits.push(event); } }).transitionStatus({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
    expectedVersion: 4, nextStatus: "shipped",
  });

  assert.equal(result.replayed, true);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audits, [{ type: "order_commit_unknown" }]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter(({ text }) => text.includes("orders_recover_operation")).length, 1);
  assert.equal(recovery.calls.some(({ text }) => text.includes("orders_transition_status")), false);
  const call = functionCall(recovery, "orders_recover_operation");
  assert.deepEqual(call.values, functionCall(writer, "orders_transition_status").values.slice(0, 9));
  assert.equal(recovery.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(recovery.releases, [undefined]);
});

test("failed recovery never reuses or rolls back either terminal unknown-outcome client", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.orders_transition_status")) return [{ outcome: "committed", result_payload: mutationProjection() }];
    if (text === "COMMIT") throw new Error("write commit response lost");
    return [];
  });
  const recovery = new FakeClient((text) => {
    if (text.includes("saas.orders_recover_operation")) return [{ outcome: "operation_replayed", result_payload: mutationProjection() }];
    if (text === "COMMIT") throw new Error("read commit response lost");
    return [];
  });
  await assert.rejects(repository(new FakePool(writer, recovery)).transitionStatus({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
    expectedVersion: 4, nextStatus: "shipped",
  }), orderError("unavailable"));
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(recovery.releases, [true]);
  assert.equal(writer.calls.some(({ text }) => text === "ROLLBACK"), false);
  assert.equal(recovery.calls.some(({ text }) => text === "ROLLBACK"), false);

  for (const recoveryStage of ["BEGIN READ ONLY", "FUNCTION", "ROLLBACK"] as const) {
    const failedWriter = new FakeClient((text) => {
      if (text.includes("saas.orders_transition_status")) return [{ outcome: "committed", result_payload: mutationProjection() }];
      if (text === "COMMIT") throw new Error(PRIVATE_PROXY_SECRET);
      return [];
    });
    const failedRecovery = new FakeClient((text) => {
      if (text === "BEGIN READ ONLY" && recoveryStage === "BEGIN READ ONLY") throw new Error(PRIVATE_PROXY_SECRET);
      if (text.includes("saas.orders_recover_operation")) {
        if (recoveryStage === "FUNCTION" || recoveryStage === "ROLLBACK") throw new Error(PRIVATE_PROXY_SECRET);
        return [{ outcome: "operation_replayed", result_payload: mutationProjection() }];
      }
      if (text === "ROLLBACK" && recoveryStage === "ROLLBACK") throw new Error(PRIVATE_PROXY_SECRET);
      return [];
    });
    await assert.rejects(repository(new FakePool(failedWriter, failedRecovery)).transitionStatus({
      tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
      expectedVersion: 4, nextStatus: "shipped",
    }), orderError("unavailable"));
    assert.deepEqual(failedWriter.releases, [true]);
    if (recoveryStage === "BEGIN READ ONLY") {
      assert.deepEqual(failedRecovery.releases, [true]);
      assert.equal(failedRecovery.calls.some(({ text }) => text === "ROLLBACK"), false);
    } else if (recoveryStage === "FUNCTION") {
      assert.deepEqual(failedRecovery.releases, [undefined]);
      assert.equal(failedRecovery.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
    } else {
      assert.deepEqual(failedRecovery.releases, [true]);
      assert.equal(failedRecovery.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
    }
    assert.equal(failedRecovery.calls.filter(({ text }) => text.includes("orders_recover_operation")).length, recoveryStage === "BEGIN READ ONLY" ? 0 : 1);
  }
});

test("row count, row shape, outcome, summary, detail, and mutation corruption fail closed", async () => {
  const unsafeRow = Object.assign(Object.create({ inherited: true }), {
    outcome: "summarized",
    result_payload: summary(),
  }) as Row;
  const hostileRow = new Proxy({ outcome: "summarized", result_payload: summary() }, {
    getPrototypeOf: () => { throw new Error(PRIVATE_PROXY_SECRET); },
  });
  const responses: Response[] = [
    { rows: [{ outcome: "summarized", result_payload: summary() }], rowCount: 0 },
    { rows: [{ outcome: "summarized", result_payload: summary(), private: STORE_ID }] },
    { rows: [unsafeRow] },
    { rows: [hostileRow] },
    { rows: [{ outcome: "invented", result_payload: summary() }] },
    { rows: [{ outcome: "summarized", result_payload: summary({ pendingOrders: 9 }) }] },
  ];
  for (const response of responses) {
    const client = new FakeClient((text) => text.includes("saas.orders_get_dashboard_summary") ? response : []);
    await assert.rejects(repository(new FakePool(client)).getDashboardSummary({ tenantContext: tenantContext(), now: NOW }), orderError("unavailable"));
  }

  const corruptDetail = new FakeClient((text) => text.includes("saas.orders_get(")
    ? [{ outcome: "found", result_payload: detail({ storeId: STORE_ID }) }]
    : []);
  await assert.rejects(repository(new FakePool(corruptDetail)).getOrder({ tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID }), orderError("unavailable"));

  const corruptMutation = new FakeClient((text) => text.includes("saas.orders_transition_status")
    ? [{ outcome: "committed", result_payload: mutationProjection({ id: NOTE_ID }) }]
    : []);
  await assert.rejects(repository(new FakePool(corruptMutation)).transitionStatus({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
    expectedVersion: 4, nextStatus: "shipped",
  }), orderError("unavailable"));
});

test("every public failure contains only its stable code and never private authority or input", async () => {
  const secrets = [PRIVATE_REQUEST_ID, PRIVATE_SUBJECT, STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, "driver-private-table"];
  const client = new FakeClient((text) => {
    if (text.includes("saas.orders_get(")) throw new Error(`driver-private-table ${STORE_ID} ${PRINCIPAL_ID}`);
    return [];
  });
  let caught: unknown;
  try {
    await repository(new FakePool(client)).getOrder({ tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID });
  } catch (error) {
    caught = error;
  }
  assert.equal(caught instanceof OrderRepositoryError, true);
  assert.equal((caught as OrderRepositoryError).message, "unavailable");
  for (const secret of secrets) assert.equal(String(caught).includes(secret), false);

  let invalid: unknown;
  try {
    await repository(new FakePool()).addNote({
      tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
      body: "private\ncustomer note",
    });
  } catch (error) {
    invalid = error;
  }
  assert.equal((invalid as OrderRepositoryError).message, "invalid_input");
  assert.equal(String(invalid).includes("customer note"), false);

  let generatorFailure: unknown;
  try {
    await repository(new FakePool(), {
      generateId: () => { throw new Error("private-id-generator-detail"); },
    }).addNote({
      tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID,
      body: "Gift wrap requested",
    });
  } catch (error) {
    generatorFailure = error;
  }
  assert.equal(generatorFailure instanceof OrderRepositoryError, true);
  assert.equal((generatorFailure as OrderRepositoryError).message, "unavailable");
  assert.equal(String(generatorFailure).includes("private-id-generator-detail"), false);
});

test("the finite error vocabulary is frozen and constructor policy rejects unsafe role or timeout configuration", () => {
  assert.deepEqual(ORDER_ERROR_CODES, [
    "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
    "feature_not_enabled", "order_not_found", "note_not_found", "draft_not_found",
    "draft_not_editable", "inventory_conflict", "catalog_conflict", "customer_conflict", "invalid_transition",
    "version_conflict", "operation_replayed", "operation_mismatch",
    "durable_authority_invalid", "unavailable",
  ]);
  assert.equal(Object.isFrozen(ORDER_ERROR_CODES), true);
  assert.throws(() => new PostgresOrderRepository({
    pool: new FakePool(), role: "owner" as never,
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    generateId: () => NOTE_ID, audit: () => undefined,
  }), orderError("unavailable"));
  assert.throws(() => repository(new FakePool(), {
    timeouts: { poolCheckoutMs: 0, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  }), orderError("unavailable"));
  assert.throws(() => new PostgresOrderRepository(new Proxy({} as never, {
    get: () => { throw new Error(PRIVATE_PROXY_SECRET); },
  })), orderError("unavailable"));
  assert.throws(() => new PostgresOrderRepository({
    pool: new FakePool(), role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    generateId: () => NOTE_ID, audit: () => undefined,
    privateToken: PRIVATE_PROXY_SECRET,
  } as never), orderError("unavailable"));
});
