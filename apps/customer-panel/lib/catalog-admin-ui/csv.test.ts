import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogImportCsv } from "./csv.ts";

test("catalog CSV accepts canonical UTF-8 rows, CRLF, BOM and quoted commas", () => {
  const rows = parseCatalogImportCsv(
    '\uFEFFtitle,slug,priceCents,sku,stockQuantity\r\n"Keten, Gömlek",keten-gomlek,12900,KETEN-1,8\r\n"Çift ""Tırnak""",cift-tirnak,0,,0\r\n',
  );

  assert.deepEqual(rows, [
    {
      title: "Keten, Gömlek",
      slug: "keten-gomlek",
      priceCents: 12_900,
      sku: "KETEN-1",
      stockQuantity: 8,
    },
    {
      title: 'Çift "Tırnak"',
      slug: "cift-tirnak",
      priceCents: 0,
      stockQuantity: 0,
    },
  ]);
  assert.equal(Object.isFrozen(rows), true);
  assert.equal(Object.isFrozen(rows[0]), true);
});

test("catalog CSV rejects empty or non-canonical numeric cells", () => {
  for (const [price, stock] of [
    ["", "1"],
    ["1", ""],
    [" 1", "1"],
    ["1", "1 "],
    ["1e3", "1"],
    ["1", "+1"],
    ["01", "1"],
  ]) {
    assert.throws(
      () =>
        parseCatalogImportCsv(
          `title,slug,priceCents,sku,stockQuantity\nÜrün,urun-1,${price},SKU-1,${stock}`,
        ),
      /catalog_import_csv_invalid/,
    );
  }
});

test("catalog CSV enforces the same title, slug and SKU contract as persistence", () => {
  const invalidRows = [
    " Ürün,urun-1,1,SKU-1,1",
    "Ürün ,urun-1,1,SKU-1,1",
    "Ürün,x,1,SKU-1,1",
    `Ürün,${"a".repeat(101)},1,SKU-1,1`,
    "Ürün,Ürün-1,1,SKU-1,1",
    "Ürün,urun-1,1,sku-1,1",
    `Ürün,urun-1,1,${"A".repeat(65)},1`,
    `${"Ü".repeat(201)},urun-1,1,SKU-1,1`,
  ];

  for (const row of invalidRows) {
    assert.throws(
      () =>
        parseCatalogImportCsv(
          `title,slug,priceCents,sku,stockQuantity\n${row}`,
        ),
      /catalog_import_csv_invalid/,
    );
  }
});

test("catalog CSV rejects duplicate slug or SKU before any network mutation", () => {
  for (const csv of [
    "title,slug,priceCents,sku,stockQuantity\nA,urun-a,1,SKU-A,1\nB,urun-a,2,SKU-B,2",
    "title,slug,priceCents,sku,stockQuantity\nA,urun-a,1,SKU-A,1\nB,urun-b,2,SKU-A,2",
  ]) {
    assert.throws(() => parseCatalogImportCsv(csv), /catalog_import_csv_invalid/);
  }
});

test("catalog CSV rejects malformed quoting, blank rows and unsupported headers", () => {
  for (const csv of [
    '"title,slug,priceCents,sku,stockQuantity"\nA,urun-a,1,SKU-A,1',
    'title,slug,priceCents,sku,stockQuantity\n"A,urun-a,1,SKU-A,1',
    'title,slug,priceCents,sku,stockQuantity\nA"B,urun-a,1,SKU-A,1',
    "title,slug,priceCents,sku,stockQuantity\nA,urun-a,1,SKU-A,1\n\nB,urun-b,2,SKU-B,2",
    "slug,title,priceCents,sku,stockQuantity\nurun-a,A,1,SKU-A,1",
    "title,slug,priceCents,sku,stockQuantity\rA,urun-a,1,SKU-A,1",
  ]) {
    assert.throws(() => parseCatalogImportCsv(csv), /catalog_import_csv_invalid/);
  }
});
