import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { compileWooCommerceMigration } from "./woocommerce-migration.ts";

const HEADERS = Object.freeze([
  "Kimlik", "Tür", "Stok kodu (SKU)", "GTIN, UPC, EAN veya ISBN", "İsim", "Yayımlanmış",
  "Öne çıkan?", "Katalogda görünürlük", "Kısa açıklama", "Açıklama",
  "İndirimli fiyatın başladığı tarih", "İndirimli fiyatın bittiği tarih", "Vergi durumu", "Vergi sınıfı",
  "Stokta?", "Stok", "Düşük stok miktarı", "Ön Siparişe İzin Ver?", "Ayrı ayrı mı satılıyor?",
  "Ağırlık (g)", "Uzunluk (cm)", "Genişlik (cm)", "Yükseklik (cm)",
  "Müşteri değerlendirmelerine izin verilsin mi?", "Satın alma notu", "İndirimli satış fiyatı",
  "Normal fiyat", "Kategoriler", "Etiketler", "Gönderim sınıfı", "Görseller", "İndirme sınırı",
  "İndirme sona erme günü", "Ebeveyn", "Gruplanmış ürünler", "Yukarı satışlar", "Çapraz satışlar",
  "Harici URL", "Düğme metni", "Konum", "Markalar",
]);

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function sourceRow(overrides: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return Object.freeze({
    Kimlik: "30794",
    Tür: "simple",
    "Stok kodu (SKU)": "yzk 1090",
    "GTIN, UPC, EAN veya ISBN": "100000014581",
    İsim: "14 Ayar Altın Ortası Taşlı Yüzük 1090",
    Yayımlanmış: "1",
    "Katalogda görünürlük": "visible",
    Açıklama: "<p>Taşlı <strong>altın</strong> yüzük.</p>",
    "Stokta?": "1",
    Stok: "1",
    "Ağırlık (g)": "2.35",
    "Normal fiyat": "11271",
    Kategoriler: "Taşlı Yüzükler, Yüzükler",
    Görseller: "https://guzidekuyumcu.com.tr/wp-content/uploads/front.png, https://guzidekuyumcu.com.tr/wp-content/uploads/side.jpg",
    Markalar: "Güzide Kuyumcu",
    ...overrides,
  });
}

function exportCsv(...rows: readonly Readonly<Record<string, string>>[]): string {
  return `${HEADERS.map(csvCell).join(",")}\n${rows.map((row) => HEADERS.map((header) => csvCell(row[header] ?? "")).join(",")).join("\n")}\n`;
}

test("compiles the localized WooCommerce export without losing gram weight or ordered images", async () => {
  const source = exportCsv(sourceRow());
  const manifest = await compileWooCommerceMigration(source);

  assert.equal(manifest.sourceDigest, createHash("sha256").update(source, "utf8").digest("hex"));
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.products), true);
  assert.equal(Object.isFrozen(manifest.products[0]?.sourceImages), true);
  assert.equal(manifest.mediaCount, 2);
  assert.deepEqual(manifest.categories, [
    { name: "Taşlı Yüzükler", slug: "tasli-yuzukler" },
    { name: "Yüzükler", slug: "yuzukler" },
  ]);
  assert.deepEqual(manifest.brands, [{ name: "Güzide Kuyumcu", slug: "guzide-kuyumcu" }]);
  assert.deepEqual(manifest.warningCounts, {
    availabilityStockMapped: 0,
    descriptionSanitized: 1,
    duplicateImagesRemoved: 0,
    missingImage: 0,
    missingPriceDrafted: 0,
  });
  assert.deepEqual(manifest.products[0], {
    sourceProductId: "30794",
    title: "14 Ayar Altın Ortası Taşlı Yüzük 1090",
    slug: "14-ayar-altin-ortasi-tasli-yuzuk-1090",
    description: "Taşlı altın yüzük.",
    status: "active",
    categorySlugs: ["tasli-yuzukler", "yuzukler"],
    brandSlugs: ["guzide-kuyumcu"],
    variants: [{
      title: "Varsayılan",
      sku: "YZK-1090",
      barcode: "100000014581",
      priceCents: 1_127_100,
      stockQuantity: 1,
      attributes: { "Ağırlık (g)": "2.35" },
    }],
    sourceImages: [
      "https://guzidekuyumcu.com.tr/wp-content/uploads/front.png",
      "https://guzidekuyumcu.com.tr/wp-content/uploads/side.jpg",
    ],
  });
  assert.deepEqual(manifest.batches, [["30794"]]);
});

test("drafts missing-price products and assigns deterministic source-id suffixes to duplicate title slugs", async () => {
  const source = exportCsv(
    sourceRow({ Kimlik: "10", "Normal fiyat": "", Görseller: "", Stok: "" }),
    sourceRow({ Kimlik: "11", "Stok kodu (SKU)": "yzk-1091", "GTIN, UPC, EAN veya ISBN": "100000014582" }),
  );
  const manifest = await compileWooCommerceMigration(source);

  assert.deepEqual(manifest.products.map(({ sourceProductId, slug, status, variants }) => ({
    sourceProductId,
    slug,
    status,
    priceCents: variants[0]?.priceCents,
  })), [
    { sourceProductId: "10", slug: "14-ayar-altin-ortasi-tasli-yuzuk-1090-10", status: "draft", priceCents: 0 },
    { sourceProductId: "11", slug: "14-ayar-altin-ortasi-tasli-yuzuk-1090-11", status: "active", priceCents: 1_127_100 },
  ]);
  assert.deepEqual(manifest.warningCounts, {
    availabilityStockMapped: 1,
    descriptionSanitized: 2,
    duplicateImagesRemoved: 0,
    missingImage: 1,
    missingPriceDrafted: 1,
  });
});

