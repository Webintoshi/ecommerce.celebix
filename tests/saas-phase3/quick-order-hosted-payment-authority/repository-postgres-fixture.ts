import assert from "node:assert/strict";

import pg from "pg";

import { PostgresQuickOrderLinkRepository } from "../../../packages/saas-data/src/quick-orders/index.ts";

const [socket, portText, database] = process.argv.slice(2);
assert.ok(socket);
assert.match(portText ?? "", /^\d{4,5}$/);
assert.ok(database);

const pool = new pg.Pool({
  host: socket,
  port: Number(portText),
  user: "postgres",
  database,
  max: 1,
});
const repository = new PostgresQuickOrderLinkRepository({
  pool,
  role: "celebix_saas_app",
  timeouts: { poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 },
  audit: () => undefined,
});
const address = Object.freeze({
  recipientName: "Ada Lovelace",
  phone: "+905551112233",
  line1: "Test 1",
  city: "Istanbul",
  postalCode: "34710",
  country: "TR",
});
const envelope = (keyId: string) => Object.freeze({
  algorithm: "A256GCM" as const,
  ciphertext: "AQ",
  iv: "AAAAAAAAAAAAAAAA",
  keyId,
  tag: "AAAAAAAAAAAAAAAAAAAAAA",
  version: 1 as const,
});

try {
  const result = await repository.create({
    tenantContext: {
      schemaVersion: 1,
      requestId: "repository-postgres-fixture",
      principal: {
        id: "20000000-0000-4000-8000-000000000057",
        issuer: "https://id.test",
        subject: "owner-a",
      },
      store: {
        id: "10000000-0000-4000-8000-000000000057",
        slug: "hosted-a",
        status: "active",
      },
      membership: {
        id: "30000000-0000-4000-8000-000000000057",
        role: "store_owner",
        status: "active",
      },
      entitlements: {
        schemaVersion: 1,
        planId: "00000000-0000-4000-8000-000000000001",
        planCode: "free_starter",
        version: 1,
        status: "active",
        features: ["catalog", "orders", "checkout"],
        limits: { products: 100, staff: 5, storageBytes: 1_024 },
        validFrom: "2026-07-27T00:00:00.000Z",
        validUntil: "2027-07-27T00:00:00.000Z",
      },
      locale: "tr-TR",
    },
    now: new Date("2026-07-27T12:00:00.000Z"),
    operationId: "90000000-0000-4000-8000-000000000010",
    linkId: "60000000-0000-4000-8000-000000000010",
    items: [{
      itemId: "80000000-0000-4000-8000-000000000010",
      variantId: "41000000-0000-4000-8000-000000000057",
      quantity: 1,
      itemType: "PHYSICAL",
    }],
    paymentMethodId: "50000000-0000-4000-8000-000000000057",
    buyerIdentity: {
      authority: "a".repeat(64),
      sealedIdentity: envelope("identity.current"),
    },
    customerName: "Repository Buyer",
    customerEmail: "repository@example.com",
    customerPhone: "+905551112233",
    shippingAddress: address,
    billingAddress: address,
    internalLabel: "repository-pg",
    shippingCents: 0,
    discountCents: 0,
    expiryHours: 24,
    tokenDigest: "b".repeat(64),
    sealedToken: envelope("quick.current"),
  });

  assert.deepEqual(result, {
    id: "60000000-0000-4000-8000-000000000010",
    status: "active",
    version: 1,
    expiresAt: "2026-07-28T12:00:00.000000Z",
    updatedAt: "2026-07-27T12:00:00.000000Z",
    replayed: false,
  });
  const persisted = await pool.query(`SELECT hosted.provider_code,item.item_type,link.customer_name
    FROM saas.quick_order_links AS link
    JOIN saas.quick_order_link_hosted_authorities AS hosted ON hosted.link_id=link.id
    JOIN saas.quick_order_link_items AS item ON item.quick_order_link_id=link.id
    WHERE link.id=$1`, [result.id]);
  assert.deepEqual(persisted.rows, [{
    provider_code: "iyzico_iframe",
    item_type: "PHYSICAL",
    customer_name: "Repository Buyer",
  }]);
  process.stdout.write("repository-hosted-create-committed\n");
} finally {
  await pool.end();
}
