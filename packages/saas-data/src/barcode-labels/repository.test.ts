import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import type { PostgresClientLike, PostgresPoolLike } from "../postgres/pool.ts";
import { PostgresBarcodeLabelRepository } from "./repository.ts";

const ID = (suffix: string) =>
  `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const now = new Date("2026-09-02T12:00:00.000Z");
const tenantContext = {
  schemaVersion: 1,
  requestId: "private",
  principal: {
    id: ID("2"),
    issuer: "https://id.test/oidc",
    subject: "private",
  },
  store: { id: ID("1"), slug: "store", status: "active" },
  membership: { id: ID("3"), role: "store_owner", status: "active" },
  entitlements: {
    schemaVersion: 1,
    planId: ID("4"),
    planCode: "growth",
    version: 1,
    status: "active",
    features: ["catalog"],
    limits: { products: 10000, staff: 10, storageBytes: 1000 },
    validFrom: now.toISOString(),
  },
  locale: "tr-TR",
} as TenantContext;

class Client implements PostgresClientLike {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  private readonly payload: unknown;
  constructor(payload: unknown) {
    this.payload = payload;
  }
  async query(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    return text.startsWith("SELECT outcome")
      ? ({
          rows: [{ outcome: "listed", result_payload: this.payload }],
          rowCount: 1,
        } as never)
      : ({ rows: [], rowCount: null } as never);
  }
  release() {}
}

test("list executes one projection statement and binds tenant query and page size", async () => {
  const payload = { items: [], catalogTotal: 1601, storeName: "Mağaza" };
  const client = new Client(payload);
  const pool: PostgresPoolLike = { connect: async () => client };
  const repository = new PostgresBarcodeLabelRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: {
      poolCheckoutMs: 100,
      statementMs: 1000,
      lockMs: 100,
      idleTransactionMs: 1000,
    },
    uuid: () => ID("9"),
    audit: () => undefined,
  });
  const result = await repository.list({
    tenantContext,
    now,
    query: { q: "altın", sort: "name-asc", pageSize: 50 },
  });
  assert.equal(result.catalogTotal, 1601);
  const domainQueries = client.queries.filter(({ text }) =>
    text.startsWith("SELECT outcome"),
  );
  assert.equal(domainQueries.length, 1);
  assert.match(domainQueries[0]!.text, /saas\.barcode_label_list/);
  assert.equal(domainQueries[0]!.values?.[0], tenantContext.store.id);
  assert.equal(domainQueries[0]!.values?.includes("altın"), true);
  assert.equal(domainQueries[0]!.values?.includes(50), true);
});

test("cursor is tenant and normalized-query bound", async () => {
  const row = {
    productId: ID("11"),
    productVersion: 1,
    variantId: ID("12"),
    variantVersion: 1,
    productTitle: "Altın",
    variantTitle: "Standart",
    sku: "SKU-1",
    barcode: "000ABC",
    priceCents: 100,
    currency: "TRY",
    stock: 2,
    trackInventory: true,
    attributes: {},
    status: "active",
    updatedAt: now.toISOString(),
  };
  const firstClient = new Client({
    items: [row],
    catalogTotal: 1,
    storeName: "Mağaza",
    nextAnchor: {
      sortNullRank: 0,
      sortValue: now.toISOString(),
      variantId: ID("12"),
    },
  });
  const first = new PostgresBarcodeLabelRepository({
    pool: { connect: async () => firstClient },
    role: "celebix_saas_app",
    timeouts: {
      poolCheckoutMs: 100,
      statementMs: 1000,
      lockMs: 100,
      idleTransactionMs: 1000,
    },
    uuid: () => ID("9"),
    audit: () => undefined,
  });
  const page = await first.list({
    tenantContext,
    now,
    query: { sort: "updated-desc", pageSize: 20 },
  });
  assert.ok(page.nextCursor);
  await assert.rejects(() =>
    first.list({
      tenantContext: {
        ...tenantContext,
        store: { ...tenantContext.store, id: ID("99") },
      },
      now,
      query: { sort: "updated-desc", pageSize: 20 },
      cursor: page.nextCursor,
    }),
  );
  await assert.rejects(() =>
    first.list({
      tenantContext,
      now,
      query: { sort: "name-asc", pageSize: 20 },
      cursor: page.nextCursor,
    }),
  );
});

test("write COMMIT uncertainty is audited and replayed with the same operation", async () => {
  const operationId = ID("50");
  const config = {
    sectorProfile: "retail" as const,
    paperType: "thermal-roll" as const,
    widthMm: 50,
    heightMm: 30,
    orientation: "portrait" as const,
    rows: 1,
    columns: 1,
    marginsMm: { top: 1, right: 1, bottom: 1, left: 1 },
    gapMm: { horizontal: 0, vertical: 0 },
    barcodeFormat: "code128" as const,
    barcodeSource: "barcode" as const,
    barcodeHeightMm: 8,
    showHumanReadable: false,
    currencyDisplay: "symbol" as const,
    fields: [
      {
        key: "barcodeSymbol" as const,
        visible: true,
        order: 0,
        align: "center" as const,
        fontSizePt: 8,
        maxLines: 1,
        autoShrink: false,
      },
    ],
  };
  const payload = {
    id: operationId,
    name: "Güvenli şablon",
    config,
    status: "active",
    isDefault: false,
    version: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const domainValues: unknown[][] = [];
  const releases: boolean[][] = [[], []];
  class CommitClient implements PostgresClientLike {
    private readonly index: number;
    private readonly outcome: string;
    constructor(index: number, outcome: string) {
      this.index = index;
      this.outcome = outcome;
    }
    async query(text: string, values?: unknown[]) {
      if (text.startsWith("SELECT outcome")) {
        domainValues.push(values ?? []);
        return {
          rows: [{ outcome: this.outcome, result_payload: payload }],
          rowCount: 1,
        } as never;
      }
      if (text === "COMMIT" && this.index === 0)
        throw new Error("connection lost after commit");
      return { rows: [], rowCount: null } as never;
    }
    release(destroy?: boolean) {
      releases[this.index]!.push(destroy === true);
    }
  }
  let connections = 0;
  let audits = 0;
  const repository = new PostgresBarcodeLabelRepository({
    pool: {
      connect: async () =>
        new CommitClient(
          connections,
          connections++ === 0 ? "saved" : "operation_replayed",
        ),
    },
    role: "celebix_saas_app",
    timeouts: {
      poolCheckoutMs: 100,
      statementMs: 1000,
      lockMs: 100,
      idleTransactionMs: 1000,
    },
    uuid: () => ID("9"),
    audit: ({ type }) => {
      assert.equal(type, "barcode_label_commit_unknown");
      audits += 1;
    },
  });
  const result = await repository.saveTemplate({
    tenantContext,
    now,
    operationId,
    name: payload.name,
    config,
    makeDefault: false,
  });
  assert.equal(result.id, operationId);
  assert.equal(connections, 2);
  assert.equal(audits, 1);
  assert.deepEqual(releases, [[true], [false]]);
  assert.equal(domainValues[0]![7], operationId);
  assert.equal(domainValues[1]![7], operationId);
  assert.deepEqual(domainValues[1], domainValues[0]);
});