test("splits migration authority into deterministic batches of at most 25 products", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => sourceRow({
    Kimlik: String(index + 1),
    İsim: `Altın Ürün ${index + 1}`,
    "Stok kodu (SKU)": `SKU-${index + 1}`,
    "GTIN, UPC, EAN veya ISBN": String(8_680_000_000_000 + index),
  }));
  const manifest = await compileWooCommerceMigration(exportCsv(...rows));
  assert.deepEqual(manifest.batches.map((batch) => batch.length), [25, 1]);
  assert.equal(new Set(manifest.batches.flat()).size, 26);
});

test("normalizes WooCommerce description tabs without weakening identifier controls", async () => {
  const manifest = await compileWooCommerceMigration(exportCsv(sourceRow({
    Açıklama: "<p>Altın\türün açıklaması</p>",
  })));
  assert.equal(manifest.products[0]?.description, "Altın ürün açıklaması");
  await assert.rejects(
    () => compileWooCommerceMigration(exportCsv(sourceRow({ "Stok kodu (SKU)": "SKU\t1" }))),
    /woocommerce_migration_source_invalid/,
  );
});

test("preserves valid non-BMP description Unicode and rejects an unpaired surrogate", async () => {
  const manifest = await compileWooCommerceMigration(exportCsv(sourceRow({
    Açıklama: "<p>El işçiliği 💎</p>",
  })));
  assert.equal(manifest.products[0]?.description, "El işçiliği 💎");
  await assert.rejects(
    () => compileWooCommerceMigration(exportCsv(sourceRow({ İsim: `Bozuk ${String.fromCharCode(0xd800)}` }))),
    /woocommerce_migration_source_invalid/,
  );
});

test("normalizes carriage returns only inside quoted WooCommerce descriptions", async () => {
  const manifest = await compileWooCommerceMigration(exportCsv(sourceRow({
    Açıklama: "<p>Birinci satır</p>\r<p>İkinci satır</p>",
  })));
  assert.equal(manifest.products[0]?.description, "Birinci satır\n\nİkinci satır");
  const hostile = exportCsv(sourceRow()).replace("30794,simple", "30794\rsimple");
  await assert.rejects(() => compileWooCommerceMigration(hostile), /woocommerce_migration_source_invalid/);
});

test("canonicalizes Turkish and decimal WooCommerce SKUs without accepting arbitrary punctuation", async () => {
  const manifest = await compileWooCommerceMigration(exportCsv(
    sourceRow({ Kimlik: "1", İsim: "Çocuk Künyesi", "Stok kodu (SKU)": "ÇK 30", "GTIN, UPC, EAN veya ISBN": "1001" }),
    sourceRow({ Kimlik: "2", İsim: "Çizgili Yüzük", "Stok kodu (SKU)": "yzk 1,72", "GTIN, UPC, EAN veya ISBN": "1002" }),
  ));
  assert.deepEqual(manifest.products.map((product) => product.variants[0]?.sku), ["CK-30", "YZK-1.72"]);
  await assert.rejects(
    () => compileWooCommerceMigration(exportCsv(sourceRow({ "Stok kodu (SKU)": "SKU/1" }))),
    /woocommerce_migration_source_invalid/,
  );
});

test("preserves precise gram values while removing only insignificant trailing zeroes", async () => {
  const manifest = await compileWooCommerceMigration(exportCsv(sourceRow({ "Ağırlık (g)": "5.5560" })));
  assert.deepEqual(manifest.products[0]?.variants[0]?.attributes, { "Ağırlık (g)": "5.556" });
});

for (const [name, row] of [
  ["unsupported product type", sourceRow({ Tür: "variable" })],
  ["duplicate SKU", sourceRow({ Kimlik: "11" })],
  ["duplicate barcode", sourceRow({ Kimlik: "11", "Stok kodu (SKU)": "UNIQUE-11" })],
  ["credential-bearing image", sourceRow({ Görseller: "https://user:secret@guzidekuyumcu.com.tr/a.png" })],
  ["HTTP image", sourceRow({ Görseller: "http://guzidekuyumcu.com.tr/a.png" })],
  ["fragmented image", sourceRow({ Görseller: "https://guzidekuyumcu.com.tr/a.png#fragment" })],
  ["negative price", sourceRow({ "Normal fiyat": "-1" })],
  ["negative stock", sourceRow({ Stok: "-1" })],
  ["invalid gram quantity", sourceRow({ "Ağırlık (g)": "2,3,5" })],
] as const) {
  test(`rejects ${name}`, async () => {
    const source = name.startsWith("duplicate")
      ? exportCsv(sourceRow(), row)
      : exportCsv(row);
    await assert.rejects(() => compileWooCommerceMigration(source), /woocommerce_migration_source_invalid/);
  });
}

test("rejects more than sixteen images and oversized source bytes", async () => {
  const images = Array.from({ length: 17 }, (_, index) => `https://guzidekuyumcu.com.tr/${index}.png`).join(", ");
  await assert.rejects(() => compileWooCommerceMigration(exportCsv(sourceRow({ Görseller: images }))), /woocommerce_migration_source_invalid/);
  await assert.rejects(() => compileWooCommerceMigration(`${exportCsv(sourceRow())}${"x".repeat(4 * 1024 * 1024)}`), /woocommerce_migration_source_invalid/);
});
