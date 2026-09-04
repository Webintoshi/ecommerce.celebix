import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import {
  AnalyticsRepositoryError,
  PostgresAnalyticsRepository,
} from "./index.ts";

const STORE = "10000000-0000-4000-8000-000000000001",
  PRINCIPAL = "20000000-0000-4000-8000-000000000001",
  MEMBERSHIP = "30000000-0000-4000-8000-000000000001",
  PLAN = "00000000-0000-4000-8000-000000000001",
  CONNECTION = "40000000-0000-4000-8000-000000000001",
  WEBSITE = "50000000-0000-4000-8000-000000000001",
  OP = "60000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-26T12:00:00.000Z");
function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private",
    principal: { id: PRINCIPAL, issuer: "https://id.test", subject: "private" },
    store: { id: STORE, slug: "store", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["analytics"],
      limits: { products: 100, staff: 5, storageBytes: 1000 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}
type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;
class Client {
  calls: Array<{ text: string; values: unknown[] }> = [];
  releases: unknown[] = [];
  private responder: Responder;
  constructor(responder: Responder = () => []) {
    this.responder = responder;
  }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) {
    this.releases.push(value);
  }
}
class Pool {
  index = 0;
  private clients: Client[];
  constructor(clients: Client[]) {
    this.clients = clients;
  }
  async connect() {
    const value = this.clients[this.index++];
    if (!value) throw Error("checkout");
    return value;
  }
}
function authority(status = "active", version = 2) {
  return {
    connectionId: CONNECTION,
    websiteId: WEBSITE,
    hostname: "store.example.test",
    status,
    version,
    lastVerifiedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    replayed: false,
  };
}
function repo(pool: Pool, audit: string[] = []) {
  return new PostgresAnalyticsRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: {
      poolCheckoutMs: 100,
      statementMs: 500,
      lockMs: 300,
      idleTransactionMs: 700,
    },
    uuid: () => CONNECTION,
    audit: (event) => {
      audit.push(event.type);
    },
  });
}
function call(client: Client, name: string) {
  const found = client.calls.find((entry) =>
    entry.text.includes(`saas.${name}`),
  );
  assert.ok(found);
  return found;
}
function commercePayload(
  start: Date,
  end: Date,
  overrides: Record<string, unknown> = {},
) {
  const bucket = (currency: string) => ({
    currency,
    activeCarts: 2,
    candidateCarts: 1,
    eligibleCarts: 3,
    checkoutStarts: 2,
    eligibleCheckoutStarts: 2,
    checkoutAbandoned: 1,
    paymentFailures: 0,
    paidOrders: 1,
    grossRevenueMinor: 1200,
    refundedMinor: 0,
    abandonedCarts: 1,
    abandonedValueMinor: 1200,
    recoveredCarts: 0,
    recoveredGrossMinor: 0,
    recoveredRefundedMinor: 0,
    recoveredNetMinor: 0,
  });
  return {
    schemaVersion: 1,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    currencies: [
      {
        ...bucket("TRY"),
        paidOrders: 4,
        grossRevenueMinor: 250000,
        refundedMinor: 10000,
        recoveredCarts: 1,
        recoveredGrossMinor: 50000,
        recoveredRefundedMinor: 10000,
        recoveredNetMinor: 40000,
      },
      bucket("USD"),
    ],
    attribution: [
      {
        touch: "last",
        source: "atlas-qa",
        medium: "test",
        campaign: "cart-recovery",
        currency: "TRY",
        paidOrders: 4,
        grossRevenueMinor: 250000,
        abandonedCarts: 3,
        recoveredRevenueMinor: 50000,
      },
    ],
    products: [
      {
        productId: "40000000-0000-4000-8000-000000000001",
        title: "Ürün",
        currency: "TRY",
        categoryId: null,
        categoryName: null,
        brandId: null,
        brandName: null,
        checkoutStarts: 0,
        paidOrders: 0,
        quantity: 4,
        revenueMinor: 250000,
        abandonedAppearances: 0,
        recoveredRevenueMinor: 0,
      },
    ],
    productPage: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    cartPage: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    series: [],
    carts: [],
    worker: {
      pending: 2,
      claimed: 1,
      retry: 1,
      deadLetter: 0,
      oldestPendingSeconds: 31,
      lastSuccessfulDelivery: "2026-07-25T23:59:00.000Z",
      deliveryLatencyMilliseconds: 275,
    },
    ...overrides,
  };
}

