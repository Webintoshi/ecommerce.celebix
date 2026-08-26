import assert from "node:assert/strict";
import test from "node:test";

type InputModule = typeof import("./request-input.ts");
const input = await import("./request-input.ts").catch(() => ({} as Partial<InputModule>));

const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CREATE = {
  product: {
    slug: "atlas-mug",
    title: "Atlas Mug",
    description: "Catalog fixture",
    status: "draft",
    currency: "TRY",
  },
  initialVariant: {
    title: "Default",
    sku: "ATLAS-MUG-1",
    barcode: "8690000000001",
    priceCents: 12_500,
    compareAtCents: 15_000,
    costCents: 7_000,
    stockTracking: true,
    stockQuantity: 10,
    attributes: { color: "black" },
  },
};

function mutation(body: BodyInit, options: {
  contentType?: string | null;
  operationId?: string | null;
  headers?: HeadersInit;
} = {}) {
  const headers = new Headers(options.headers);
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json");
  if (options.operationId !== null) headers.set("idempotency-key", options.operationId ?? OPERATION_ID);
  return new Request("http://internal/api/catalog/products", { method: "POST", headers, body });
}

test("create-product input accepts exact JSON and canonicalizes through shared catalog contracts", async () => {
  assert.equal(typeof input.readCatalogMutationInput, "function");
  for (const contentType of ["application/json", "application/json; charset=utf-8", "application/json;charset=\"utf-8\""]) {
    const result = await input.readCatalogMutationInput?.(
      mutation(JSON.stringify(CREATE), { contentType }),
      "create_product",
    );
    assert.deepEqual(result, { kind: "valid", operationId: OPERATION_ID, value: CREATE });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result?.value), true);
    assert.equal(Object.isFrozen(result?.value.product), true);
    assert.equal(Object.isFrozen(result?.value.initialVariant.attributes), true);
  }
});

test("all mutation body shapes are exact and preserve no browser authority fields", async () => {
  const cases = [
    ["update_product", { expectedVersion: 1, product: CREATE.product }],
    ["archive_product", { expectedVersion: 1 }],
    ["restore_product", { expectedVersion: 2 }],
    ["create_variant", { variant: CREATE.initialVariant }],
    ["update_variant", { expectedVersion: 1, variant: CREATE.initialVariant }],
    ["archive_variant", { expectedVersion: 1 }],
  ] as const;
  for (const [kind, value] of cases) {
    assert.deepEqual(
      await input.readCatalogMutationInput?.(mutation(JSON.stringify(value)), kind),
      { kind: "valid", operationId: OPERATION_ID, value },
    );
  }
  for (const body of [
    { ...CREATE, storeId: PRODUCT_ID },
    { product: { ...CREATE.product, tenantId: PRODUCT_ID }, initialVariant: CREATE.initialVariant },
    { expectedVersion: 1, product: CREATE.product, principalId: PRODUCT_ID },
  ]) {
    assert.deepEqual(await input.readCatalogMutationInput?.(mutation(JSON.stringify(body)), "create_product"), { kind: "invalid" });
  }
});

test("invalid media types malformed JSON unsafe fields and body transport fail closed", async () => {
  for (const contentType of [
    null,
    "application/jwk-set+json",
    "application/problem+json",
    "application/*+json",
    "text/json",
    "text/plain",
    "application/json, text/plain",
    "application/json; charset=iso-8859-1",
    "application/json; boundary=x",
  ]) {
    assert.deepEqual(await input.readCatalogMutationInput?.(
      mutation(JSON.stringify(CREATE), { contentType }),
      "create_product",
    ), { kind: "invalid" });
  }
  for (const body of [
    "",
    "[]",
    "{",
    JSON.stringify({ ...CREATE, unknown: true }),
    JSON.stringify({ ...CREATE, product: { ...CREATE.product, title: " Atlas Mug" } }),
    JSON.stringify({ ...CREATE, initialVariant: { ...CREATE.initialVariant, priceCents: -1 } }),
    JSON.stringify({ ...CREATE, initialVariant: { ...CREATE.initialVariant, compareAtCents: 1 } }),
  ]) {
    assert.deepEqual(await input.readCatalogMutationInput?.(mutation(body), "create_product"), { kind: "invalid" });
  }
  assert.deepEqual(await input.readCatalogMutationInput?.(
    mutation(new Uint8Array([0xc3, 0x28])),
    "create_product",
  ), { kind: "invalid" });
  assert.deepEqual(await input.readCatalogMutationInput?.(
    mutation(JSON.stringify(CREATE), { headers: { "transfer-encoding": "chunked" } }),
    "create_product",
  ), { kind: "invalid" });
  assert.deepEqual(await input.readCatalogMutationInput?.(
    mutation(JSON.stringify(CREATE), { headers: { "content-length": "999999" } }),
    "create_product",
  ), { kind: "invalid" });
});

test("idempotency key is required once and must be a canonical UUID", async () => {
  for (const operationId of [null, "", PRODUCT_ID.toUpperCase(), `${OPERATION_ID},${PRODUCT_ID}`, "not-a-uuid"]) {
    assert.deepEqual(await input.readCatalogMutationInput?.(
      mutation(JSON.stringify(CREATE), { operationId }),
      "create_product",
    ), { kind: "invalid" });
  }
});

test("list query accepts bounded canonical options and rejects duplicate unknown or malformed values", () => {
  assert.equal(typeof input.readCatalogListInput, "function");
  for (const [query, expected] of [
    ["", { kind: "valid", value: { pageSize: 20 } }],
    ["?limit=100&status=archived&cursor=eyJ2IjoxfQ", { kind: "valid", value: { pageSize: 100, status: "archived", cursor: "eyJ2IjoxfQ" } }],
    [
      `?limit=40&q=${encodeURIComponent("  Son SKU  ")}&status=active&stock=in-stock&category=${PRODUCT_ID}&brand=${OPERATION_ID}&collection=${PRODUCT_ID}&sort=title-asc`,
      { kind: "valid", value: { pageSize: 40, search: "Son SKU", status: "active", stock: "in-stock", categoryId: PRODUCT_ID, brandId: OPERATION_ID, collectionId: PRODUCT_ID, sort: "title-asc" } },
    ],
    ["?q=+++", { kind: "valid", value: { pageSize: 20 } }],
  ] as const) {
    assert.deepEqual(input.readCatalogListInput?.(new Request(`http://internal/api/catalog/products${query}`)), expected);
  }
  for (const query of [
    "?limit=0", "?limit=101", "?limit=01", "?limit=1&limit=2", "?status=deleted",
    "?status=active&status=draft", "?cursor=bad%ZZ", "?cursor=a+b", "?storeId=x", "?unknown=x",
    "?%6cimit=20", "?%71=atlas", "?limit=20&", "?&limit=20", "?limit=20&&status=active",
    "?q=x&q=y", "?q=unsafe%00query", "?stock=hidden", "?category=foreign", "?brand=foreign",
    "?collection=foreign", "?sort=price-asc",
  ]) {
    assert.deepEqual(input.readCatalogListInput?.(new Request(`http://internal/api/catalog/products${query}`)), { kind: "invalid" });
  }
});

test("path identifiers accept only canonical UUIDs", () => {
  assert.equal(input.readCatalogPathId?.(PRODUCT_ID), PRODUCT_ID);
  for (const value of [undefined, "", PRODUCT_ID.toUpperCase(), "not-a-uuid"]) {
    assert.equal(input.readCatalogPathId?.(value), null);
  }
});
