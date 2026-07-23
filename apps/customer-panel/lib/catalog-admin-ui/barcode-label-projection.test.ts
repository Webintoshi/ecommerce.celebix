import assert from "node:assert/strict";
import test from "node:test";

import { projectBarcodeLabelProducts } from "./barcode-label-projection.ts";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VALID_VARIANT = "20000000-0000-4000-8000-000000000001";
const SECOND_VALID_VARIANT = "20000000-0000-4000-8000-000000000006";

test("server barcode projection serializes only exact label fields", () => {
  const rows = projectBarcodeLabelProducts([
    {
      product: {
        id: PRODUCT,
        title: "Çanta",
        storeId: "30000000-0000-4000-8000-000000000001",
        description: "must-not-cross",
        status: "active",
        currency: "TRY",
        version: 99,
        createdAt: "2026-07-22T18:00:00.000Z",
        updatedAt: "2026-07-22T18:00:00.000Z",
      },
      variants: [
        {
          id: VALID_VARIANT,
          title: "Siyah",
          sku: "CNT-1",
          barcode: "869000000001",
          storeId: "30000000-0000-4000-8000-000000000001",
          productId: PRODUCT,
          priceCents: 12500,
          costCents: 7000,
          stockTracking: true,
          stockQuantity: 8,
          attributes: { color: "secret-black" },
          version: 4,
          createdAt: "2026-07-22T18:00:00.000Z",
          updatedAt: "2026-07-22T18:00:00.000Z",
        },
      ],
    },
  ]);

  assert.deepEqual(rows, [
    {
      productId: PRODUCT,
      variantId: VALID_VARIANT,
      productTitle: "Çanta",
      variantTitle: "Siyah",
      sku: "CNT-1",
      barcode: "869000000001",
    },
  ]);
  assert.equal(Object.isFrozen(rows), true);
  assert.equal(Object.isFrozen(rows[0]), true);
  const serialized = JSON.stringify(rows);
  for (const forbidden of [
    "storeId", "description", "status", "currency", "priceCents", "costCents",
    "stockTracking", "stockQuantity", "attributes", "createdAt", "updatedAt", "version",
    "must-not-cross", "secret-black",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("mixed persisted barcodes omit each non-label code without suppressing valid rows", () => {
  const variants = [
    { id: VALID_VARIANT, title: "Geçerli", sku: "CNT-1", barcode: "ABC123" },
    { id: "20000000-0000-4000-8000-000000000002", title: "Eksik" },
    { id: "20000000-0000-4000-8000-000000000003", title: "Kısa", barcode: "12345" },
    { id: "20000000-0000-4000-8000-000000000004", title: "Tireli", barcode: "8690-0000" },
    { id: "20000000-0000-4000-8000-000000000005", title: "Uzun", barcode: "x".repeat(65) },
    { id: SECOND_VALID_VARIANT, title: "İkinci", barcode: "869000000002" },
  ];
  const rows = projectBarcodeLabelProducts([
    { product: { id: PRODUCT, title: "Çanta", privateAuthority: "never-cross" }, variants },
  ]);
  assert.deepEqual(rows.map((row) => row.variantId), [VALID_VARIANT, SECOND_VALID_VARIANT]);
  assert.deepEqual(rows.map((row) => row.barcode), ["ABC123", "869000000002"]);
  assert.equal(JSON.stringify(rows).includes("never-cross"), false);
});