test("connection read uses the exact seven-field authority and freezes its projection", async () => {
  const client = new Client((text) =>
    text.includes("analytics_connection_get")
      ? [{ outcome: "found", result_payload: authority() }]
      : [],
  );
  const result = await repo(new Pool([client])).getConnection({
    tenantContext: tenant(),
    now: NOW,
  });
  assert.deepEqual(call(client, "analytics_connection_get").values, [
    STORE,
    PRINCIPAL,
    MEMBERSHIP,
    PLAN,
    "growth",
    2,
    NOW,
  ]);
  assert.deepEqual(result, {
    schemaVersion: 1,
    provider: "umami",
    status: "active",
    configured: true,
    hostname: "store.example.test",
    version: 2,
    lastVerifiedAt: NOW.toISOString(),
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
});
test("commerce snapshot uses tenant authority and preserves currency-separated PostgreSQL truth", async () => {
  const start = new Date("2026-07-01T00:00:00.000Z"),
    end = new Date("2026-07-26T00:00:00.000Z");
  const payload = commercePayload(start, end);
  const client = new Client((text) =>
    text.includes("commerce_analytics_snapshot")
      ? [{ outcome: "resolved", result_payload: payload }]
      : [],
  );
  const result = await repo(new Pool([client])).commerceSnapshot({
    tenantContext: tenant(),
    now: NOW,
    rangeStart: start,
    rangeEnd: end,
  });
  assert.deepEqual(call(client, "commerce_analytics_snapshot").values, [
    STORE,
    PRINCIPAL,
    MEMBERSHIP,
    PLAN,
    "growth",
    2,
    NOW,
    start,
    end,
    "{}",
  ]);
  assert.deepEqual(result, payload);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.currencies), true);
});
async function cartSnapshot(cart: Record<string, unknown>) {
  const start = new Date("2026-07-01T00:00:00.000Z"),
    end = new Date("2026-07-26T00:00:00.000Z"),
    payload = commercePayload(start, end, {
      carts: [cart],
      cartPage: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    }),
    client = new Client((text) =>
      text.includes("commerce_analytics_snapshot")
        ? [{ outcome: "resolved", result_payload: payload }]
        : [],
    );

  return repo(new Pool([client])).commerceSnapshot({
    tenantContext: tenant(),
    now: NOW,
    rangeStart: start,
    rangeEnd: end,
    filters: { view: "abandoned-carts" },
  });
}
const CART = Object.freeze({
  id: "70000000-0000-4000-8000-000000000001",
  customerLabel: "Anonim ziyaretçi",
  productSummary: "Ürün",
  subtotalMinor: 1200,
  discountMinor: 0,
  shippingMinor: 0,
  totalMinor: 1200,
  currency: "TRY",
  lastActivityAt: "2026-07-25T23:00:00.000Z",
  source: "unknown",
  device: "unknown",
  lifecycle: "active",
  contactable: false,
  contacted: false,
});
test("commerce snapshot preserves a nullable abandonedAt key", async () => {
  const result = await cartSnapshot({ ...CART, campaign: null });

  assert.deepEqual(result.carts[0], {
    ...CART,
    abandonedAt: null,
    campaign: null,
  });
  assert.equal(Object.isFrozen(result.carts[0]), true);
});
test("commerce snapshot preserves a nullable campaign key", async () => {
  const result = await cartSnapshot({ ...CART, abandonedAt: null });

  assert.deepEqual(result.carts[0], {
    ...CART,
    abandonedAt: null,
    campaign: null,
  });
  assert.equal(Object.isFrozen(result.carts[0]), true);
});
test("commerce snapshot rejects an inverted or over-thirteen-month range before SQL", async () => {
  const repository = repo(new Pool([]));
  await assert.rejects(
    () =>
      repository.commerceSnapshot({
        tenantContext: tenant(),
        now: NOW,
        rangeStart: new Date("2026-07-26T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-01T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof AnalyticsRepositoryError &&
      error.code === "invalid_input",
  );
  await assert.rejects(
    () =>
      repository.commerceSnapshot({
        tenantContext: tenant(),
        now: NOW,
        rangeStart: new Date("2025-01-01T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-01T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof AnalyticsRepositoryError &&
      error.code === "invalid_input",
  );
});
test("commerce settings read uses its dedicated configuration authority function", async () => {
  const settings = {
      candidateInactivityMinutes: 30,
      abandonedInactivityHours: 24,
      recoveryLinkHours: 72,
      automaticRecoveryEnabled: false,
      maximumMessageAttempts: 3,
      minimumMessageIntervalHours: 6,
      trackingPolicy: "anonymous_commerce",
      version: 1,
    } as const,
    client = new Client((text) =>
      text.includes("commerce_analytics_settings_get")
        ? [{ outcome: "resolved", result_payload: settings }]
        : [],
    );
  const result = await repo(new Pool([client])).commerceSettings({
    tenantContext: tenant(),
    now: NOW,
  });
  assert.deepEqual(result, settings);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(call(client, "commerce_analytics_settings_get").values, [
    STORE,
    PRINCIPAL,
    MEMBERSHIP,
    PLAN,
    "growth",
    2,
    NOW,
  ]);
});
test("commerce settings update is version-fenced and carries no provider authority", async () => {
  const settings = {
    candidateInactivityMinutes: 45,
    abandonedInactivityHours: 30,
    recoveryLinkHours: 48,
    automaticRecoveryEnabled: false,
    maximumMessageAttempts: 2,
    minimumMessageIntervalHours: 12,
    trackingPolicy: "anonymous_commerce" as const,
  };
  const client = new Client((text) =>
    text.includes("commerce_analytics_settings_update")
      ? [{ outcome: "committed", result_payload: { ...settings, version: 3 } }]
      : [],
  );
  const result = await repo(new Pool([client])).updateCommerceSettings({
    tenantContext: tenant(),
    now: NOW,
    expectedVersion: 2,
    ...settings,
  });
  assert.deepEqual(call(client, "commerce_analytics_settings_update").values, [
    STORE,
    PRINCIPAL,
    MEMBERSHIP,
    PLAN,
    "growth",
    2,
    NOW,
    2,
    45,
    30,
    48,
    false,
    2,
    12,
    "anonymous_commerce",
  ]);
  assert.deepEqual(result, { ...settings, version: 3 });
  assert.equal(Object.isFrozen(result), true);
});
test("known durable authority outcomes map to typed errors", async () => {
  for (const code of ["membership_denied", "feature_not_enabled"]) {
    const client = new Client((text) =>
      text.includes("analytics_connection_get")
        ? [{ outcome: code, result_payload: null }]
        : [],
    );
    await assert.rejects(
      () =>
        repo(new Pool([client])).getConnection({
          tenantContext: tenant(),
          now: NOW,
        }),
      (error: unknown) =>
        error instanceof AnalyticsRepositoryError && error.code === code,
    );
  }
});
test("begin generates exact IDs, canonical fingerprint parameters, and immutable output", async () => {
  const client = new Client((text) =>
    text.includes("analytics_connection_begin")
      ? [{ outcome: "pending", result_payload: authority("pending", 1) }]
      : [],
  );
  const result = await repo(new Pool([client])).beginConnection({
    tenantContext: tenant(),
    now: NOW,
    operationId: OP,
    connectionId: CONNECTION,
    websiteId: WEBSITE,
  });
  const values = call(client, "analytics_connection_begin").values;
  assert.deepEqual(values.slice(0, 7), [
    STORE,
    PRINCIPAL,
    MEMBERSHIP,
    PLAN,
    "growth",
    2,
    NOW,
  ]);
  assert.equal(values[7], OP);
  assert.match(String(values[8]), /^[a-f0-9]{64}$/);
  assert.deepEqual(values.slice(9), [CONNECTION, WEBSITE]);
  assert.equal(result.outcome, "pending");
  assert.equal(Object.isFrozen(result), true);
});
test("activate and disable use distinct fingerprints and disable reads current authority first", async () => {
  const activateClient = new Client((text) =>
    text.includes("analytics_connection_activate")
      ? [{ outcome: "active", result_payload: authority() }]
      : [],
  );
  await repo(new Pool([activateClient])).activateConnection({
    tenantContext: tenant(),
    now: NOW,
    operationId: OP,
    connectionId: CONNECTION,
    websiteId: WEBSITE,
    verifiedHostname: "store.example.test",
  });
  const activate = call(activateClient, "analytics_connection_activate");
  const reader = new Client((text) =>
    text.includes("analytics_connection_get")
      ? [{ outcome: "found", result_payload: authority() }]
      : [],
  );
  const writer = new Client((text) =>
    text.includes("analytics_connection_disable")
      ? [{ outcome: "disabled", result_payload: authority("disabled", 3) }]
      : [],
  );
  await repo(new Pool([reader, writer])).disableConnection({
    tenantContext: tenant(),
    now: NOW,
    operationId: OP,
    expectedVersion: 2,
  });
  const disable = call(writer, "analytics_connection_disable");
  assert.notEqual(activate.values[8], disable.values[8]);
  assert.deepEqual(disable.values.slice(9), [CONNECTION, 2]);
});
test("pool acquisition failure is sanitized", async () => {
  await assert.rejects(
    () =>
      repo(new Pool([])).getConnection({ tenantContext: tenant(), now: NOW }),
    (error: unknown) =>
      error instanceof AnalyticsRepositoryError && error.code === "unavailable",
  );
});
test("known pre-commit failure rolls back and preserves the typed error", async () => {
  const client = new Client((text) =>
    text.includes("analytics_connection_activate")
      ? [{ outcome: "hostname_mismatch", result_payload: null }]
      : [],
  );
  await assert.rejects(
    () =>
      repo(new Pool([client])).activateConnection({
        tenantContext: tenant(),
        now: NOW,
        operationId: OP,
        connectionId: CONNECTION,
        websiteId: WEBSITE,
        verifiedHostname: "store.example.test",
      }),
    (error: unknown) =>
      error instanceof AnalyticsRepositoryError &&
      error.code === "hostname_mismatch",
  );
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(client.releases, [undefined]);
});
test("commit unknown performs one read-only recovery and never repeats activation", async () => {
  let commits = 0;
  const writer = new Client((text) => {
    if (text.includes("analytics_connection_activate"))
      return [{ outcome: "active", result_payload: authority() }];
    if (text === "COMMIT" && commits++ === 0) throw Error("wire");
    return [];
  });
  const recovery = new Client((text) =>
      text.includes("analytics_connection_recover_operation")
        ? [
            {
              outcome: "operation_recovered",
              result_payload: { ...authority(), replayed: true },
            },
          ]
        : [],
    ),
    audit: string[] = [];
  const result = await repo(
    new Pool([writer, recovery]),
    audit,
  ).activateConnection({
    tenantContext: tenant(),
    now: NOW,
    operationId: OP,
    connectionId: CONNECTION,
    websiteId: WEBSITE,
    verifiedHostname: "store.example.test",
  });
  assert.equal(result.replayed, true);
  assert.equal(
    writer.calls.filter((entry) =>
      entry.text.includes("analytics_connection_activate"),
    ).length,
    1,
  );
  assert.equal(
    recovery.calls.filter((entry) =>
      entry.text.includes("analytics_connection_recover_operation"),
    ).length,
    1,
  );
  assert.equal(
    recovery.calls.some((entry) =>
      entry.text.includes("analytics_connection_activate"),
    ),
    false,
  );
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["analytics_commit_unknown"]);
});
test("recovery mismatch stays unavailable without a second write", async () => {
  const writer = new Client((text) => {
    if (text.includes("analytics_connection_activate"))
      return [{ outcome: "active", result_payload: authority() }];
    if (text === "COMMIT") throw Error("wire");
    return [];
  });
  const recovery = new Client((text) =>
    text.includes("analytics_connection_recover_operation")
      ? [{ outcome: "operation_mismatch", result_payload: null }]
      : [],
  );
  await assert.rejects(
    () =>
      repo(new Pool([writer, recovery])).activateConnection({
        tenantContext: tenant(),
        now: NOW,
        operationId: OP,
        connectionId: CONNECTION,
        websiteId: WEBSITE,
        verifiedHostname: "store.example.test",
      }),
    (error: unknown) =>
      error instanceof AnalyticsRepositoryError &&
      error.code === "operation_mismatch",
  );
  assert.equal(
    writer.calls.filter((entry) =>
      entry.text.includes("analytics_connection_activate"),
    ).length,
    1,
  );
});
