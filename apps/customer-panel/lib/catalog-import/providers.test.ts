import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_IMPORT_PROVIDERS,
  buildCatalogImportTemplate,
  parseCatalogImportSource,
} from "./providers.ts";

const providerFixtures = Object.freeze([
  ["woocommerce", "Name,Slug,Regular price,SKU,Stock,Published\nWoo Ürün,woo-urun,129.90,WOO-1,8,1"],
  ["ideasoft", "Urun Adi,Seo Link,Fiyat,Stok Kodu,Stok Adedi\nIdea Ürün,idea-urun,139.90,IDEA-1,9"],
  ["ticimax", "Urun Adi,SEO Url,Satis Fiyati,Stok Kodu,Stok,Varyant\nTicimax Ürün,ticimax-urun,149.90,TICI-1,10,Standart"],
  ["tsoft", "Urun Adi,Seo,Fiyat,Stok Kodu,Stok,Varyant\nT-Soft Ürün,tsoft-urun,159.90,TSOFT-1,11,Standart"],
  ["ikas", "name,slug,price,sku,inventory,status,variant\nikas Ürün,ikas-urun,169.90,IKAS-1,12,active,Standart"],
  ["opencart", "name,seo_keyword,price,sku,quantity,status,model\nOpenCart Ürün,opencart-urun,179.90,OPEN-1,13,1,Standart"],
  ["prestashop", "Name,URL rewritten,Price tax excluded,Reference,Quantity,Active,Supplier reference\nPresta Ürün,presta-urun,189.90,PRESTA-1,14,1,Standart"],
  ["magento", "name,url_key,price,sku,qty,product_online,weight\nMagento Ürün,magento-urun,199.90,MAG-1,15,1,450"],
  ["bigcommerce", "Product Name,Product URL,Price,Product Code/SKU,Current Stock,Visible,Option Set\nBig Ürün,big-urun,209.90,BIG-1,16,Y,Standart"],
  ["wix", "Name,Slug,Price,SKU,Inventory,In Stock,Option Value\nWix Ürün,wix-urun,219.90,WIX-1,17,TRUE,Standart"],
  ["generic", "urun_adi;slug;fiyat;sku;stok;varyant\nGenel Ürün;genel-urun;229,90;GEN-1;18;Standart"],
] as const);

test("all twelve Hemenaku platform adapters expose templates and canonical products", () => {
  assert.deepEqual(
    CATALOG_IMPORT_PROVIDERS.map(({ id }) => id),
    [
      "woocommerce", "shopify", "ideasoft", "ticimax", "tsoft", "ikas",
      "opencart", "prestashop", "magento", "bigcommerce", "wix", "generic",
    ],
  );

  for (const [provider, csv] of providerFixtures) {
    const parsed = parseCatalogImportSource(csv, { provider, format: "csv" });
    assert.equal(parsed.products.length, 1, provider);
    assert.equal(parsed.products[0]?.variants.length, 1, provider);
    assert.ok((parsed.products[0]?.variants[0]?.priceCents ?? 0) > 0, provider);
    const template = buildCatalogImportTemplate(provider);
    assert.match(template, /\n/);
    assert.equal(parseCatalogImportSource(template, { provider, format: "csv" }).products.length, 1, `${provider} template`);
  }

  assert.match(buildCatalogImportTemplate("shopify"), /^Handle,Title,/);
});

test("Shopify rows group by exact handle and retain variants, pricing, inventory and attributes", () => {
  const csv = [
    "Handle,Title,Body (HTML),Published,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty,Variant Barcode,Status",
    'deri-kordon,Deri Kordon,"<p>El yapımı</p>",TRUE,Renk,Siyah,DK-SYH,1499,1699,15,8680000000001,active',
    "deri-kordon,,,TRUE,Renk,Taba,DK-TABA,1599,,7,8680000000002,active",
  ].join("\n");

  const parsed = parseCatalogImportSource(csv, { provider: "shopify", format: "csv" });

  assert.deepEqual(parsed.products, [
    {
      title: "Deri Kordon",
      slug: "deri-kordon",
      description: "El yapımı",
      status: "active",
      variants: [
        { title: "Siyah", sku: "DK-SYH", barcode: "8680000000001", priceCents: 149900, compareAtCents: 169900, stockQuantity: 15, attributes: { Renk: "Siyah" } },
        { title: "Taba", sku: "DK-TABA", barcode: "8680000000002", priceCents: 159900, stockQuantity: 7, attributes: { Renk: "Taba" } },
      ],
    },
  ]);
  assert.equal(Object.isFrozen(parsed.products), true);
  assert.equal(Object.isFrozen(parsed.products[0]?.variants), true);
});

