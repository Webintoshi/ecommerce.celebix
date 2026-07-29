import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogCsv } from "./csv.ts";

const native = (row: string) => ({
  format: "native_csv" as const,
  content: `title,slug,priceCents,sku,stockQuantity\n${row}`,
});
const shopify = (row: string) => ({
  format: "shopify_csv" as const,
  content: `Handle,Title,Variant SKU,Variant Price,Variant Inventory Qty\n${row}`,
});

test("parses exact native and Shopify headers into canonical rows", () => {
  assert.deepEqual(parseCatalogCsv(native("Kahve,kahve,25000,KHV-1,5"))[0], {
    title: "Kahve", slug: "kahve", priceCents: 25000, sku: "KHV-1", stockQuantity: 5,
  });
  assert.deepEqual(parseCatalogCsv(shopify("kahve,Kahve,KHV-1,250.00,5"))[0], {
    title: "Kahve", slug: "kahve", priceCents: 25000, sku: "KHV-1", stockQuantity: 5,
  });
});

test("supports strict quoted fields and an absent SKU", () => {
  assert.deepEqual(parseCatalogCsv(native('"Türk, Kahvesi",turk-kahvesi,25000,,5'))[0], {
    title: "Türk, Kahvesi", slug: "turk-kahvesi", priceCents: 25000, stockQuantity: 5,
  });
  assert.equal(Object.isFrozen(parseCatalogCsv(native("Kahve,kahve,25000,KHV-1,5"))), true);
});

for (const format of ["native_csv", "shopify_csv"] as const) {
  test(`${format} enforces the consumed 3..100 slug boundary`, () => {
    const input = (slug: string) => format === "native_csv"
      ? native(`Kahve,${slug},25000,KHV-1,5`)
      : shopify(`${slug},Kahve,KHV-1,250.00,5`);
    assert.throws(() => parseCatalogCsv(input("aa")), /catalog_import_csv_invalid/);
    assert.equal(parseCatalogCsv(input("aaa"))[0]?.slug, "aaa");
    assert.equal(parseCatalogCsv(input("a".repeat(100)))[0]?.slug.length, 100);
    assert.throws(() => parseCatalogCsv(input("a".repeat(101))), /catalog_import_csv_invalid/);
  });
}

const hostile = [
  { name: "formula cell", input: native("=1+1,kahve,25000,KHV-1,5") },
  { name: "duplicate native slug", input: { format: "native_csv" as const, content: `${native("Kahve,kahve,25000,KHV-1,5").content}\nÇay,kahve,10000,CAY-1,2` } },
  { name: "duplicate Shopify handle", input: { format: "shopify_csv" as const, content: `${shopify("kahve,Kahve,KHV-1,250.00,5").content}\nkahve,Kahve 2,KHV-2,300.00,2` } },
  { name: "duplicate SKU", input: { format: "native_csv" as const, content: `${native("Kahve,kahve,25000,SKU-1,5").content}\nÇay,cay,10000,SKU-1,2` } },
  { name: "extra header", input: { format: "native_csv" as const, content: "title,slug,priceCents,sku,stockQuantity,extra\nKahve,kahve,25000,KHV-1,5,x" } },
  { name: "malformed quote", input: native('"Kahve,kahve,25000,KHV-1,5') },
  { name: "quote in unquoted cell", input: native('Kah"ve,kahve,25000,KHV-1,5') },
  { name: "control character", input: native("Kahve\t,kahve,25000,KHV-1,5") },
  { name: "quoted line break control", input: native('"Kahve\nYeni",kahve,25000,KHV-1,5') },
  { name: "more than 100 rows", input: { format: "native_csv" as const, content: `title,slug,priceCents,sku,stockQuantity\n${Array.from({ length: 101 }, (_, index) => `Ürün ${index},urun-${index},100,SKU-${index},1`).join("\n")}` } },
  { name: "more than 131072 UTF-8 bytes", input: native(`${"ü".repeat(70_000)},kahve,25000,KHV-1,5`) },
  { name: "exponent price", input: shopify("kahve,Kahve,KHV-1,2.5e2,5") },
  { name: "negative price", input: shopify("kahve,Kahve,KHV-1,-250.00,5") },
  { name: "comma decimal price", input: shopify('kahve,Kahve,KHV-1,"250,00",5') },
  { name: "fractional cents", input: shopify("kahve,Kahve,KHV-1,250.001,5") },
];

for (const example of hostile) {
  test(`rejects hostile CSV: ${example.name}`, () => {
    assert.throws(() => parseCatalogCsv(example.input), /catalog_import_csv_invalid/);
  });
}