test("provider discount columns preserve the sale price and regular compare-at price", () => {
  for (const [provider, csv] of [
    ["woocommerce", "Name,Slug,Regular price,Sale price,SKU,Stock,Published\nİndirimli Woo,indirimli-woo,100,80,WOO-SALE,3,1"],
    ["tsoft", "Urun Adi,Seo,Fiyat,Indirimli Fiyat,Stok Kodu,Stok\nİndirimli Tsoft,indirimli-tsoft,100,80,TSOFT-SALE,3"],
    ["wix", "Name,Slug,Price,Discounted Price,SKU,Inventory,In Stock\nİndirimli Wix,indirimli-wix,100,80,WIX-SALE,3,TRUE"],
  ] as const) {
    const variant = parseCatalogImportSource(csv, { provider, format: "csv" }).products[0]?.variants[0];
    assert.equal(variant?.priceCents, 8_000, provider);
    assert.equal(variant?.compareAtCents, 10_000, provider);
  }
});

test("OpenCart numeric status imports only enabled products as active", () => {
  const parsed = parseCatalogImportSource(
    "name,seo_keyword,price,sku,quantity,status,model\nAçık Ürün,acik-urun,100,OPEN-ON,3,1,Standart\nKapalı Ürün,kapali-urun,100,OPEN-OFF,3,0,Standart",
    { provider: "opencart", format: "csv" },
  );
  assert.equal(parsed.skippedRows, 1);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0]?.status, "active");
  assert.equal(parsed.products[0]?.variants[0]?.sku, "OPEN-ON");
});

test("canonical Celebix CSV remains backward compatible and treats priceCents as cents", () => {
  const parsed = parseCatalogImportSource(
    '\uFEFFtitle,slug,priceCents,sku,stockQuantity\r\n"Keten, Gömlek",keten-gomlek,12900,KETEN-1,8\r\n',
    { provider: "generic", format: "csv" },
  );

  assert.deepEqual(parsed.products, [{
    title: "Keten, Gömlek",
    slug: "keten-gomlek",
    status: "draft",
    variants: [{ title: "Varsayılan", sku: "KETEN-1", priceCents: 12900, stockQuantity: 8, attributes: {} }],
  }]);
});

test("generic JSON and XML feeds use the same canonical product contract", () => {
  const json = parseCatalogImportSource(JSON.stringify({ products: [{ name: "JSON Ürün", slug: "json-urun", price: "249.90", sku: "JSON-1", stock: 4 }] }), { provider: "generic", format: "json" });
  const xml = parseCatalogImportSource("<products><product><name>XML Ürün</name><slug>xml-urun</slug><price>259.90</price><sku>XML-1</sku><stock>5</stock></product></products>", { provider: "generic", format: "xml" });

  assert.equal(json.products[0]?.variants[0]?.priceCents, 24990);
  assert.equal(json.products[0]?.variants[0]?.sku, "JSON-1");
  assert.equal(xml.products[0]?.title, "XML Ürün");
  assert.equal(xml.products[0]?.variants[0]?.stockQuantity, 5);
});

test("disabled rows are skipped and unsupported source fields produce a truthful warning", () => {
  const parsed = parseCatalogImportSource(
    "name,slug,price,sku,inventory,status,images,tags\nKapalı,kapali,10,KAPALI-1,1,draft,https://cdn.example/a.jpg,etiket\nAçık,acik-urun,20,ACIK-1,2,active,https://cdn.example/b.jpg,etiket",
    { provider: "ikas", format: "csv" },
  );

  assert.equal(parsed.skippedRows, 1);
  assert.equal(parsed.products.length, 1);
  assert.deepEqual(parsed.warnings, ["unsupported_fields_ignored"]);
});

test("malformed, duplicate and over-limit sources fail before producing an import payload", () => {
  const invalid = [
    'title,slug,priceCents,sku,stockQuantity\n"A,a,1,A-1,1',
    "title,slug,priceCents,sku,stockQuantity\nA,urun-a,1,DUP-1,1\nB,urun-b,2,DUP-1,2",
    "title,slug,priceCents,sku,stockQuantity\nA,urun-a,-1,A-1,1",
    "title,slug,priceCents,sku,stockQuantity\nA,../evil,1,A-1,1",
  ];
  for (const source of invalid) {
    assert.throws(
      () => parseCatalogImportSource(source, { provider: "generic", format: "csv" }),
      /catalog_import_source_invalid/,
    );
  }

  const tooMany = ["title,slug,priceCents,sku,stockQuantity", ...Array.from({ length: 101 }, (_, index) => `Ürün ${index},urun-${index},1,SKU-${index},1`)].join("\n");
  assert.throws(() => parseCatalogImportSource(tooMany, { provider: "generic", format: "csv" }), /catalog_import_source_invalid/);
  assert.throws(() => parseCatalogImportSource("[]", { provider: "unknown" as never, format: "json" }), /catalog_import_source_invalid/);
});
